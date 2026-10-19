import type { CaptionLine } from './captions'
import { FONTS, type FontId } from './text-style'

/**
 * Mẫu phụ đề (giống CapCut): cách vẽ từ đang nói và cả dòng.
 * - `box`: nền tối bo góc, từ đang nói đổi màu.
 * - `karaoke`: chữ viền đen, các từ đã nói tô màu nhấn.
 * - `outline`: chữ trắng viền đen dày, không nền.
 * - `bounceWord`: từ đang nói phóng to nảy lên.
 * - `popWord`: từng từ bật ra lần lượt (chỉ hiện các từ đã nói).
 * - `underline`: gạch chân màu dưới từ đang nói.
 * - `neon`: chữ phát sáng theo màu nhấn.
 * - `tiktok`: chữ in hoa đậm, từ đang nói có khối màu phía sau.
 * Mẫu động kiểu app Captions (1.12.0):
 * - `typewriter`: chữ hiện dần từng ký tự theo lời nói (chỉ hiện các từ đã nói).
 * - `wave`: các từ nhấp nhô lượn sóng, từ đang nói đổi màu.
 * - `slideUp`: mỗi từ trượt lên và hiện rõ khi được nói, từ chưa nói mờ.
 * - `shadowPop`: chữ to đậm có bóng cứng lệch góc, từ đang nói phóng to.
 * - `gradient`: chữ tô chuyển màu (màu chữ → màu nhấn), viền mảnh.
 * - `comic`: phông truyện tranh, chữ vàng viền đen dày, từ đang nói nảy.
 */
export const CAPTION_TEMPLATES = [
  'box',
  'karaoke',
  'outline',
  'bounceWord',
  'popWord',
  'underline',
  'neon',
  'tiktok',
  'typewriter',
  'wave',
  'slideUp',
  'shadowPop',
  'gradient',
  'comic',
] as const
export type CaptionTemplate = (typeof CAPTION_TEMPLATES)[number]

export interface CaptionLook {
  template: CaptionTemplate
  font: FontId
  /** Màu chữ thường. */
  color: string
  /** Màu nhấn của từ đang nói (hoặc khối nền / gạch chân / ánh sáng tùy mẫu). */
  highlightColor: string
  /** Màu của từ khóa do AI chọn (kiểu app Captions). */
  keywordColor: string
  uppercase: boolean
  /** Số từ tối đa hiện cùng lúc (0 = cả dòng). Kiểu TikTok thường 2–3 từ. */
  maxWords: number
  /** Vị trí theo chiều dọc: tâm khối phụ đề (0 = mép trên, 1 = mép dưới). */
  y: number
}

type Preset = Omit<CaptionLook, 'template' | 'y'>

const PRESETS: Record<CaptionTemplate, Preset> = {
  box: {
    font: 'beVietnamPro',
    color: '#ffffff',
    highlightColor: '#facc15',
    keywordColor: '#fb923c',
    uppercase: false,
    maxWords: 0,
  },
  karaoke: {
    font: 'montserrat',
    color: '#ffffff',
    highlightColor: '#22d3ee',
    keywordColor: '#fde047',
    uppercase: false,
    maxWords: 0,
  },
  outline: {
    font: 'beVietnamPro',
    color: '#ffffff',
    highlightColor: '#ffffff',
    keywordColor: '#fde047',
    uppercase: false,
    maxWords: 0,
  },
  bounceWord: {
    font: 'montserrat',
    color: '#ffffff',
    highlightColor: '#a3e635',
    keywordColor: '#fb923c',
    uppercase: true,
    maxWords: 4,
  },
  popWord: {
    font: 'anton',
    color: '#ffffff',
    highlightColor: '#ffffff',
    keywordColor: '#fde047',
    uppercase: true,
    maxWords: 3,
  },
  underline: {
    font: 'inter',
    color: '#ffffff',
    highlightColor: '#f43f5e',
    keywordColor: '#fde047',
    uppercase: false,
    maxWords: 0,
  },
  neon: {
    font: 'montserrat',
    color: '#ffffff',
    highlightColor: '#e879f9',
    keywordColor: '#22d3ee',
    uppercase: false,
    maxWords: 0,
  },
  tiktok: {
    font: 'montserrat',
    color: '#ffffff',
    highlightColor: '#8b5cf6',
    keywordColor: '#fde047',
    uppercase: true,
    maxWords: 3,
  },
  typewriter: {
    font: 'robotoMono',
    color: '#ffffff',
    highlightColor: '#4ade80',
    keywordColor: '#fde047',
    uppercase: false,
    maxWords: 0,
  },
  wave: {
    font: 'montserrat',
    color: '#ffffff',
    highlightColor: '#38bdf8',
    keywordColor: '#fde047',
    uppercase: true,
    maxWords: 4,
  },
  slideUp: {
    font: 'inter',
    color: '#ffffff',
    highlightColor: '#f472b6',
    keywordColor: '#fde047',
    uppercase: false,
    maxWords: 0,
  },
  shadowPop: {
    font: 'anton',
    color: '#ffffff',
    highlightColor: '#facc15',
    keywordColor: '#f97316',
    uppercase: true,
    maxWords: 3,
  },
  gradient: {
    font: 'montserrat',
    color: '#ffffff',
    highlightColor: '#c084fc',
    keywordColor: '#fde047',
    uppercase: false,
    maxWords: 0,
  },
  comic: {
    font: 'bangers',
    color: '#fde047',
    highlightColor: '#f43f5e',
    keywordColor: '#ffffff',
    uppercase: true,
    maxWords: 3,
  },
}

