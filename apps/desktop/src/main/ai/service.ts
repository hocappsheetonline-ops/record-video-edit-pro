import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  findFillerWords,
  findSilences,
  indexedTranscript,
  initialClips,
  planAudio,
  sourceDuration,
  timestampedTranscript,
  TRANSCRIPT_FILE,
  wordsToRanges,
  type CutSuggestion,
  type Project,
  type Transcript,
  type TranscriptWord,
} from '@lumora/core'
import type { AiSummary } from '@shared/ipc'
import { buildSpeechAudioArgs } from '../ffmpeg/args'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { writeJsonFile } from '../json-file'
import type { FetchLike } from '../key-validation'
import {
  askJson,
  createClaude,
  CUTS_SCHEMA,
  CUTS_SYSTEM,
  SUMMARY_SCHEMA,
  summarySystem,
  TRANSLATE_SCHEMA,
  translateSystem,
  type CutResponse,
  type SummaryResponse,
  type TranslateResponse,
} from './claude'
import { transcribeFile } from './elevenlabs'

export const AI_FILE = 'ai.json'

export class MissingKeyError extends Error {
  constructor(readonly key: 'elevenlabs' | 'anthropic') {
    super(`missing_key:${key}`)
    this.name = 'MissingKeyError'
  }
}

export interface AiDeps {
  getKey(key: 'elevenlabs' | 'anthropic'): Promise<string | undefined>
  run: FfmpegRunner
  fetchImpl?: FetchLike
}

function parseTranscript(value: unknown): Transcript | null {
  if (typeof value !== 'object' || value === null) return null
  const t = value as Record<string, unknown>
  if (!Array.isArray(t.words)) return null
  const words = t.words.filter(
    (w): w is TranscriptWord =>
      typeof w === 'object' &&
      w !== null &&
      typeof (w as TranscriptWord).text === 'string' &&
      typeof (w as TranscriptWord).start === 'number' &&
      typeof (w as TranscriptWord).end === 'number',
  )
  return { language: typeof t.language === 'string' ? t.language : '', words }
}

/** Các tính năng AI: phụ đề (ElevenLabs) và biên tập, tóm tắt, dịch (Claude). */
export class AiService {
  constructor(private readonly deps: AiDeps) {}

  private async key(name: 'elevenlabs' | 'anthropic'): Promise<string> {
    const key = await this.deps.getKey(name)
    if (!key) throw new MissingKeyError(name)
    return key
  }

  /** Nhận dạng giọng nói của cả bản quay; thời gian từng từ tính theo thời gian nguồn. */
  async transcribe(project: Project, dir: string, language?: string): Promise<Transcript> {
    const apiKey = await this.key('elevenlabs')
    const hasMic = project.segments.some((s) => s.tracks.mic)
    const pieces = planAudio(project, initialClips(project), { mic: 1, system: hasMic ? 0 : 1 })
    if (pieces.length === 0) throw new Error('no_audio')
    const audio = join(dir, '.speech.mp3')
    try {
      const result = await this.deps.run(
        buildSpeechAudioArgs({
          pieces: pieces.map((p) => ({ ...p, path: join(dir, p.file), speed: 1, volume: 1 })),
          durationS: sourceDuration(project.segments) / 1000,
          output: audio,
        }),
        600_000,
      )
      if (result.code !== 0)
        throw new Error(`Không chuẩn bị được âm thanh: ${result.stderr.slice(-300)}`)
      const transcript = await transcribeFile(audio, apiKey, {
        language,
        fetchImpl: this.deps.fetchImpl,
      })
      await writeJsonFile(join(dir, TRANSCRIPT_FILE), transcript)
      return transcript
    } finally {
      await rm(audio, { force: true })
    }
  }

  async getTranscript(dir: string): Promise<Transcript | null> {
    try {
      return parseTranscript(JSON.parse(await readFile(join(dir, TRANSCRIPT_FILE), 'utf8')))
    } catch {
      return null
    }
  }

