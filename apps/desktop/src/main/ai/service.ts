import { createHash } from 'node:crypto'
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
  normalizeAssistantCommands,
  normalizeDirectorPlan,
  type AssistantCommand,
  type AssistantContext,
  type CutSuggestion,
  type DirectorContext,
  type DirectorPlan,
  type LocalAiSettings,
  type LocalSpeechSettings,
  type WhisperModel,
  type Project,
  type Transcript,
  type TranscriptWord,
  type ZoomRegion,
  zoomsFromProposals,
} from '@lumora/core'
import type { AiSummary, AudioAsset, ZoomPlanInput } from '@shared/ipc'
import { buildSpeechAudioArgs } from '../ffmpeg/args'
import { parseDurationMs } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { writeJsonFile } from '../json-file'
import type { FetchLike } from '../key-validation'
import {
  askJson,
  ASSISTANT_SCHEMA,
  assistantSystem,
  CAPTION_EDIT_SCHEMA,
  CAPTION_FIX_INSTRUCTION,
  captionEditSystem,
  createClaude,
  CUTS_SCHEMA,
  CUTS_SYSTEM,
  DIRECTOR_SCHEMA,
  directorSystem,
  SUMMARY_SCHEMA,
  summarySystem,
  TRANSLATE_SCHEMA,
  translateSystem,
  type AssistantResponse,
  ZOOM_PLAN_SCHEMA,
  ZOOM_PLAN_SYSTEM,
  type CaptionEditResponse,
  type CutResponse,
  type SummaryResponse,
  type TranslateResponse,
  type ZoomPlanResponse,
} from './claude'
import {
  cleanSpeechOptions,
  listVoices,
  textToSpeech,
  transcribeFile,
  type SpeechOptions,
  type Voice,
} from './elevenlabs'
import {
  askJsonOllama,
  benchmarkOllama,
  listOllamaModels,
  OllamaError,
  pullOllamaModel,
  type OllamaBenchmark,
  type PullProgress,
} from './ollama'

export const AI_FILE = 'ai.json'

export class MissingKeyError extends Error {
  constructor(readonly key: 'elevenlabs' | 'anthropic') {
    super(`missing_key:${key}`)
    this.name = 'MissingKeyError'
  }
}

/**
 * Giọng nói cục bộ (whisper.cpp + Piper) mà AiService cần: nhận dạng một file WAV 16 kHz, đọc
 * một câu thành WAV, và danh sách giọng đã tải. Bản chạy thật ở `local-speech.ts`.
 */
export interface LocalSpeechLike {
  transcribe(
    wavPath: string,
    opts: { model: WhisperModel; language?: string; timeoutMs?: number },
  ): Promise<Transcript>
  speak(text: string, opts: { voice: string; speed?: number }): Promise<Buffer>
  installedVoices(): Promise<Voice[]>
}

export interface AiDeps {
  getKey(key: 'elevenlabs' | 'anthropic'): Promise<string | undefined>
  /** Cài đặt AI cục bộ (Ollama); không có thì luôn dùng Claude. */
  getLocalAi?(): Promise<LocalAiSettings>
  /** Cài đặt giọng nói cục bộ (whisper.cpp + Piper); bật thì phụ đề và giọng đọc không cần ElevenLabs. */
  getLocalSpeech?(): Promise<LocalSpeechSettings>
  localSpeech?: LocalSpeechLike
  run: FfmpegRunner
  fetchImpl?: FetchLike
  /** Thư mục lưu đệm giọng đọc AI (dùng chung mọi dự án, đọc lại câu cũ không tốn credit). */
  soundsDir?: string
}

/** Số từ mỗi đoạn gửi cho model cục bộ khi tìm từ thừa. */
const LOCAL_CUTS_WINDOW = 400

/** Câu đọc tối đa (ký tự): meme sound / lời bình ngắn. */
export const MAX_SPEECH_CHARS = 500