export const DEFAULT_CAPTION_LOOK: CaptionLook = { template: 'box', ...PRESETS.box, y: 0.88 }

/** Đổi mẫu: lấy phông / màu / số từ của mẫu, giữ vị trí đang đặt. */
export function withCaptionTemplate(look: CaptionLook, template: CaptionTemplate): CaptionLook {
  return { ...look, ...PRESETS[template], template }
}

/** Vị trí dọc tương ứng với tùy chọn cũ "trên / dưới". */
export const captionYOf = (position: 'top' | 'bottom') => (position === 'top' ? 0.12 : 0.88)

const HEX = /^#[0-9a-f]{6}$/i
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Đọc từ file; thiếu thì theo mẫu mặc định với vị trí theo tùy chọn cũ. */
export function parseCaptionLook(value: unknown, position: 'top' | 'bottom'): CaptionLook {
  const v = isObj(value) ? value : {}
  const template = (CAPTION_TEMPLATES as readonly unknown[]).includes(v.template)
    ? (v.template as CaptionTemplate)
    : 'box'
  const base = { ...DEFAULT_CAPTION_LOOK, ...PRESETS[template], template }
  const y = typeof v.y === 'number' && Number.isFinite(v.y) ? v.y : captionYOf(position)
  const maxWords = typeof v.maxWords === 'number' && Number.isFinite(v.maxWords) ? v.maxWords : NaN
  return {
    template,
    font: FONTS.some((f) => f.id === v.font) ? (v.font as FontId) : base.font,
    color: typeof v.color === 'string' && HEX.test(v.color) ? v.color.toLowerCase() : base.color,
    highlightColor:
      typeof v.highlightColor === 'string' && HEX.test(v.highlightColor)
        ? v.highlightColor.toLowerCase()
        : base.highlightColor,
    keywordColor:
      typeof v.keywordColor === 'string' && HEX.test(v.keywordColor)
        ? v.keywordColor.toLowerCase()
        : base.keywordColor,
    uppercase: typeof v.uppercase === 'boolean' ? v.uppercase : base.uppercase,
    maxWords: Number.isNaN(maxWords)
      ? base.maxWords
      : Math.round(Math.min(8, Math.max(0, maxWords))),
    y: Math.min(0.95, Math.max(0.05, y)),
  }
}

/**
 * Nhóm từ đang hiện khi chỉ hiện `maxWords` từ một lúc: nhóm chứa từ đang nói
 * (chưa nói từ nào thì nhóm đầu). Trả về [từ, đến) theo chỉ số từ.
 */
export function captionChunk(count: number, active: number, maxWords: number): [number, number] {
  if (maxWords <= 0 || count <= maxWords) return [0, count]
  const page = Math.floor(Math.max(0, active) / maxWords)
  const from = Math.min(page * maxWords, count - 1)
  return [from, Math.min(count, from + maxWords)]
}

/** Độ phóng của từ đang nói theo thời gian từ lúc bắt đầu từ (mẫu bounceWord / popWord). */
export function wordBounce(sinceMs: number): number {
  const t = Math.max(0, sinceMs)
  if (t >= 260) return 1
  // Lên 1.25 trong 110ms rồi về 1.
  return t < 110 ? 1 + 0.25 * (t / 110) : 1.25 - 0.25 * ((t - 110) / 150)
}

/** Ngôn ngữ dịch phụ đề hay dùng (mã ISO 639-1). */
export const CAPTION_LANGUAGES = [
  'vi',
  'en',
  'ja',
  'ko',
  'zh',
  'th',
  'id',
  'fr',
  'es',
  'de',
] as const
export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number]

