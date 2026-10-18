import { MIN_AUDIO_CLIP_MS } from './audio-clips'
import type { CaptionLine } from './captions'
import { sourceToOutput, type Clip } from './timeline'

/**
 * Phụ đề kiểu app Captions: emoji theo nội dung từng dòng, tô màu từ khóa, và lồng tiếng AI
 * (đọc lại lời thoại bằng giọng AI, ở ngôn ngữ khác nếu muốn). AI (Claude / Ollama) chọn emoji
 * và từ khóa; không có AI thì dùng từ điển / quy tắc đơn giản ở đây.
 */

/** Emoji tối đa trên một dòng (một ký tự emoji, có thể kèm biến thể / tông da). */
export const MAX_CAPTION_EMOJI_CHARS = 8
/** Số từ khóa tối đa một dòng. */
export const MAX_CAPTION_KEYWORDS = 3

/** Bỏ dấu câu quanh từ, chữ thường, NFC — để so từ khóa với từ trong dòng. */
export function normalizeCaptionWord(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/** Từ `text` có nằm trong danh sách từ khóa của dòng không (so không dấu câu, không hoa thường). */
export function isCaptionKeyword(text: string, keywords: readonly string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) return false
  const word = normalizeCaptionWord(text)
  if (!word) return false
  return keywords.some((k) => normalizeCaptionWord(k) === word)
}

/** Chỉ giữ emoji hợp lệ: không chữ / số, không khoảng trắng, ngắn. */
export function cleanCaptionEmoji(value: unknown): string {
  if (typeof value !== 'string') return ''
  const emoji = value.trim()
  if (!emoji || emoji.length > MAX_CAPTION_EMOJI_CHARS) return ''
  if (/[\p{L}\p{N}\s]/u.test(emoji)) return ''
  return emoji
}

/**
 * Chỉ giữ từ khóa thật sự có trong dòng (so từng từ), bỏ trùng, tối đa `MAX_CAPTION_KEYWORDS`;
 * trả về đúng chữ như trong dòng để dễ hiện.
 */
export function cleanCaptionKeywords(text: string, value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    // Cụm nhiều từ: lấy từng từ.
    for (const part of raw.split(/\s+/)) {
      const key = normalizeCaptionWord(part)
      if (!key || out.some((k) => normalizeCaptionWord(k) === key)) continue
      const hit = words.find((w) => normalizeCaptionWord(w) === key)
      if (!hit) continue
      out.push(hit.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      if (out.length >= MAX_CAPTION_KEYWORDS) return out
    }
  }
  return out
}

/** Gắn emoji theo id dòng (chuỗi rỗng = bỏ emoji). Trả về số dòng thay đổi. */
export function applyCaptionEmojis(
  lines: readonly CaptionLine[],
  items: readonly { id: string; emoji: string }[],
): { lines: CaptionLine[]; count: number } {
  const byId = new Map(items.map((i) => [i.id, cleanCaptionEmoji(i.emoji)]))
  let count = 0
  const result = lines.map((line) => {
    const emoji = byId.get(line.id)
    if (emoji === undefined || emoji === (line.emoji ?? '')) return line
    count += 1
    const next = { ...line }
    if (emoji) next.emoji = emoji
    else delete next.emoji
    return next
  })
  return { lines: result, count }
}

/** Gắn từ khóa theo id dòng (mảng rỗng = bỏ). Trả về số dòng thay đổi. */
export function applyCaptionKeywords(
  lines: readonly CaptionLine[],
  items: readonly { id: string; keywords: string[] }[],
): { lines: CaptionLine[]; count: number } {
  const byId = new Map(items.map((i) => [i.id, i.keywords]))
  let count = 0
  const result = lines.map((line) => {
    const raw = byId.get(line.id)
    if (raw === undefined) return line
    const keywords = cleanCaptionKeywords(line.text, raw)
    const same =
      keywords.length === (line.keywords?.length ?? 0) &&
      keywords.every((k, i) => k === line.keywords![i])
    if (same) return line
    count += 1
    const next = { ...line }
    if (keywords.length > 0) next.keywords = keywords
    else delete next.keywords
    return next
  })
  return { lines: result, count }
}

/** Bỏ emoji và từ khóa của mọi dòng. */
export function clearCaptionDecor(
  lines: readonly CaptionLine[],
  what: { emoji?: boolean; keywords?: boolean },
): CaptionLine[] {
  return lines.map((line) => {
    const next = { ...line }
    if (what.emoji) delete next.emoji
    if (what.keywords) delete next.keywords
    return next
  })
}

