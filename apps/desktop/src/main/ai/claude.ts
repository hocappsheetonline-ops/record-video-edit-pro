import Anthropic from '@anthropic-ai/sdk'
import {
  ADJUST_KEYS,
  ASSISTANT_KINDS,
  BLUR_MODES,
  CAMERA_BG_MODES,
  CAMERA_LAYOUTS,
  CAMERA_SHAPES,
  CAPTION_TEMPLATES,
  CLEAR_TARGETS,
  CORNERS,
  EFFECT_INFO,
  EFFECT_KINDS,
  FONT_IDS,
  MUSIC_TEMPOS,
  OVERLAY_POSITIONS,
  RECIPE_STYLES,
  RESOLUTIONS,
  SHAPES,
  SHORTS_MODES,
  SOUND_EFFECT_IDS,
  SPEED_CURVE_PRESETS,
  TEXT_TEMPLATE_IDS,
  TIMELINE_ROWS,
  TRANSITION_INFO,
  TRANSITION_KINDS,
  VOICE_FX,
  VOLUME_TARGETS,
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
 * Lời nhắc hệ thống hai phần để tiết kiệm token: `static` giống hệt nhau giữa các lần gọi (vai
 * trò, tập lệnh, sổ tay dựng) được Claude cache (prompt caching, rẻ hơn ~90% từ lần thứ hai);
 * `dynamic` là ngữ cảnh riêng của video (lời thoại, bấm chuột, kho nhạc…).
 */
export interface SplitSystem {
  static: string
  dynamic: string
}
export type SystemPrompt = string | SplitSystem

/** Lời nhắc hệ thống dạng một chuỗi (Ollama, test, log). */
export function systemText(system: SystemPrompt): string {
  return typeof system === 'string' ? system : `${system.static}\n\n${system.dynamic}`
}

/** Khối lời nhắc hệ thống gửi Claude: phần tĩnh gắn `cache_control` để được cache. */
export function systemBlocks(
  system: SystemPrompt,
): string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[] {
  if (typeof system === 'string') return system
  return [
    { type: 'text', text: system.static, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: system.dynamic },
  ]
}

/**
 * Gọi Claude và nhận kết quả JSON đúng schema (structured outputs).
 * Bật `fallbacks: "default"`: nếu bộ lọc an toàn từ chối, máy chủ tự chạy lại trên model dự phòng phù hợp.
 */
export async function askJson<T>(
  client: Anthropic,
  options: {
    system: SystemPrompt
    user: string
    schema: Schema
    effort?: 'low' | 'medium' | 'high'
  },
): Promise<T> {
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: systemBlocks(options.system),
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
    text: {
      type: 'string',
      description:
        'title: the opening title text; text: the overlay text; outro: the end-card text',
    },
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
        ...SPEED_CURVE_PRESETS,
      ],
      description: `filter: colour look preset; speedCurve: curve preset (${SPEED_CURVE_PRESETS.join(', ')})`,
    },
    intensity: { type: 'number', description: 'filter / effectAt: strength 0.1-1' },
    factor: {
      type: 'number',
      description: 'speed: playback factor 0.25-8; speedRange: factor for that span 0.25-16',
    },
    style: {
      type: 'string',
      enum: [...RECIPE_STYLES, 'highlight', 'classic'],
      description: `recipe: editing recipe (${RECIPE_STYLES.join(' / ')}); captionsLook: highlight (word by word) or classic (whole line)`,
    },
    font: { type: 'string', enum: [...FONT_IDS], description: 'captionsLook: caption font' },
    highlightColor: {
      type: 'string',
      description: 'captionsLook: hex colour of the spoken word / highlight',
    },
    uppercase: { type: 'boolean', description: 'captionsLook: captions in capitals' },
    maxWords: {
      type: 'integer',
      description: 'captionsLook: words shown at once (0 = whole line; 2-3 for TikTok style)',
    },
    enhance: { type: 'boolean', description: 'export: HD enhance (denoise + sharpen)' },
    aspect: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', 'source'] },
    ms: {
      type: 'integer',
      description:
        'trimStart / trimEnd: milliseconds to cut; freeze / zoomAt / text / sticker / shape / blur / effectAt / outro: duration in ms; fade: fade length in ms; transitions / transitionAt: transition length in ms',
    },
    effect: {
      type: 'string',
      enum: [...EFFECT_KINDS],
      description:
        'effect: visual effect at the start of the video and at every cut; effectAt: effect at one time',
    },
    transition: {
      type: 'string',
      enum: [...TRANSITION_KINDS],
      description: 'transitions: transition used at every cut; transitionAt: transition at one cut',
    },
    query: {
      type: 'string',
      description:
        'music: words from the name of a track in the user music library; broll: short English stock-video keywords',
    },
    volume: {
      type: 'number',
      description:
        'music / findMusic: background music volume 0.05-1 (0.4 default; 0.2-0.25 under speech)',
    },
    mood: {
      type: 'string',
      description:
        'findMusic: 2-4 English words for the mood / genre of the background music (e.g. "upbeat corporate", "calm lofi", "epic cinematic")',
    },
    tempo: {
      type: 'string',
      enum: [...MUSIC_TEMPOS],
      description: 'findMusic: tempo of the background music',
    },
    count: { type: 'integer', description: 'shorts (highlights): how many shorts to make, 1-5' },
    template: {
      type: 'string',
      enum: [...new Set<string>([...CAPTION_TEMPLATES, ...TEXT_TEMPLATE_IDS])],
      description: `captionsStyle: subtitle template (${CAPTION_TEMPLATES.join(', ')}); text / outro: text template (${TEXT_TEMPLATE_IDS.join(', ')})`,
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
    fps: { type: 'integer', enum: [30, 60], description: 'export: frames per second' },
    atMs: {
      type: 'integer',
      description:
        'freeze / sound / zoomAt / text / sticker / shape / blur / marker / effectAt / transitionAt / speedCurve: time on the output video, milliseconds',
    },
    fromMs: { type: 'integer', description: 'cutRange / speedRange: start of the span (ms)' },
    toMs: { type: 'integer', description: 'cutRange / speedRange: end of the span (ms)' },
    axis: { type: 'string', enum: ['horizontal', 'vertical'], description: 'flip' },
    degrees: { type: 'integer', enum: [90, 180, 270], description: 'rotate: clockwise' },
    target: {
      type: 'string',
      enum: [...new Set<string>([...VOLUME_TARGETS, ...CLEAR_TARGETS])],
      description: `volume: ${VOLUME_TARGETS.join(' / ')}; clear: ${CLEAR_TARGETS.join(' / ')}`,
    },
    level: {
      type: 'number',
      description:
        'volume: 0 (mute) to 2 (1 = unchanged); duck: music level while speaking 0.05-0.8',
    },
    enabled: { type: 'boolean', description: 'duck: turn auto-ducking on or off' },
    showKeys: { type: 'boolean', description: 'cursor: show pressed keyboard shortcuts' },
    voice: { type: 'string', enum: [...VOICE_FX], description: 'voiceFx: voice effect' },
    sound: { type: 'string', enum: [...SOUND_EFFECT_IDS], description: 'sound: sound effect id' },
    scale: { type: 'number', description: 'zoomLevel / zoomAt: zoom factor 1.1-5 (2 = twice)' },
    cameraSpeed: { type: 'number', description: 'motion: 0 (slow glide) to 1 (tight follow)' },
    zoomMs: { type: 'integer', description: 'motion: zoom in/out duration 250-1500 ms' },
    padding: { type: 'number', description: 'frame: margin around the video 0-0.45' },
    radius: { type: 'number', description: 'frame: corner radius 0-0.2' },
    shadow: { type: 'number', description: 'frame: drop shadow 0-1' },
    fill: {
      type: 'boolean',
      description: 'frame: fill the whole frame (no margin, no background)',
    },
    color: {
      type: 'string',
      description: 'background / shape / captionsLook: hex colour like #1e1b4b',
    },
    color2: {
      type: 'string',
      description: 'background: second hex colour for a gradient; "" for a solid colour',
    },
    visible: { type: 'boolean', description: 'cursor / camera: show or hide' },
    size: {
      type: 'number',
      description:
        'cursor: pointer scale 0.5-4; camera: bubble size 0.05-0.6; captionsLayout: text size 0.5-2.5; blur: region height 0.05-1 of the frame',
    },
    clickEffect: { type: 'boolean', description: 'cursor: ripple on clicks' },
    hideIdle: { type: 'boolean', description: 'cursor: hide when idle' },
    shape: {
      type: 'string',
      enum: [...new Set<string>([...CAMERA_SHAPES, ...SHAPES])],
      description: `camera: ${CAMERA_SHAPES.join(' / ')}; shape: ${SHAPES.join(' / ')}`,
    },
    position: {
      type: 'string',
      enum: [...new Set<string>([...CORNERS, ...OVERLAY_POSITIONS])],
      description: `camera: corner (${CORNERS.join(' / ')}); text / sticker: ${OVERLAY_POSITIONS.join(' / ')}; captionsLayout: top / bottom`,
    },
    layout: { type: 'string', enum: [...CAMERA_LAYOUTS], description: 'camera: bubble or stack' },
    beauty: { type: 'boolean', description: 'camera: face beautify on/off' },
    background: {
      type: 'string',
      enum: [...CAMERA_BG_MODES],
      description: 'camera: webcam background (none, remove, blur, color)',
    },
    emoji: { type: 'string', description: 'sticker: one emoji' },
    x: { type: 'number', description: 'shape / blur: horizontal centre 0-1' },
    y: { type: 'number', description: 'shape / blur: vertical centre 0-1' },
    setting: { type: 'string', enum: [...ADJUST_KEYS], description: 'adjust: which setting' },
    value: {
      type: 'number',
      description: 'adjust: -1..1 (sharpen, vignette, grain: 0..1); 0 = unchanged',
    },
    language: {
      type: 'string',
      description: 'translate / dub: target language code (en, vi, ja…)',
    },
    bilingual: {
      type: 'boolean',
      description: 'translate: true = show the translation under the original line',
    },
    keepOriginal: {
      type: 'boolean',
      description:
        'dub: keep the original voice quietly under the AI voice (default false = mute it)',
    },
    voiceName: {
      type: 'string',
      description: 'dub: name of the AI voice to use (omit for the default voice)',
    },
    label: { type: 'string', description: 'marker: short label' },
    row: { type: 'string', enum: [...TIMELINE_ROWS], description: 'track: timeline row' },
    hidden: { type: 'boolean', description: 'track: hide the row' },
    muted: { type: 'boolean', description: 'track: mute the row' },
    locked: { type: 'boolean', description: 'track: lock the row' },
    mode: {
      type: 'string',
      enum: [...SHORTS_MODES, ...BLUR_MODES],
      description:
        'shorts: how to split (fixed / chapters / highlights = AI picks the best self-contained moments); blur: blur or pixelate (mosaic)',
    },
    seconds: { type: 'integer', description: 'shorts: length of each short in seconds (fixed)' },
    vertical: { type: 'boolean', description: 'shorts: 9:16 frame for each short' },
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
- transitions {transition, ms}: transition at every cut (${TRANSITION_KINDS.join(', ')}); ms = length (600 by default, 200-300 for punchy short-form).
- music {query, volume}: background music from the user's own library; query = words from one track name; volume 0.05-1 (0.4 by default, about 0.25 when asked for quiet music).
- export {resolution, format, fps, enhance}: set export settings and export right away (resolution ${RESOLUTIONS.join(' / ')}; format mp4 or gif; enhance = HD denoise + sharpen).
- styleFrom {project}: copy the style (frame, filter, captions, motion…) of one of the user's other projects, by its exact name.
Timeline (all times are on the output video, in milliseconds):
- cutRange {fromMs, toMs}: cut out that span. freeze {atMs, ms}: freeze frame at a time for ms. flip {axis}: mirror the screen video. rotate {degrees}: 90 / 180 / 270 clockwise.
Audio:
- volume {target, level}: ${VOLUME_TARGETS.join(' / ')}; level 0 = mute, 1 = unchanged, up to 2. voiceFx {voice}: microphone voice effect (${VOICE_FX.join(', ')}). fade {ms}: fade the background music in and out. sound {sound, atMs}: built-in sound effect (${SOUND_EFFECT_IDS.join(', ')}) at a time. duck {enabled, level}: automatically lower background music while the narrator speaks (level = music volume while speaking, 0.3 by default).
Zoom & motion:
- zoomLevel {scale}: set the zoom factor of every existing zoom (1.1-5). zoomAt {atMs, ms, scale}: add one zoom following the cursor. motion {cameraSpeed, zoomMs}: how fast the view follows the cursor (0-1) and how long zooming in/out takes (250-1500 ms).
Frame & look:
- frame {padding, radius, shadow, fill}: margin, rounded corners, shadow (0-1) and fill-the-frame. background {color, color2}: colour behind the video (hex), gradient when color2 is given.
- cursor {visible, size, clickEffect, hideIdle, showKeys}: drawn mouse pointer (showKeys = show pressed keyboard shortcuts like Ctrl+C under the frame). camera {visible, shape, size, position, layout, beauty, background}: webcam bubble (shape ${CAMERA_SHAPES.join(' / ')}, position ${CORNERS.join(' / ')}, layout ${CAMERA_LAYOUTS.join(' / ')}, background ${CAMERA_BG_MODES.join(' / ')}).
- adjust {setting, value}: one colour adjustment (${ADJUST_KEYS.join(', ')}), -1..1; one command per setting.
Overlays:
- text {text, atMs, ms, template, position}: text on the video with a text template (${TEXT_TEMPLATE_IDS.join(', ')}), position ${OVERLAY_POSITIONS.join(' / ')} (use "title" for an opening title, "text" for anything at a given time).
- sticker {emoji, atMs, ms, position}: an emoji sticker. shape {shape, atMs, ms, x, y, color}: a drawn shape (${SHAPES.join(', ')}) centred at x, y (0-1) — e.g. an arrow pointing at something the narration mentions.
- blur {mode, atMs, ms, x, y, size}: hide a sensitive area (password, email, name) by blurring or pixelating a region centred at x, y with height size (0-1 of the frame), from atMs for ms; mode ${BLUR_MODES.join(' / ')}.
Captions:
- captionsLayout {position, size}: captions at the top or bottom, text size 0.5-2.5. translate {language, bilingual}: translate the existing captions (language code), bilingual = keep the original and show the translation under it.
Markers & rows:
- marker {atMs, label}: a timeline marker. chapters: create chapter markers from the transcript (needs captions / transcript).
- track {row, hidden, muted, locked}: hide / mute / lock a timeline row (${TIMELINE_ROWS.join(', ')}).
- clear {target}: remove every item of one kind (${CLEAR_TARGETS.join(', ')}); "cuts" restores the full recording; "captions" turns captions off; "filter" / "adjust" reset the colour look.
- shorts {mode, seconds, vertical, count}: split the video into short clips, each becoming its own project (mode fixed = every N seconds, chapters = by AI chapters, highlights = AI picks the count best self-contained moments of 15-90 s, each with a hook, vertical TikTok captions and the same look).
Pro editing (1.9.0):
- recipe {style}: a whole professional recipe in one command (${RECIPE_STYLES.join(' / ')}): youtube = long-form 16:9 tutorial (silence + filler cuts, clean voice, smooth cursor zoom, pressed keys, box captions, quiet ducked music, chapters); shorts = vertical TikTok / Shorts / Reels (9:16, fast pacing, big TikTok captions, zoom transitions, ducked music); vlog = talking head (karaoke captions, warm look, soft music); clean = minimal (silence cuts, clean voice, outline captions). Explicit commands in the same plan override the recipe's.
- effectAt {effect, atMs, ms, intensity}: one visual effect at a time (a pattern interrupt: flash / shake / zoomPunch on a reveal, confetti / sparkle on a success, bw / vintage for a flashback, spotlight to focus one spot). Keep most effects 0.5-3 s; strobe / shake under 1 s; colour tints (warm, cool, bw, letterbox, grain) may run over a whole segment.
- speedRange {fromMs, toMs, factor}: speed up a boring span (loading, typing, waiting: 2-4×) or slow down a key moment (0.5×).
- speedCurve {preset, atMs}: a CapCut-style speed curve on the clip at atMs (${SPEED_CURVE_PRESETS.join(', ')}).
- transitionAt {atMs, transition, ms}: a transition at the cut nearest atMs only (use for section changes; hard cuts elsewhere). Pick by meaning: fadeBlack / wipe for calm section changes, zoom / flash / whip for energetic short-form, slide* for next / previous step, flip for before / after, iris to focus one thing.
Effect catalogue (name: look; when to use):
${EFFECT_KINDS.map((k) => `  ${k}: ${EFFECT_INFO[k]}`).join('\n')}
Transition catalogue (name: look; when to use):
${TRANSITION_KINDS.map((k) => `  ${k}: ${TRANSITION_INFO[k]}`).join('\n')}
- captionsLook {font, color, highlightColor, uppercase, maxWords, style}: caption typography; style highlight = word by word (short-form), classic = whole line (long-form, tutorials).
- outro {text, ms, template}: an end card shown during the last ms of the video (call to action: subscribe / follow / next video); always anchored to the end, even after cuts.
Auto build (1.12.0):
- findMusic {mood, tempo, volume}: the app searches a royalty-free music catalogue (Jamendo, Creative Commons licences that allow commercial use), downloads the best match for the mood (2-4 English words) and tempo (${MUSIC_TEMPOS.join(' / ')}), adds it as background music at volume and ducks it under speech. Prefer it over music when the user has no suitable track in the library or asks the AI to find / pick music. Mood by content: tutorial / demo = "calm corporate" or "soft lofi"; energetic short-form = "upbeat pop" or "electronic"; vlog = "warm acoustic"; reveal / launch = "epic cinematic".
- broll {query, atMs, ms}: cover the frame with a stock video clip (Pixabay, free licence) from atMs for ms (3-6 s); query = 2-4 English keywords ("typing on laptop", "city traffic", "team meeting"). Use only while the narration is generic (an intro, a concept, a conclusion) and nothing on screen matters; never over a click, a demo step or a zoom.
Captions-app style (1.13.0; all need captions, which the app generates first when missing):
- captionsEmoji: an AI-picked emoji on the caption lines where one fits the meaning (playful short-form, vlogs).
- captionsKeywords: AI picks 1-3 key words per caption line and the app draws them in a separate colour (numbers, product names, the point of the sentence) — makes short-form captions pop.
- dub {language, keepOriginal, voiceName}: AI dubbing — translate the speech to the language (when it differs from the spoken one), read every caption line with an AI voice at the right time, mute the original microphone (keepOriginal = keep it quietly underneath); captions switch to the dubbed language. Only when the user asks for a voice in another language / dubbing / narration by AI.`

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
 * Sổ tay dựng video chuyên nghiệp (YouTube dài / TikTok-Shorts ngắn) cho đạo diễn AI: rút từ cách
 * làm của các kênh hướng dẫn và short-form phổ biến (hook 3 giây đầu, đổi hình mỗi 10-20 giây,
 * cắt khoảng lặng, zoom đúng lúc, phụ đề ngắn, nhạc nền nhỏ tự giảm khi nói, thẻ kết CTA…).
 */
export const EDITING_PLAYBOOK = `Professional editing playbook (follow it whenever the user asks for a "professional", "complete", "YouTube", "TikTok" or "like a pro" edit, or gives only a goal):
1. Pick the format first: long-form (YouTube tutorial / demo, 16:9, calm pace, whole-line captions) or short-form (TikTok / Shorts / Reels, 9:16 fill, fast pace, 2-3 word highlight captions). A recipe command (youtube / shorts / vlog / clean) is the quickest way to apply the right defaults; add explicit commands on top for anything specific.
2. Hook (first 3-5 s): never open with a slow intro. Put a text hook at atMs 0 for 2-3 s that states the result or promise ("Làm X trong 30 giây", "3 lỗi khiến…"); add a quick effectAt flash/pulse or a sound at 0 if the style is energetic. Trim dead time before the first spoken words (trimStart) when the transcript shows a late start.
3. Pacing: remove silences (>0.5 s) and filler words, then make something change on screen every 10-20 s (zoomAt on the UI detail being explained, a text label for a key step or setting, a shape arrow at a click, a sticker, a short effectAt). Speed up waiting / loading / typing spans with speedRange 2-4×; slow a key moment to 0.5× only when it matters. Short-form: cuts every 2-4 s, zoom transitions 200-300 ms; long-form: hard cuts, a transition (fadeBlack / slide 400-600 ms) only at section changes (transitionAt).
4. Zoom and cursor: autoZoom for screen recordings with mouse data; punch in (zoomAt 1.6-2.5×, 2-4 s) where small UI details are mentioned, starting just before the narration names the target and holding through the click; keep the cursor visible with click ripples; show pressed shortcuts when the tutorial uses them. Never zoom on talking-head only footage.
5. Captions: always on for short-form and recommended for tutorials. Short-form: tiktok / popWord / shadowPop / comic template, highlight style, 2-3 words, large, slightly below centre, plus captionsKeywords (and captionsEmoji when the tone is playful) so the key words pop like in the Captions app. Long-form: box / outline template, classic style, bottom. Keep the caption language = spoken language; translate / bilingual only when asked; dub only when the user wants the voice itself in another language.
6. Audio: cleanAudio first (noise reduction, voice enhance, loudness about -14 LUFS). Background music from the library at 0.15-0.3, ducked under speech (duck level 0.2-0.3), fade in/out 1-2 s; mute the music entirely for calm tutorials if the user hints at it. Sound effects sparingly (a pop / whoosh on a reveal or key step, a success chime at the end), never over every cut.
7. Look: a light filter (cinematic / warm / tealOrange at 0.4-0.7) for vlogs; keep screen recordings neutral (no filter, maybe small contrast / sharpen adjust). Frame: 16:9 with padding 0.04-0.08, radius, shadow and a gradient background for long-form; 9:16 fill for short-form.
8. Privacy: blur / pixelate emails, passwords, names or tokens visible in the transcript or the goal (blur command at that time span).
9. Ending: a short outro / CTA card in the last 3-5 s (subscribe, follow, next video, link in description), optionally a marker at the CTA; fade the music out. Short-form: end right after the payoff, no long goodbye (trimEnd if needed).
10. Order of commands: cuts (cutSilences, removeFillers, trimStart/End, cutRange, speedRange) → audio (cleanAudio, music, duck, fade) → zoom & motion → frame & look → captions → overlays (text, sticker, shape, blur, effectAt, outro) → markers / chapters → export last. The app runs the AI steps (silence / filler cuts, autoZoom, captions, cleanAudio) first, so every atMs / fromMs / toMs you give must already be on the cut video: when you also cut silences, prefer times from the transcript excerpt at the start of the video, use outro for the ending, and avoid exact times late in the video.
11. Say what you did in the summary in the user's language, briefly; do not ask questions when a sensible professional default exists.
12. AUTO BUILD (the user pressed one button after recording): deliver the whole edit in one plan with no questions, in this order: recipe for the format → trimStart if the transcript starts late → text hook at 0 (from the first thing the transcript promises) → 2-4 zoomAt / text labels / shape arrows at real clicks and transcript moments → speedRange over obvious waiting → findMusic (mood + tempo by content) with duck → optional broll in generic narration → blur for any secret visible in the transcript → outro CTA. Keep it to about 8-15 commands; the app reviews the result against this playbook afterwards and fills what is missing.`

/**
 * Lời nhắc hệ thống của đạo diễn AI: giải thích tập lệnh, sổ tay dựng chuyên nghiệp và toàn bộ ngữ
 * cảnh (lời thoại có mốc thời gian, thời điểm bấm chuột, bản dựng hiện tại, kho nhạc, dự án khác,
 * thói quen + quy tắc đã dặn, hội thoại gần đây); câu yêu cầu đi riêng ở lượt người dùng.
 */
export function directorSystem(context: DirectorContext): string {
  return systemText(directorPrompt(context))
}

/**
 * Lời nhắc đạo diễn tách hai phần: `static` (vai trò, cách trả lời, tập lệnh, sổ tay; không chứa
 * gì của video nên giống hệt nhau giữa mọi lần gọi → được cache) và `dynamic` (ngôn ngữ, thời
 * lượng, lời thoại, bấm chuột, kho nhạc, dự án, trí nhớ, hội thoại).
 */
export function directorPrompt(context: DirectorContext): SplitSystem {
  const language = languageName(context.language)
  const list = (items: string[], empty: string) =>
    items.length > 0 ? items.map((name) => `- ${name}`).join('\n') : empty
  const history =
    context.history.length > 0
      ? context.history
          .map((m) => `${m.role === 'user' ? 'User' : 'Director'}: ${m.text}`)
          .join('\n')
      : '(none)'
  const clicks =
    context.clicks && context.clicks.length > 0
      ? context.clicks.map((ms) => (ms / 1000).toFixed(1) + ' s').join(', ')
      : '(none)'
  const staticPart = `You are the AI director of a screen-recording video editor. The user states a goal for their video, in their own language or English; you turn it into a plan the app executes, editing like a professional YouTube / TikTok editor.

Reply with:
- summary: one short sentence in the user's language restating what you are going to do (the user confirms it before anything runs).
- questions: at most 2 clarifying questions, in the user's language, ONLY when the request is genuinely ambiguous (e.g. the user wants a specific library track but the music library is empty). Otherwise an empty list: while there are questions nothing runs, so never ask when a sensible default exists.
- commands: editing commands from the fixed set below, in the order they should run. Include what the user asked for, what the user's standing rules imply, and, when the user asks for a complete / professional edit or gives only a goal, the steps of the playbook that fit this video. Empty list if nothing applies.

Commands:
${COMMAND_GUIDE}

${EDITING_PLAYBOOK}`
  const dynamicPart = `User language: ${language}.
Video: duration ${Math.round(context.durationMs / 1000)} s; transcript ${context.hasTranscript ? 'available' : 'not available yet (the app transcribes first when captions, cutSilences or removeFillers are requested)'}; mouse / cursor data ${context.hasCursor ? 'available' : 'not available (autoZoom will do nothing)'}.
Current edit: ${context.edit?.trim() || '(fresh recording, nothing edited yet)'}

Transcript with output-video timestamps [m:ss.s] (place hooks, labels, zooms, markers and blur at the real moments; empty when not transcribed yet):
${context.transcript?.trim() || '(none)'}

Mouse click times on the output video (good anchors for zoomAt / shape arrows):
${clicks}

Music library (track names; pick music.query from one of them; if empty, ask or skip the music):
${list(context.musicTracks, '(empty)')}

Other projects of the user (for styleFrom, use the exact name):
${list(context.projects, '(none)')}

User memory (learned habits and standing rules; the rules MUST be respected, e.g. a preferred caption template applies whenever captions are added):
${context.memory.trim() || '(none)'}

Recent conversation about this project (the new goal may continue it):
${history}`
  return { static: staticPart, dynamic: dynamicPart }
}

/** Các đoạn hay nhất để tách thành video ngắn (xem `normalizeHighlights` trong core). */
export interface HighlightsResponse {
  segments: { start_seconds: number; end_seconds: number; hook: string; title: string }[]
}

export const HIGHLIGHTS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start_seconds: { type: 'number', description: 'Start of the segment (seconds)' },
          end_seconds: { type: 'number', description: 'End of the segment (seconds)' },
          hook: {
            type: 'string',
            description:
              'A 3-8 word hook shown at the start of the short, in the transcript language',
          },
          title: { type: 'string', description: 'A short title for the short (max 60 characters)' },
        },
        required: ['start_seconds', 'end_seconds', 'hook', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['segments'],
  additionalProperties: false,
}

export function highlightsSystem(language: string, count: number): string {
  return `You pick the best moments of a screen-recorded / talking video to publish as vertical shorts (TikTok / Shorts / Reels).
The transcript has [m:ss] timestamps every few seconds. Choose up to ${count} self-contained segments:
- each 20-60 seconds long (never under 15 or over 90), starting at the beginning of a sentence and ending at the end of one, with a clear payoff (a tip, a result, a surprising point, a complete step);
- segments must not overlap and should be spread over the video; prefer moments with concrete value over introductions and goodbyes;
- hook: a 3-8 word line in ${languageName(language)} that makes the viewer stay (state the result or the problem, no clickbait);
- title: a short title in ${languageName(language)}.
Return the segments in chronological order.`
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

export interface CaptionEditResponse {
  lines: { id: string; text: string }[]
}

export const CAPTION_EDIT_SCHEMA: Schema = TRANSLATE_SCHEMA

export function captionEditSystem(language: string): string {
  return `You edit the subtitle lines of a screen-recorded video, following the user's instruction.
The lines are in ${languageName(language)}; keep that language unless the instruction says otherwise.
Return every id unchanged, in the same order, with the edited text (return the original text for lines that need no change).
Keep the meaning and keep each line short enough to read as a subtitle; never add new lines or drop ids.
Typical instructions: fix spelling, punctuation and capitalisation; write product names correctly; remove filler words; replace a term everywhere; make the tone more formal or more casual.
If the instruction asks to replace a word, change all its occurrences, matching the capitalisation of each occurrence.`
}

export const CAPTION_FIX_INSTRUCTION =
  'Fix spelling, punctuation, capitalisation and obvious speech-to-text mistakes. Keep the wording otherwise.'

export interface CaptionEmojiResponse {
  lines: { id: string; emoji: string }[]
}

export const CAPTION_EMOJI_SCHEMA: Schema = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          emoji: {
            type: 'string',
            description: 'One emoji that fits the line, or "" when none fits',
          },
        },
        required: ['id', 'emoji'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
}

/** Lời nhắc chọn emoji cho từng dòng phụ đề (kiểu app Captions). */
export function captionEmojiSystem(language: string): string {
  return `You add one emoji to subtitle lines of a short video, like the Captions app does.
The lines are in ${languageName(language)}. Return every id in the same order with the emoji for that line, or "" (empty) when no emoji genuinely fits.
Rules: exactly one emoji per line at most (no text, no two emoji); pick emoji that reinforce the meaning or emotion of that sentence (🔥 for something impressive, 💡 for a tip, ⚠️ for a warning, 💰 for money, 👆 for "click here", 🎯 for a goal…); leave about half of the lines empty so the emoji stay meaningful; never add emoji to lines that only connect sentences ("and then", "so") or to very technical lines where an emoji would look silly.`
}

export interface CaptionKeywordsResponse {
  lines: { id: string; keywords: string[] }[]
}

export const CAPTION_KEYWORDS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Up to 3 single words copied exactly from the line; [] when none',
          },
        },
        required: ['id', 'keywords'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
}

/** Lời nhắc chọn từ khóa cần tô màu trong từng dòng phụ đề (kiểu app Captions). */
export function captionKeywordsSystem(language: string): string {
  return `You pick the keywords to highlight in subtitle lines of a short video, like the Captions app does (key words drawn in a different colour).
The lines are in ${languageName(language)}. Return every id in the same order with 1-3 keywords for that line, or [] when nothing stands out.
Rules: each keyword is ONE word copied exactly as written in the line (same spelling and diacritics, punctuation may be dropped); prefer numbers, prices, product / feature names, verbs that carry the action and the word the sentence is about; never highlight filler words, pronouns or connectors; at most 3 per line and usually 1-2, so the highlight keeps its meaning.`
}

export interface ZoomPlanResponse {
  zooms: {
    id: string
    start_seconds: number
    end_seconds: number
    scale: number
    mode: 'follow' | 'fixed'
    x: number
    y: number
  }[]
}

export const ZOOM_PLAN_SCHEMA: Schema = {
  type: 'object',
  properties: {
    zooms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'id of an existing region to keep (edited), or "" for a new region',
          },
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          scale: { type: 'number', description: 'Zoom level, 1.2 to 4 (2 = twice as big)' },
          mode: {
            type: 'string',
            enum: ['follow', 'fixed'],
            description: 'follow = the view follows the mouse cursor; fixed = centred on x, y',
          },
          x: { type: 'number', description: 'Horizontal centre 0..1 (used when mode is fixed)' },
          y: { type: 'number', description: 'Vertical centre 0..1 (used when mode is fixed)' },
        },
        required: ['id', 'start_seconds', 'end_seconds', 'scale', 'mode', 'x', 'y'],
        additionalProperties: false,
      },
    },
  },
  required: ['zooms'],
  additionalProperties: false,
}

export const ZOOM_PLAN_SYSTEM = `You plan the zoom-in regions of a screen-recording video, following the user's instruction.
You receive the video duration, the current zoom regions (id, start/end in seconds, scale, mode), the times of mouse clicks and, when available, the transcript with [m:ss] timestamps.
Return the complete new list of zoom regions (not only the changed ones): keep the id of every existing region you keep or adjust, use "" for new regions, and simply leave out regions that should be removed.
Rules: regions must not overlap and must stay within the duration; each region lasts at least 1.5 seconds; scale is between 1.2 and 4; prefer "follow" mode so the view tracks the cursor, and use "fixed" with x, y only when the instruction names a place on the screen (x, y are fractions of the width and height, 0,0 = top-left).
Zoom where the viewer needs detail: clicks, typing and the moments the narration explains something on screen. Do not zoom during introductions or when the whole screen matters.
Apply the instruction literally when it gives numbers (for example "set all zooms to 2.5" means every region gets scale 2.5 and nothing else changes).`
