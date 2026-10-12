import Anthropic from '@anthropic-ai/sdk'
import type { FetchLike } from '../key-validation'
import { AiServiceError } from './elevenlabs'
import { anthropicBaseUrl } from './endpoints'

export const CLAUDE_MODEL = 'claude-opus-5-5'
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export function createClaude(apiKey: string, fetchImpl?: FetchLike): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL: anthropicBaseUrl(),
    maxRetries: 2,
    timeout: 10 * 60_000,
    fetch: fetchImpl,
  })
}

type Schema = Record<string, unknown>

/**
 * Gọi Claude và nhận kết quả JSON đúng schema (structured outputs).
 * Bật `fallbacks: "default"`: nếu bộ lọc an toàn từ chối, máy chủ tự chạy lại trên model dự phòng phù hợp.
 */
export async function askJson<T>(
  client: Anthropic,
  options: { system: string; user: string; schema: Schema; effort?: 'low' | 'medium' | 'high' },
): Promise<T> {
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: options.system,
    messages: [{ role: 'user', content: options.user }],
    output_config: {
      effort: options.effort ?? 'medium',
      format: { type: 'json_schema', schema: options.schema },
    },
  })
  if (response.stop_reason === 'refusal') {
    throw new AiServiceError('anthropic', null, 'Claude từ chối xử lý nội dung này')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiServiceError('anthropic', null, 'Nội dung quá dài, Claude không trả lời hết')
  }
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AiServiceError('anthropic', null, 'Claude trả về dữ liệu không đọc được')
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Simplified Chinese',
  th: 'Thai',
  id: 'Indonesian',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
}
export function languageName(code: string): string {
  const key = code.toLowerCase().slice(0, 2)
  return LANGUAGE_NAMES[key] ?? (code || 'the same language as the transcript')
}

export interface CutResponse {
  cuts: { from: number; to: number; kind: 'filler' | 'repeat' | 'other'; reason: string }[]
}

export const CUTS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    cuts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'integer', description: 'Index of the first word to remove (inclusive)' },
          to: { type: 'integer', description: 'Index of the last word to remove (inclusive)' },
          kind: { type: 'string', enum: ['filler', 'repeat', 'other'] },
          reason: {
            type: 'string',
            description: 'Short reason, in the language of the transcript',
          },
        },
        required: ['from', 'to', 'kind', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['cuts'],
  additionalProperties: false,
}

export const CUTS_SYSTEM = `You are a video editor cleaning up a screen-recording voice-over.
The transcript is given as words prefixed with their index, like "[12]word".
Find spans that should be cut so the narration sounds clean:
- filler words and hesitation sounds (e.g. "ừm", "à", "ờ", "um", "uh"),
- stutters, false starts and repeated phrases (keep the last complete take, cut the earlier attempts),
- off-topic asides only if clearly unintended ("other").
Never cut meaningful content. Prefer fewer, confident cuts. Spans must not overlap.
Write each reason briefly in the transcript's language.`

export interface SummaryResponse {
  titles: string[]
  description: string
  hashtags: string[]
  chapters: { start_seconds: number; title: string }[]
}

export const SUMMARY_SCHEMA: Schema = {
  type: 'object',
  properties: {
    titles: { type: 'array', items: { type: 'string' }, description: 'Three alternative titles' },
    description: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: { start_seconds: { type: 'number' }, title: { type: 'string' } },
        required: ['start_seconds', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['titles', 'description', 'hashtags', 'chapters'],
  additionalProperties: false,
}

export function summarySystem(language: string): string {
  return `You write metadata for a screen-recorded tutorial video based on its transcript (with [m:ss] timestamps).
Write everything in ${languageName(language)}.
- titles: three catchy, accurate titles (max 70 characters each).
- description: 2-4 sentences for YouTube.
- hashtags: 3-6 relevant hashtags including the leading "#".
- chapters: YouTube chapters in chronological order; the first starts at 0; at least 10 seconds apart; only when the video is long enough (otherwise return an empty list).`
}

export interface AssistantResponse {
  commands: unknown[]
}

/** Lệnh trợ lý AI: cùng tập lệnh với `AssistantCommand` trong core. */
export const ASSISTANT_SCHEMA: Schema = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'cutSilences',
              'removeFillers',
              'autoZoom',
              'captions',
              'cleanAudio',
              'title',
              'filter',
              'speed',
              'aspect',
              'trimStart',
              'trimEnd',
            ],
          },
          text: { type: 'string', description: 'title: the opening title text' },
          preset: {
            type: 'string',
            enum: [
              'cinematic',
              'vintage',
              'cold',
              'warm',
              'bw',
              'fade',
              'vivid',
              'noir',
              'pastel',
              'tealOrange',
              'sunset',
            ],
            description: 'filter: colour look preset',
          },
          intensity: { type: 'number', description: 'filter: 0.1-1' },
          factor: { type: 'number', description: 'speed: playback factor 0.25-8' },
          aspect: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', 'source'] },
          ms: { type: 'integer', description: 'trimStart / trimEnd: milliseconds to cut' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['commands'],
  additionalProperties: false,
}

export function assistantSystem(context: {
  language: string
  durationMs: number
  hasTranscript: boolean
}): string {
  return `You are the editing assistant inside a screen-recording video editor. The user describes, in ${languageName(context.language)} or English, what they want done to their video (duration ${Math.round(context.durationMs / 1000)} s, transcript ${context.hasTranscript ? 'available' : 'not available'}).
Translate the request into a list of editing commands from this fixed set, in the order they should run:
- cutSilences: remove long pauses. removeFillers: remove filler words / repeated phrases. autoZoom: zoom in on mouse activity.
- captions: generate subtitles. cleanAudio: noise reduction, voice enhancement, loudness normalisation.
- title {text}: add an opening title card with the given text (write the text yourself if the user asks for "a title" without giving one).
- filter {preset, intensity}: colour look. speed {factor}: change playback speed of the whole video.
- aspect {aspect}: output aspect ratio ("9:16" for TikTok / Shorts / Reels, "1:1" square, "16:9" landscape).
- trimStart {ms} / trimEnd {ms}: cut that many milliseconds from the beginning / end.
Only include commands the user actually asked for (or clearly implied). If nothing applies, return an empty list.`
}

export interface TranslateResponse {
  lines: { id: string; text: string }[]
}

export const TRANSLATE_SCHEMA: Schema = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
}

export function translateSystem(target: string): string {
  return `Translate video subtitle lines into ${languageName(target)}.
Keep every id unchanged and return one translated line per input line, in the same order.
Keep each line short enough to read as a subtitle, preserve product names and code, and keep the tone natural.`
}