/** Giới hạn ngữ cảnh gửi cho đạo diễn AI (tránh lời nhắc quá dài khi kho nhạc / lịch sử lớn). */
const DIRECTOR_MAX_NAMES = 50
const DIRECTOR_MAX_NAME_CHARS = 80
const DIRECTOR_MAX_HISTORY = 8
const DIRECTOR_MAX_MESSAGE_CHARS = 500
const DIRECTOR_MAX_MEMORY_CHARS = 2000
const DIRECTOR_MAX_TRANSCRIPT_CHARS = 4500
const DIRECTOR_MAX_CLICKS = 60
const DIRECTOR_MAX_EDIT_CHARS = 600

/** Cắt gọn ngữ cảnh đạo diễn trước khi đưa vào lời nhắc hệ thống. */
function trimDirectorContext(context: DirectorContext): DirectorContext {
  const names = (list: string[]) =>
    list
      .map((name) => name.trim().slice(0, DIRECTOR_MAX_NAME_CHARS))
      .filter(Boolean)
      .slice(0, DIRECTOR_MAX_NAMES)
  return {
    ...context,
    musicTracks: names(context.musicTracks),
    projects: names(context.projects),
    memory: context.memory.trim().slice(0, DIRECTOR_MAX_MEMORY_CHARS),
    history: context.history
      .slice(-DIRECTOR_MAX_HISTORY)
      .map((m) => ({ ...m, text: m.text.trim().slice(0, DIRECTOR_MAX_MESSAGE_CHARS) })),
    transcript: (context.transcript ?? '').trim().slice(0, DIRECTOR_MAX_TRANSCRIPT_CHARS),
    clicks: (context.clicks ?? [])
      .filter((ms) => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0)
      .slice(0, DIRECTOR_MAX_CLICKS),
    edit: (context.edit ?? '').trim().slice(0, DIRECTOR_MAX_EDIT_CHARS),
  }
}
/** Yêu cầu gửi Claude tối đa (ký tự). */
export const MAX_INSTRUCTION_CHARS = 1000

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

/** Các tính năng AI: phụ đề, giọng đọc (ElevenLabs) và biên tập, tóm tắt, dịch (Claude). */
export class AiService {
  private voiceCache: { at: number; voices: Voice[] } | null = null

  constructor(private readonly deps: AiDeps) {}