/** Thời lượng tối thiểu của một dòng phụ đề (ms). */
export const MIN_CAPTION_MS = 200

let splitSeq = 0
const newLineId = () => `l${Date.now().toString(36)}${(splitSeq++).toString(36)}`

/** Gộp dòng `id` với dòng ngay sau nó. Dòng cuối thì không đổi. */
export function mergeCaptionLine(lines: readonly CaptionLine[], id: string): CaptionLine[] {
  const i = lines.findIndex((l) => l.id === id)
  const a = lines[i]
  const b = lines[i + 1]
  if (!a || !b) return [...lines]
  const merged: CaptionLine = {
    id: a.id,
    start: a.start,
    end: Math.max(a.end, b.end),
    text: `${a.text} ${b.text}`.trim(),
    words: a.edited || b.edited ? [] : [...a.words, ...b.words],
    edited: a.edited || b.edited,
    ...(a.translation !== undefined || b.translation !== undefined
      ? { translation: `${a.translation ?? ''} ${b.translation ?? ''}`.trim() }
      : {}),
    ...(a.emoji || b.emoji ? { emoji: a.emoji || b.emoji } : {}),
    ...(a.keywords || b.keywords
      ? { keywords: [...new Set([...(a.keywords ?? []), ...(b.keywords ?? [])])] }
      : {}),
  }
  return [...lines.slice(0, i), merged, ...lines.slice(i + 2)]
}

/**
 * Tách dòng `id` làm đôi: theo từ gốc (chia đôi số từ, thời gian theo từ) nếu có,
 * không thì chia đôi chữ và thời gian theo tỉ lệ số ký tự. Dòng một từ thì không đổi.
 */
export function splitCaptionLine(lines: readonly CaptionLine[], id: string): CaptionLine[] {
  const i = lines.findIndex((l) => l.id === id)
  const line = lines[i]
  if (!line) return [...lines]
  let first: CaptionLine
  let second: CaptionLine
  if (!line.edited && line.words.length >= 2) {
    const half = Math.ceil(line.words.length / 2)
    const a = line.words.slice(0, half)
    const b = line.words.slice(half)
    const cut = Math.round((a[a.length - 1]!.end + b[0]!.start) / 2)
    first = { ...line, end: cut, text: a.map((w) => w.text).join(' '), words: a }
    second = {
      ...line,
      id: newLineId(),
      start: cut,
      text: b.map((w) => w.text).join(' '),
      words: b,
    }
  } else {
    const parts = line.text.split(/\s+/).filter(Boolean)
    if (parts.length < 2) return [...lines]
    const half = Math.ceil(parts.length / 2)
    const a = parts.slice(0, half).join(' ')
    const b = parts.slice(half).join(' ')
    const ratio = a.length / (a.length + b.length)
    const cut = Math.round(line.start + (line.end - line.start) * ratio)
    if (cut - line.start < MIN_CAPTION_MS || line.end - cut < MIN_CAPTION_MS) return [...lines]
    first = { ...line, end: cut, text: a, words: [] }
    second = { ...line, id: newLineId(), start: cut, text: b, words: [] }
  }
  delete first.translation
  delete second.translation
  // Emoji ở lại nửa sau (cuối câu); từ khóa chỉ giữ ở nửa có từ đó.
  delete first.emoji
  const keep = (part: CaptionLine) => {
    const words = part.text.split(/\s+/)
    const keywords = (line.keywords ?? []).filter((k) =>
      words.some((w) => w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === k.toLowerCase()),
    )
    if (keywords.length > 0) part.keywords = keywords
    else delete part.keywords
  }
  keep(first)
  keep(second)
  return [...lines.slice(0, i), first, second, ...lines.slice(i + 1)]
}

/**
 * Đổi thời gian một dòng (kéo mép trên timeline): không chồng lên dòng trước / sau,
 * dài ít nhất `MIN_CAPTION_MS`. Thời gian theo bản quay (nguồn).
 */
export function setCaptionTiming(
  lines: readonly CaptionLine[],
  id: string,
  start: number,
  end: number,
): CaptionLine[] {
  const i = lines.findIndex((l) => l.id === id)
  const line = lines[i]
  if (!line) return [...lines]
  const lo = lines[i - 1]?.end ?? 0
  const hi = lines[i + 1]?.start ?? Number.POSITIVE_INFINITY
  const s = Math.max(lo, Math.min(start, hi - MIN_CAPTION_MS))
  const e = Math.min(hi, Math.max(end, s + MIN_CAPTION_MS))
  return lines.map((l) => (l.id === id ? { ...l, start: Math.round(s), end: Math.round(e) } : l))
}
