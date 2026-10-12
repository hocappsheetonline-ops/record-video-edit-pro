import Anthropic from '@anthropic-ai/sdk'
import {
  ASSISTANT_KINDS,
  CAPTION_TEMPLATES,
  EFFECT_KINDS,
  RESOLUTIONS,
  TRANSITION_KINDS,
  type DirectorContext,
} from '@lumora/core'
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

/** Một lệnh chỉnh sửa (cùng tập lệnh với `AssistantCommand` trong core); dùng chung cho trợ lý và đạo diễn. */
const COMMAND_SCHEMA: Schema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...ASSISTANT_KINDS] },
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
    effect: {
      type: 'string',
      enum: [...EFFECT_KINDS],
      description: 'effect: visual effect at the start of the video and at every cut',
    },
    transition: {
      type: 'string',
      enum: [...TRANSITION_KINDS],
      description: 'transitions: transition used at every cut',
    },
    query: {
      type: 'string',
      description: 'music: words from the name of a track in the user music library',
    },
    volume: { type: 'number', description: 'music: background music volume 0.05-1 (0.4 default)' },
    template: {
      type: 'string',
      enum: [...CAPTION_TEMPLATES],
      description: 'captionsStyle: subtitle template',
    },
    resolution: {
      type: 'integer',
      enum: [...RESOLUTIONS],
      description: 'export: output height in pixels',
    },
    format: { type: 'string', enum: ['mp4', 'gif'], description: 'export: file format' },
    project: {
      type: 'string',
      description: 'styleFrom: exact name of the project whose style to copy',
    },
  },
  required: ['kind'],
  additionalProperties: false,
}

/** Lệnh trợ lý AI: cùng tập lệnh với `AssistantCommand` trong core. */
export const ASSISTANT_SCHEMA: Schema = {
  type: 'object',
  properties: {
    commands: { type: 'array', items: COMMAND_SCHEMA },
  },
  required: ['commands'],
  additionalProperties: false,
}

/** Mô tả ngắn từng lệnh (dùng chung cho trợ lý nhanh và đạo diễn AI). */
const COMMAND_GUIDE = `- cutSilences: remove long pauses. removeFillers: remove filler words / repeated phrases. autoZoom: zoom in on mouse activity.
- captions: generate subtitles. captionsStyle {template}: subtitle look (${CAPTION_TEMPLATES.join(', ')}). cleanAudio: noise reduction, voice enhancement, loudness normalisation.
- title {text}: add an opening title card with the given text (write the text yourself if the user asks for "a title" without giving one).
- filter {preset, intensity}: colour look. speed {factor}: change playback speed of the whole video (0.25-8).
- aspect {aspect}: output aspect ratio ("9:16" for TikTok / Shorts / Reels, "1:1" square, "16:9" landscape).
- trimStart {ms} / trimEnd {ms}: cut that many milliseconds from the beginning / end.
- effect {effect}: visual effect at the start of the video and at every cut (${EFFECT_KINDS.join(', ')}).
- transitions {transition}: transition at every cut (${TRANSITION_KINDS.join(', ')}).
- music {query, volume}: background music from the user's own library; query = words from one track name; volume 0.05-1 (0.4 by default, about 0.25 when asked for quiet music).
- export {resolution, format}: set export settings and export right away (resolution ${RESOLUTIONS.join(' / ')}; format mp4 or gif).
- styleFrom {project}: copy the style (frame, filter, captions, motion…) of one of the user's other projects, by its exact name.`

export function assistantSystem(context: {
  language: string
  durationMs: number
  hasTranscript: boolean
}): string {
  return `You are the editing assistant inside a screen-recording video editor. The user describes, in ${languageName(context.language)} or English, what they want done to their video (duration ${Math.round(context.durationMs / 1000)} s, transcript ${context.hasTranscript ? 'available' : 'not available'}).
Translate the request into a list of editing commands from this fixed set, in the order they should run:
${COMMAND_GUIDE}
Only include commands the user actually asked for (or clearly implied). If nothing applies, return an empty list.`
}

/** Kế hoạch của đạo diễn AI: tóm tắt + câu hỏi làm rõ + lệnh (xem `DirectorPlan` trong core). */
export const DIRECTOR_SCHEMA: Schema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'One short sentence, in the user language, restating what will be done',
    },
    questions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'At most 2 clarifying questions; empty unless the request is genuinely ambiguous',
    },
    commands: { type: 'array', items: COMMAND_SCHEMA },
  },
  required: ['summary', 'questions', 'commands'],
  additionalProperties: false,
}

/**
 * Lời nhắc hệ thống của đạo diễn AI: giải thích tập lệnh và đưa toàn bộ ngữ cảnh (kho nhạc, dự
 * án khác, thói quen + quy tắc đã dặn, hội thoại gần đây) vào; câu yêu cầu đi riêng ở lượt người dùng.
 */
export function directorSystem(context: DirectorContext): string {
  const language = languageName(context.language)
  const list = (items: string[], empty: string) =>
    items.length > 0 ? items.map((name) => `- ${name}`).join('\n') : empty
  const history =
    context.history.length > 0
      ? context.history
          .map((m) => `${m.role === 'user' ? 'User' : 'Director'}: ${m.text}`)
          .join('\n')
      : '(none)'
  return `You are the AI director of a screen-recording video editor. The user states a goal for their video, in ${language} or English; you turn it into a plan the app executes.
Video: duration ${Math.round(context.durationMs / 1000)} s; transcript ${context.hasTranscript ? 'available' : 'not available yet (the app transcribes first when captions, cutSilences or removeFillers are requested)'}; mouse / cursor data ${context.hasCursor ? 'available' : 'not available (autoZoom will do nothing)'}.

Reply with:
- summary: one short sentence in ${language} restating what you are going to do (the user confirms it before anything runs).
- questions: at most 2 clarifying questions, in ${language}, ONLY when the request is genuinely ambiguous (e.g. the user wants background music but the music library is empty, or says "make it good" with no detail). Otherwise an empty list: while there are questions nothing runs, so never ask when a sensible default exists.
- commands: editing commands from the fixed set below, in the order they should run. Include only what the user asked for or what the user's standing rules clearly imply; nothing else. Empty list if nothing applies.

Commands:
${COMMAND_GUIDE}

Music library (track names; pick music.query from one of them; if empty, ask or skip the music):
${list(context.musicTracks, '(empty)')}

Other projects of the user (for styleFrom, use the exact name):
${list(context.projects, '(none)')}

User memory (learned habits and standing rules; the rules MUST be respected, e.g. a preferred caption template applies whenever captions are added):
${context.memory.trim() || '(none)'}

Recent conversation about this project (the new goal may continue it):
${history}`
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