  /** Giọng đọc có trong tài khoản (nhớ 1 ngày). */
  /** Piper trả WAV: đổi sang MP3 bằng ffmpeg để cùng định dạng với giọng ElevenLabs. */
  private async speakLocally(
    engine: LocalSpeechLike,
    text: string,
    voice: string,
    speed: number,
    target: string,
  ): Promise<Buffer> {
    const wav = `${target}.wav`
    try {
      await writeFile(wav, await engine.speak(text, { voice, speed }))
      const result = await this.deps.run(
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          wav,
          '-c:a',
          'libmp3lame',
          '-b:a',
          '96k',
          target,
        ],
        120_000,
      )
      if (result.code !== 0) throw new Error(`audio_unreadable: ${result.stderr.slice(-200)}`)
      return await readFile(target)
    } finally {
      await rm(wav, { force: true })
    }
  }

  async voices(): Promise<Voice[]> {
    const local = await this.localSpeech()
    if (local) return local.engine.installedVoices()
    if (this.voiceCache && Date.now() - this.voiceCache.at < 24 * 3600_000)
      return this.voiceCache.voices
    const voices = await listVoices(await this.key('elevenlabs'), this.deps.fetchImpl)
    this.voiceCache = { at: Date.now(), voices }
    return voices
  }

  /** Giọng nói cục bộ khi được bật và có sẵn bộ chạy; không thì null (dùng ElevenLabs). */
  private async localSpeech(): Promise<{
    settings: LocalSpeechSettings
    engine: LocalSpeechLike
  } | null> {
    const engine = this.deps.localSpeech
    if (!engine) return null
    const settings = await this.deps.getLocalSpeech?.()
    return settings?.enabled ? { settings, engine } : null
  }

  /** Có đang dùng giọng nói cục bộ (phụ đề / giọng đọc không cần ElevenLabs) không. */
  async usingLocalSpeech(): Promise<boolean> {
    return (await this.localSpeech()) !== null
  }

  /**
   * Đọc `text` bằng giọng AI rồi chép vào dự án (`asset-tts-….mp3`) để thêm vào timeline như một
   * hiệu ứng âm thanh. Cùng câu + cùng giọng thì dùng lại file đã có, không gọi API lần nữa.
   */
  async speak(
    dir: string,
    text: string,
    voiceId: string,
    options: SpeechOptions = {},
  ): Promise<AudioAsset> {
    const clean = text.trim().slice(0, MAX_SPEECH_CHARS)
    if (!clean) throw new Error('speech_empty')
    if (!/^[\w.-]{1,80}$/.test(voiceId)) throw new Error('voice_invalid')
    const settings = cleanSpeechOptions(options)
    const local = await this.localSpeech()
    // Giọng mặc định giữ khóa cũ để dùng lại các câu đã đọc trước đây. Giọng Piper (tốc độ là
    // tham số duy nhất) có khóa riêng để không trùng với câu ElevenLabs cùng tên giọng.
    const variant = local
      ? settings.speed === 1
        ? ''
        : `\n${settings.speed}`
      : settings.speed === 1 && settings.stability === 0.5
        ? ''
        : `\n${settings.speed}/${settings.stability}`
    const hash = createHash('sha1')
      .update(`${local ? 'piper:' : ''}${voiceId}\n${clean}${variant}`)
      .digest('hex')
      .slice(0, 16)
    const file = `asset-tts-${hash}.mp3`
    const target = join(dir, file)
    const exists = (p: string) =>
      access(p).then(
        () => true,
        () => false,
      )
    if (!(await exists(target))) {
      const cached = this.deps.soundsDir ? join(this.deps.soundsDir, `tts-${hash}.mp3`) : null
      if (cached && (await exists(cached))) await copyFile(cached, target)
      else {
        const audio = local
          ? await this.speakLocally(local.engine, clean, voiceId, settings.speed, target)
          : await textToSpeech(
              clean,
              voiceId,
              await this.key('elevenlabs'),
              this.deps.fetchImpl,
              settings,
            )
        await writeFile(target, audio)
        if (cached) {
          await mkdir(this.deps.soundsDir!, { recursive: true })
          await writeFile(cached, audio)
        }
      }
    }
    const probe = await this.deps.run(['-hide_banner', '-i', target], 30_000)
    const durationMs = parseDurationMs(probe.stderr)
    if (!durationMs) {
      await rm(target, { force: true })
      throw new Error('audio_unreadable')
    }
    return { file, name: clean.length > 40 ? `${clean.slice(0, 40)}…` : clean, durationMs }
  }

  private async key(name: 'elevenlabs' | 'anthropic'): Promise<string> {
    const key = await this.deps.getKey(name)
    if (!key) throw new MissingKeyError(name)
    return key
  }

  /**
   * Hỏi mô hình ngôn ngữ và nhận JSON đúng schema: AI cục bộ (Ollama) khi được bật, còn lại là
   * Claude (cần key). Mọi tính năng văn bản (trợ lý, cắt từ thừa, tóm tắt, dịch) đi qua đây.
   */
  private async askJson<T>(options: {
    system: string
    user: string
    schema: Record<string, unknown>
    effort?: 'low' | 'medium' | 'high'
  }): Promise<T> {
    const local = await this.deps.getLocalAi?.()
    if (local?.enabled) {
      const ask = (system: string) =>
        askJsonOllama<T>({
          baseUrl: local.baseUrl,
          model: local.model,
          system,
          user: options.user,
          schema: options.schema,
          fetchImpl: this.deps.fetchImpl,
        })
      try {
        return await ask(options.system)
      } catch (error) {
        // Model nhỏ thỉnh thoảng trả JSON hỏng: thử lại một lần với lời nhắc nghiêm hơn.
        if (!(error instanceof OllamaError && error.code === 'ollama_bad_json')) throw error
        return ask(
          `${options.system}\nIMPORTANT: reply with exactly one JSON object matching the schema, no prose, no markdown.`,
        )
      }
    }
    const client = createClaude(await this.key('anthropic'), this.deps.fetchImpl)
    return askJson<T>(client, options)
  }

  private async usingLocalAi(): Promise<boolean> {
    return (await this.deps.getLocalAi?.())?.enabled === true
  }

  /** Đo tốc độ model cục bộ trên máy này (và nạp sẵn model). */
  benchmarkLocalModel(baseUrl: string, model: string): Promise<OllamaBenchmark> {
    return benchmarkOllama(baseUrl, model, this.deps.fetchImpl)
  }

  /** Model đã tải trong Ollama (để chọn trong Cài đặt). */
  listLocalModels(baseUrl: string): Promise<string[]> {
    return listOllamaModels(baseUrl, this.deps.fetchImpl)
  }

  /** Tải model về Ollama ngay trong app (thay cho lệnh `ollama pull`). */
  pullLocalModel(
    baseUrl: string,
    model: string,
    onProgress: (p: PullProgress) => void,
  ): Promise<void> {
    return pullOllamaModel(baseUrl, model, onProgress, this.deps.fetchImpl)
  }

  /** Nhận dạng giọng nói của cả bản quay; thời gian từng từ tính theo thời gian nguồn. */
  async transcribe(project: Project, dir: string, language?: string): Promise<Transcript> {
    // Giọng nói cục bộ (whisper.cpp) khi bật; không thì ElevenLabs (cần key, kiểm tra trước khi
    // tốn công trộn âm thanh).
    const local = await this.localSpeech()
    const apiKey = local ? '' : await this.key('elevenlabs')
    const hasMic = project.segments.some((s) => s.tracks.mic)
    const pieces = planAudio(project, initialClips(project), { mic: 1, system: hasMic ? 0 : 1 })
    if (pieces.length === 0) throw new Error('no_audio')
    const audio = join(dir, local ? '.speech.wav' : '.speech.mp3')
    try {
      const result = await this.deps.run(
        buildSpeechAudioArgs({
          pieces: pieces.map((p) => ({ ...p, path: join(dir, p.file), speed: 1, volume: 1 })),
          durationS: sourceDuration(project.segments) / 1000,
          output: audio,
          format: local ? 'wav16' : 'mp3',
        }),
        600_000,
      )
      if (result.code !== 0)
        throw new Error(`Không chuẩn bị được âm thanh: ${result.stderr.slice(-300)}`)
      const transcript = local
        ? await local.engine.transcribe(audio, {
            model: local.settings.whisperModel,
            language,
            // Whisper trên CPU chậm hơn thời gian thực nhiều lần với model lớn: cho tối đa 1 giờ.
            timeoutMs: 3_600_000,
          })
        : await transcribeFile(audio, apiKey, {
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
    // Model cục bộ có cửa sổ ngữ cảnh nhỏ và dễ lạc khi đầu vào dài: chia lời thoại thành từng
    // đoạn (giữ nguyên chỉ số toàn cục) rồi gộp kết quả. Claude đọc cả bản một lần.
    const window = (await this.usingLocalAi()) ? LOCAL_CUTS_WINDOW : words.length
    const cuts: CutResponse['cuts'] = []
    for (let from = 0; from < words.length; from += window) {
      const to = Math.min(words.length, from + window)
      const part = words
        .slice(from, to)
        .map((w, i) => `[${from + i}]${w.text}`)
        .join(' ')
      const answer = await this.askJson<CutResponse>({
        system: CUTS_SYSTEM,
        user:
          window >= words.length
            ? `Transcript (${words.length} words):\n${indexedTranscript(words)}`
            : `Transcript part (words ${from}-${to - 1} of ${words.length}):\n${part}`,
        schema: CUTS_SCHEMA,
      })
      cuts.push(...(answer.cuts ?? []))
    }
    const suggestions: CutSuggestion[] = []
    const covered = new Set<number>()
    for (const cut of cuts) {
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
    const answer = await this.askJson<SummaryResponse>({
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

  /** Trợ lý AI: mô tả bằng lời → danh sách lệnh chỉnh sửa (Claude; kiểm tra lại bằng core). */
  async plan(instruction: string, context: AssistantContext): Promise<AssistantCommand[]> {
    const text = instruction.trim().slice(0, 2000)
    if (!text) return []
    const answer = await this.askJson<AssistantResponse>({
      system: assistantSystem(context),
      user: text,
      schema: ASSISTANT_SCHEMA,
      effort: 'low',
    })
    return normalizeAssistantCommands(answer.commands)
  }

  /**
   * Đạo diễn AI: câu yêu cầu + ngữ cảnh (kho nhạc, dự án khác, thói quen, hội thoại) → kế hoạch
   * gồm tóm tắt, câu hỏi làm rõ (nếu cần) và lệnh. Ngữ cảnh đi vào lời nhắc hệ thống, lượt người
   * dùng chỉ có câu yêu cầu; kết quả kiểm tra lại bằng core.
   */
  async direct(goal: string, context: DirectorContext): Promise<DirectorPlan> {
    const text = goal.trim().slice(0, 2000)
    if (!text) return { summary: '', questions: [], commands: [] }
    const answer = await this.askJson<unknown>({
      system: directorSystem(trimDirectorContext(context)),
      user: text,
      schema: DIRECTOR_SCHEMA,
      effort: 'medium',
    })
    return normalizeDirectorPlan(answer)
  }

  async translate(
    lines: { id: string; text: string }[],
    target: string,
  ): Promise<{ id: string; text: string }[]> {
    if (lines.length === 0) return []
    const answer = await this.askJson<TranslateResponse>({
      system: translateSystem(target),
      user: JSON.stringify({ lines }),
      schema: TRANSLATE_SCHEMA,
      effort: 'low',
    })
    const byId = new Map((answer.lines ?? []).map((l) => [l.id, l.text]))
    return lines.map((l) => ({ id: l.id, text: byId.get(l.id) ?? l.text }))
  }

  /**
   * Sửa nội dung phụ đề theo yêu cầu (sửa chính tả, viết hoa tên riêng, bỏ từ đệm, đổi một từ
   * ở mọi chỗ...). `instruction` rỗng thì sửa chính tả và dấu câu. Trả về nội dung theo id.
   */
  async editCaptions(
    lines: { id: string; text: string }[],
    instruction: string,
    language: string,
  ): Promise<{ id: string; text: string }[]> {
    if (lines.length === 0) return []
    const ask = instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) || CAPTION_FIX_INSTRUCTION
    const answer = await this.askJson<CaptionEditResponse>({
      system: captionEditSystem(language),
      user: JSON.stringify({ instruction: ask, lines }),
      schema: CAPTION_EDIT_SCHEMA,
      effort: 'low',
    })
    const byId = new Map((answer.lines ?? []).map((l) => [l.id, l.text]))
    return lines.map((l) => ({ id: l.id, text: byId.get(l.id) ?? l.text }))
  }

  /**
   * Lập lại danh sách đoạn zoom theo yêu cầu bằng Claude (tăng mức zoom, bỏ zoom ngắn, zoom lúc
   * nói tới một điều gì...), dựa trên các đoạn hiện có, các lần click chuột và lời nói (nếu có).
   */
  async planZooms(dir: string, input: ZoomPlanInput): Promise<ZoomRegion[]> {
    const instruction = input.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS)
    if (!instruction) throw new Error('instruction_empty')
    const transcript = await this.getTranscript(dir)
    const seconds = (ms: number) => Math.round(ms / 100) / 10
    const current = input.zooms.map((z) => ({
      id: z.id,
      start_seconds: seconds(z.start),
      end_seconds: seconds(z.end),
      scale: z.scale,
      mode: z.mode,
      ...(z.mode === 'fixed' ? { x: z.x, y: z.y } : {}),
    }))
    const clicks = input.clicks.slice(0, 400).map(seconds)
    const user = [
      `Instruction: ${instruction}`,
      `Duration: ${seconds(input.durationMs)} seconds`,
      `Current zoom regions: ${JSON.stringify(current)}`,
      `Mouse clicks (seconds): ${JSON.stringify(clicks)}`,
      transcript && transcript.words.length > 0
        ? `Transcript:\n${timestampedTranscript(transcript.words)}`
        : 'Transcript: none',
    ].join('\n')
    const answer = await this.askJson<ZoomPlanResponse>({
      system: ZOOM_PLAN_SYSTEM,
      user,
      schema: ZOOM_PLAN_SCHEMA,
    })
    return zoomsFromProposals(answer.zooms ?? [], input.zooms, input.durationMs)
  }
}