/** Từ điển emoji theo từ khóa (tiếng Việt / tiếng Anh) khi không có AI. Thứ tự = ưu tiên. */
const EMOJI_WORDS: [RegExp, string][] = [
  [/\b(xin chào|chào|hello|hi|hey|welcome)\b/i, '👋'],
  [/\b(cảm ơn|thanks?|thank you)\b/i, '🙏'],
  [/\b(tiền|giá|đô|dollar|money|price|\$)\b/i, '💰'],
  [/\b(nhanh|tốc độ|fast|quick|speed)\b/i, '⚡'],
  [/\b(lỗi|hỏng|bug|error|fail|sai)\b/i, '❌'],
  [/\b(xong|hoàn thành|thành công|done|success|works?)\b/i, '✅'],
  [/\b(cẩn thận|lưu ý|chú ý|warning|careful|note)\b/i, '⚠️'],
  [/\b(ý tưởng|mẹo|tip|idea|trick)\b/i, '💡'],
  [/\b(yêu|thích|love|like)\b/i, '❤️'],
  [/\b(vui|cười|haha|funny|lol)\b/i, '😂'],
  [/\b(quan trọng|important|key)\b/i, '🔑'],
  [/\b(bấm|nhấn|click|tap|chọn|select)\b/i, '👆'],
  [/\b(tải|download|cài|install)\b/i, '⬇️'],
  [/\b(lưu|save)\b/i, '💾'],
  [/\b(video|quay|record)\b/i, '🎬'],
  [/\b(nhạc|music|song|bài hát)\b/i, '🎵'],
  [/\b(xem|nhìn|look|watch|see)\b/i, '👀'],
  [/\b(nóng|hot|cháy|fire|viral)\b/i, '🔥'],
  [/\b(đăng ký|subscribe|follow|theo dõi)\b/i, '🔔'],
  [/\b(câu hỏi|hỏi|question|why|tại sao)\b/i, '❓'],
  [/\b(mục tiêu|goal|target)\b/i, '🎯'],
  [/\b(bắt đầu|start|begin|go)\b/i, '🚀'],
]

/** Emoji gợi ý cho một dòng phụ đề (không có AI); rỗng khi không có từ nào hợp. */
export function suggestCaptionEmoji(text: string): string {
  const t = text.normalize('NFC')
  for (const [re, emoji] of EMOJI_WORDS) if (re.test(t)) return emoji
  return ''
}

const STOP_WORDS = new Set(
  [
    // vi
    'và',
    'là',
    'của',
    'có',
    'không',
    'được',
    'thì',
    'này',
    'đó',
    'các',
    'những',
    'một',
    'cho',
    'với',
    'trong',
    'cũng',
    'rồi',
    'nhé',
    'nha',
    'bạn',
    'mình',
    'chúng',
    'ta',
    'để',
    'khi',
    'như',
    'nào',
    'đây',
    'đã',
    'sẽ',
    'đang',
    'rất',
    'hơn',
    'nữa',
    'hay',
    'hoặc',
    'nhưng',
    'vì',
    'nên',
    'thế',
    'vậy',
    'ừm',
    'à',
    'ờ',
    'xin',
    'chào',
    'hôm',
    'nay',
    'cái',
    'cách',
    'phần',
    'điều',
    'việc',
    // en
    'the',
    'and',
    'that',
    'this',
    'with',
    'from',
    'have',
    'will',
    'your',
    'you',
    'for',
    'are',
    'was',
    'were',
    'then',
    'than',
    'just',
    'very',
    'into',
    'about',
    'what',
    'when',
    'where',
    'which',
    'there',
    'here',
    'also',
    'some',
    'them',
    'they',
    'their',
    'our',
    'can',
    'not',
    'but',
    'all',
    'any',
    'how',
    'why',
    'who',
    'does',
    'did',
    'been',
    'being',
    'going',
    'really',
    'thing',
    'things',
    'today',
  ].map((w) => w.normalize('NFC')),
)

/**
 * Từ khóa gợi ý cho một dòng (không có AI): số (giá, phần trăm, phím), từ viết hoa không ở đầu
 * câu (tên riêng), rồi từ dài không phải từ phổ biến; tối đa 2.
 */