  private async requireTranscript(dir: string): Promise<Transcript> {
    const transcript = await this.getTranscript(dir)
    if (!transcript || transcript.words.length === 0) throw new Error('no_transcript')
    return transcript
  }

  /** Gợi ý đoạn cần cắt: khoảng lặng dài (tự tính) + từ thừa, nói lặp (Claude). */
  async suggestCuts(dir: string): Promise<CutSuggestion[]> {
    const { words, language } = await this.requireTranscript(dir)
    const client = createClaude(await this.key('anthropic'), this.deps.fetchImpl)
    const answer = await askJson<CutResponse>(client, {
      system: CUTS_SYSTEM,
      user: `Transcript (${words.length} words):\n${indexedTranscript(words)}`,
      schema: CUTS_SCHEMA,
    })
    const suggestions: CutSuggestion[] = []
    const covered = new Set<number>()
    for (const cut of answer.cuts ?? []) {
      const from = Math.max(0, Math.min(cut.from, cut.to))
      const to = Math.min(words.length - 1, Math.max(cut.from, cut.to))
      if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) continue
      const indices = Array.from({ length: to - from + 1 }, (_, i) => from + i)
      if (indices.some((i) => covered.has(i))) continue
      indices.forEach((i) => covered.add(i))
      for (const range of wordsToRanges(words, indices)) {
        suggestions.push({
          id: `ai${suggestions.length}`,
          kind: cut.kind,
          start: range.start,
          end: range.end,
          text: indices.map((i) => words[i]!.text).join(' '),
          reason: cut.reason,
        })
      }
    }
    // Phòng khi Claude bỏ sót từ đệm quá rõ ràng.
    for (const i of findFillerWords(words, language)) {
      if (covered.has(i)) continue
      for (const range of wordsToRanges(words, [i])) {
        suggestions.push({
          id: `f${i}`,
          kind: 'filler',
          start: range.start,
          end: range.end,
          text: words[i]!.text,
          reason: '',
        })
      }
    }
    for (const [k, range] of findSilences(words).entries()) {
      suggestions.push({
        id: `s${k}`,
        kind: 'silence',
        start: range.start,
        end: range.end,
        text: '',
        reason: '',
      })
    }
    return suggestions.sort((a, b) => a.start - b.start)
  }

  async summarize(dir: string): Promise<AiSummary> {
    const { words, language } = await this.requireTranscript(dir)
    const client = createClaude(await this.key('anthropic'), this.deps.fetchImpl)
    const answer = await askJson<SummaryResponse>(client, {
      system: summarySystem(language),
      user: timestampedTranscript(words),
      schema: SUMMARY_SCHEMA,
    })
    const summary: AiSummary = {
      titles: (answer.titles ?? []).slice(0, 5),
      description: answer.description ?? '',
      hashtags: (answer.hashtags ?? []).slice(0, 10),
      chapters: (answer.chapters ?? [])
        .filter((c) => Number.isFinite(c.start_seconds) && c.title)
        .map((c) => ({ start: Math.max(0, Math.round(c.start_seconds * 1000)), title: c.title }))
        .sort((a, b) => a.start - b.start),
    }
    await writeJsonFile(join(dir, AI_FILE), summary)
    return summary
  }

  async translate(
    lines: { id: string; text: string }[],
    target: string,
  ): Promise<{ id: string; text: string }[]> {
    if (lines.length === 0) return []
    const client = createClaude(await this.key('anthropic'), this.deps.fetchImpl)
    const answer = await askJson<TranslateResponse>(client, {
      system: translateSystem(target),
      user: JSON.stringify({ lines }),
      schema: TRANSLATE_SCHEMA,
      effort: 'low',
    })
    const byId = new Map((answer.lines ?? []).map((l) => [l.id, l.text]))
    return lines.map((l) => ({ id: l.id, text: byId.get(l.id) ?? l.text }))
  }
}
