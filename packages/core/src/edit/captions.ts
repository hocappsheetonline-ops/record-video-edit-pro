import { sourceToOutput, type Clip } from './timeline'

/** Một từ trong bản ghi lời nói, thời gian tính theo thời gian nguồn (ms). */
export interface TranscriptWord {
  text: string
  start: number
  end: number
}

export interface Transcript {
  language: string
  words: TranscriptWord[]
}

export const TRANSCRIPT_FILE = 'transcript.json'

export interface CaptionLine {
  id: string
  start: number
  end: number
  /** Nội dung hiển thị (người dùng có thể sửa). */
  text: string
  /** Các từ gốc để tô sáng từng từ; bỏ qua khi người dùng đã sửa nội dung. */
  words: TranscriptWord[]
  edited: boolean
}

export interface CaptionsState {
  enabled: boolean
  /** `highlight`: tô màu từ đang nói (kiểu TikTok); `classic`: cả dòng. */
  style: 'highlight' | 'classic'
  position: 'bottom' | 'top'
  /** Hệ số cỡ chữ (1 = mặc định). */
  size: number
  language: string
  lines: CaptionLine[]
}

export const DEFAULT_CAPTIONS: CaptionsState = {
  enabled: false,
  style: 'highlight',
  position: 'bottom',
  size: 1,
  language: '',
  lines: [],
}

export interface LineOptions {
  maxChars?: number
  maxDurationMs?: number
  /** Ngắt dòng khi người nói dừng lâu hơn khoảng này. */
  pauseMs?: number
}

const SENTENCE_END = /[.!?…。]$/

/**
 * Chia các từ thành dòng phụ đề dễ đọc: tối đa ~42 ký tự và 4 giây mỗi dòng,
 * ngắt ở cuối câu hoặc khi người nói dừng.
 */
export function buildCaptionLines(
  words: readonly TranscriptWord[],
  options: LineOptions = {},
): CaptionLine[] {
  const maxChars = options.maxChars ?? 42
  const maxDuration = options.maxDurationMs ?? 4000
  const pause = options.pauseMs ?? 700
  const lines: CaptionLine[] = []
  let current: TranscriptWord[] = []

  const flush = () => {
    if (current.length === 0) return
    lines.push({
      id: `l${lines.length}`,
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      text: current.map((w) => w.text).join(' '),
      words: current,
      edited: false,
    })
    current = []
  }

  for (const word of words) {
    if (!word.text.trim()) continue
    const prev = current[current.length - 1]
    if (prev) {
      const length = current.map((w) => w.text).join(' ').length + 1 + word.text.length
      const tooLong = length > maxChars || word.end - current[0]!.start > maxDuration
      if (tooLong || word.start - prev.end > pause || SENTENCE_END.test(prev.text)) flush()
    }
    current.push(word)
  }
  flush()
  return lines
}

/** Dòng phụ đề và chỉ số từ đang nói tại thời điểm nguồn `s`. */
export function captionAt(
  lines: readonly CaptionLine[],
  s: number,
): { line: CaptionLine; wordIndex: number } | null {
  const line = lines.find((l) => s >= l.start && s <= l.end)
  if (!line) return null
  let wordIndex = -1
  line.words.forEach((w, i) => {
    if (s >= w.start) wordIndex = i
  })
  return { line, wordIndex }
}

function stamp(ms: number, separator: ',' | '.'): string {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const milli = total % 1000
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)}${separator}${p(milli, 3)}`
}

/** Thời gian các dòng trên video xuất (đã cắt); dòng bị cắt hết thì bỏ. */
export function linesOnOutput(
  lines: readonly CaptionLine[],
  clips: readonly Clip[],
): { start: number; end: number; text: string }[] {
  const result: { start: number; end: number; text: string }[] = []
  for (const line of lines) {
    // Lấy mẫu dày để tìm phần còn lại của dòng sau khi cắt.
    let start: number | null = null
    let end: number | null = null
    for (let s = line.start; s <= line.end; s += 20) {
      const t = sourceToOutput(clips, s)
      if (t === null) continue
      start ??= t
      end = t
    }
    const last = sourceToOutput(clips, line.end)
    if (last !== null) end = last
    // Dòng chưa sửa tay: bỏ các từ đã bị cắt khỏi video.
    const text =
      !line.edited && line.words.length > 0
        ? line.words
            .filter((w) => sourceToOutput(clips, (w.start + w.end) / 2) !== null)
            .map((w) => w.text)
            .join(' ')
        : line.text
    if (text && start !== null && end !== null && end > start) result.push({ start, end, text })
  }
  return result
}

export function toSrt(lines: readonly CaptionLine[], clips: readonly Clip[]): string {
  return linesOnOutput(lines, clips)
    .map((l, i) => `${i + 1}\n${stamp(l.start, ',')} --> ${stamp(l.end, ',')}\n${l.text}\n`)
    .join('\n')
}

export function toVtt(lines: readonly CaptionLine[], clips: readonly Clip[]): string {
  const body = linesOnOutput(lines, clips)
    .map((l) => `${stamp(l.start, '.')} --> ${stamp(l.end, '.')}\n${l.text}\n`)
    .join('\n')
  return `WEBVTT\n\n${body}`
}

/** Đổi kết quả của ElevenLabs Speech-to-Text (giây) thành danh sách từ (ms), bỏ khoảng trắng và tiếng động. */
export function wordsFromElevenLabs(response: unknown): Transcript {
  const r = (typeof response === 'object' && response !== null ? response : {}) as Record<
    string,
    unknown
  >
  const words: TranscriptWord[] = []
  if (Array.isArray(r.words)) {
    for (const w of r.words) {
      if (typeof w !== 'object' || w === null) continue
      const item = w as Record<string, unknown>
      if (item.type !== undefined && item.type !== 'word') continue
      if (
        typeof item.text !== 'string' ||
        typeof item.start !== 'number' ||
        typeof item.end !== 'number'
      )
        continue
      const text = item.text.trim()
      if (!text) continue
      words.push({ text, start: Math.round(item.start * 1000), end: Math.round(item.end * 1000) })
    }
  }
  return { language: typeof r.language_code === 'string' ? r.language_code : '', words }
}