export function suggestCaptionKeywords(text: string, max = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const picked: string[] = []
  const push = (w: string) => {
    const clean = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (!clean || picked.some((p) => normalizeCaptionWord(p) === normalizeCaptionWord(clean)))
      return
    picked.push(clean)
  }
  for (const w of words) if (/\p{N}/u.test(w)) push(w)
  words.forEach((w, i) => {
    const clean = normalizeCaptionWord(w)
    if (i > 0 && /^\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, '')) && !STOP_WORDS.has(clean)) push(w)
  })
  for (const w of words) {
    const clean = normalizeCaptionWord(w)
    if (clean.length >= 6 && !STOP_WORDS.has(clean)) push(w)
  }
  return picked.slice(0, max)
}

/** Một đoạn lồng tiếng đã xếp lên video xuất. */
export interface DubPlacement {
  lineId: string
  /** Thời điểm bắt đầu trên video xuất (ms). */
  start: number
  /** Độ dài đoạn trên timeline (ms), có thể ngắn hơn file một chút khi câu đọc dài hơn chỗ trống. */
  duration: number
}

/** Cho phép cắt tối đa phần này của câu đọc khi dài hơn chỗ trống tới dòng sau. */
const DUB_MAX_CUT = 0.15

/**
 * Chỗ trống cho câu đọc của dòng `index` trên video xuất: từ đầu dòng tới đầu dòng kế (hoặc hết
 * video). Null khi dòng đã bị cắt khỏi video.
 */
export function dubSlots(
  lines: readonly Pick<CaptionLine, 'id' | 'start'>[],
  clips: readonly Clip[],
  outputDurationMs: number,
): ({ lineId: string; start: number; slot: number } | null)[] {
  const starts = lines.map((l) => sourceToOutput(clips, l.start))
  return lines.map((line, i) => {
    const start = starts[i]
    if (start === null || start === undefined) return null
    let next = outputDurationMs
    for (let k = i + 1; k < lines.length; k++) {
      const s = starts[k]
      if (s !== null && s !== undefined) {
        next = s
        break
      }
    }
    const slot = Math.max(0, Math.min(outputDurationMs, next) - start)
    return slot < MIN_AUDIO_CLIP_MS ? null : { lineId: line.id, start, slot }
  })
}

/**
 * Tốc độ đọc nên dùng để câu đọc (dài `assetMs` ở tốc độ 1) vừa chỗ trống `slotMs`: 1 khi đã
 * vừa (hoặc lệch dưới 5 %), không quá `maxSpeed` (ElevenLabs / Piper đọc tự nhiên tới ~1.2×).
 */
export function dubSpeedFor(assetMs: number, slotMs: number, maxSpeed = 1.2): number {
  if (assetMs <= 0 || slotMs <= 0) return 1
  const ratio = assetMs / slotMs
  if (ratio <= 1.05) return 1
  return Math.round(Math.min(maxSpeed, ratio) * 100) / 100
}

/** Độ dài đoạn trên timeline cho câu đọc dài `assetMs` trong chỗ trống `slotMs`. */
export function dubDuration(assetMs: number, slotMs: number, remainingMs: number): number {
  const allowed = Math.max(slotMs, assetMs * (1 - DUB_MAX_CUT))
  return Math.max(MIN_AUDIO_CLIP_MS, Math.min(assetMs, allowed, remainingMs))
}

/**
 * Xếp các câu đọc lên video xuất theo thời điểm của từng dòng phụ đề: mỗi câu bắt đầu đúng lúc
 * dòng bắt đầu; câu dài hơn chỗ trống được cắt tối đa 15 % (còn lại chờm nhẹ sang dòng sau).
 */
export function planDubClips(
  lines: readonly Pick<CaptionLine, 'id' | 'start'>[],
  clips: readonly Clip[],
  assetMsById: ReadonlyMap<string, number>,
  outputDurationMs: number,
): DubPlacement[] {
  const out: DubPlacement[] = []
  for (const slot of dubSlots(lines, clips, outputDurationMs)) {
    if (!slot) continue
    const assetMs = assetMsById.get(slot.lineId)
    if (!assetMs || assetMs <= 0) continue
    const duration = dubDuration(assetMs, slot.slot, outputDurationMs - slot.start)
    if (duration < MIN_AUDIO_CLIP_MS) continue
    out.push({ lineId: slot.lineId, start: slot.start, duration })
  }
  return out
}
