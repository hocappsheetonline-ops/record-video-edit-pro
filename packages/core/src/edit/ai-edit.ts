import type { TranscriptWord } from './captions'
import type { SourceRange } from './timeline'
import type { Waveform } from './waveform'

export interface CutSuggestion {
  id: string
  kind: 'filler' | 'repeat' | 'silence' | 'other'
  start: number
  end: number
  /** Đoạn lời bị cắt (rỗng với khoảng lặng). */
  text: string
  reason: string
}

const FILLERS: Record<string, string[]> = {
  vi: ['ừm', 'ừ', 'ờ', 'ơ', 'à', 'ạ', 'ừmm', 'ờm', 'hừm', 'ê'],
  en: ['um', 'uh', 'umm', 'uhm', 'erm', 'er', 'ah', 'hmm', 'mm'],
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?…"'“”]/g, '')
    .trim()

/** Từ đệm phổ biến (ừm, à, um, uh...) — kết quả cơ bản, không cần AI. */
export function findFillerWords(words: readonly TranscriptWord[], language: string): number[] {
  const lang = language.toLowerCase().startsWith('vi')
    ? 'vi'
    : language.toLowerCase().startsWith('en')
      ? 'en'
      : null
  const list = lang ? FILLERS[lang]! : [...FILLERS.vi!, ...FILLERS.en!]
  return words.flatMap((w, i) => (list.includes(normalize(w.text)) ? [i] : []))
}

/**
 * Khoảng thời gian nguồn cần cắt khi bỏ các từ theo chỉ số: cắt từ đầu từ bị bỏ tới đầu từ được giữ kế tiếp,
 * nên khoảng lặng ngay sau từ thừa cũng đi theo.
 */
export function wordsToRanges(
  words: readonly TranscriptWord[],
  indices: readonly number[],
): SourceRange[] {
  const remove = new Set(indices.filter((i) => i >= 0 && i < words.length))
  const ranges: SourceRange[] = []
  let i = 0
  while (i < words.length) {
    if (!remove.has(i)) {
      i++
      continue
    }
    const startIndex = i
    while (i < words.length && remove.has(i)) i++
    const start = words[startIndex]!.start
    const end = i < words.length ? words[i]!.start : words[i - 1]!.end
    if (end > start) ranges.push({ start, end })
  }
  return ranges
}

/** Rút ngắn các khoảng lặng dài giữa hai câu, chừa lại một chút cho tự nhiên. */
export function findSilences(
  words: readonly TranscriptWord[],
  minGapMs = 1200,
  keepMs = 350,
): SourceRange[] {
  const ranges: SourceRange[] = []
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.start - words[i - 1]!.end
    if (gap < minGapMs) continue
    const start = words[i - 1]!.end + keepMs / 2
    const end = words[i]!.start - keepMs / 2
    if (end > start) ranges.push({ start: Math.round(start), end: Math.round(end) })
  }
  return ranges
}

export interface QuietOptions {
  /** Ngưỡng "im lặng": phần của mức to nhất (0–1). */
  threshold?: number
  /** Khoảng im lặng ngắn hơn thì bỏ qua (ms). */
  minMs?: number
  /** Chừa lại khoảng này (chia đều hai đầu) cho tự nhiên (ms). */
  keepMs?: number
}

/**
 * Khoảng lặng dài tìm từ dạng sóng (không cần lời thoại / API key): các ô liên tiếp nhỏ hơn ngưỡng
 * so với mức to nhất, dài hơn `minMs`, chừa lại `keepMs`.
 */
export function findQuietRanges(wave: Waveform, options: QuietOptions = {}): SourceRange[] {
  const threshold = options.threshold ?? 0.08
  const minMs = options.minMs ?? 1200
  const keepMs = options.keepMs ?? 350
  if (wave.peaks.length === 0 || wave.bucketMs <= 0) return []
  const loudest = Math.max(24, ...wave.peaks)
  const limit = loudest * threshold
  const ranges: SourceRange[] = []
  let runStart = -1
  const flush = (endIndex: number) => {
    if (runStart < 0) return
    const start = runStart * wave.bucketMs
    const end = endIndex * wave.bucketMs
    if (end - start >= minMs && end - keepMs > start + keepMs / 2)
      ranges.push({ start: Math.round(start + keepMs / 2), end: Math.round(end - keepMs / 2) })
    runStart = -1
  }
  wave.peaks.forEach((p, i) => {
    if (p <= limit) {
      if (runStart < 0) runStart = i
    } else flush(i)
  })
  flush(wave.peaks.length)
  return ranges
}

/** Văn bản kèm chỉ số từng từ, gửi cho Claude để nó chỉ ra từ cần bỏ bằng chỉ số. */
export function indexedTranscript(words: readonly TranscriptWord[]): string {
  return words.map((w, i) => `[${i}]${w.text}`).join(' ')
}

/** Văn bản kèm mốc thời gian theo câu, gửi cho Claude để tạo chương. */
export function timestampedTranscript(words: readonly TranscriptWord[], everyMs = 15_000): string {
  const parts: string[] = []
  let nextMark = 0
  for (const w of words) {
    if (w.start >= nextMark) {
      const s = Math.floor(w.start / 1000)
      parts.push(`\n[${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}]`)
      nextMark = w.start + everyMs
    }
    parts.push(w.text)
  }
  return parts.join(' ').trim()
}
