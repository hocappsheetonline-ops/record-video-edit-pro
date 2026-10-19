import { findFillerWords, findSilences, wordsToRanges } from './ai-edit'
import type { TranscriptWord } from './captions'
import {
  newClipId,
  removeSourceRanges,
  sourceToOutput,
  type Clip,
  type SourceRange,
} from './timeline'

/**
 * Chỉnh sửa video bằng văn bản (kiểu Descript): lời thoại hiện thành chữ, xóa chữ nào thì đoạn
 * video + tiếng tương ứng bị cắt; từ đệm ("ờ", "à", "ừm", um, uh) và khoảng lặng cũng hiện trong
 * văn bản để xóa như chữ, hoặc xóa hết bằng một nút.
 */

/** Một "ô" trong văn bản lời thoại: một từ, hoặc một khoảng lặng giữa hai từ. */
export type TranscriptToken =
  | {
      kind: 'word'
      /** Chỉ số của từ trong `transcript.words`. */
      index: number
      text: string
      start: number
      end: number
      /** Từ đệm (ờ, à, ừm, um, uh…). */
      filler: boolean
      /** Đoạn video chứa từ này đã bị cắt khỏi timeline. */
      cut: boolean
      /** Bắt đầu đoạn văn mới (sau khoảng nghỉ dài). */
      paragraph: boolean
    }
  | {
      kind: 'gap'
      /** Chỉ số của từ đứng ngay sau khoảng lặng. */
      index: number
      /** Khoảng thời gian nguồn sẽ cắt khi xóa (chừa lại một chút hai đầu cho tự nhiên). */
      start: number
      end: number
      /** Độ dài thật của khoảng lặng (ms). */
      durationMs: number
      cut: boolean
    }

export interface TranscriptTokenOptions {
  /** Khoảng nghỉ dài hơn ngưỡng này hiện thành ô khoảng lặng (ms). */
  minGapMs?: number
  /** Chừa lại khoảng này (chia đều hai đầu) khi cắt khoảng lặng (ms). */
  keepMs?: number
  /** Khoảng nghỉ dài hơn ngưỡng này bắt đầu một đoạn văn mới (ms). */
  paragraphGapMs?: number
}

export const TRANSCRIPT_GAP_MS = 700
export const TRANSCRIPT_KEEP_MS = 350
const PARAGRAPH_GAP_MS = 2500

/** Thời điểm nguồn `s` còn trên timeline không. */
function isKept(clips: readonly Clip[], s: number): boolean {
  return sourceToOutput(clips, s) !== null
}

/**
 * Văn bản lời thoại thành các ô (từ, khoảng lặng) kèm trạng thái: đã cắt hay chưa (theo
 * timeline hiện tại), có phải từ đệm không, có mở đoạn văn mới không.
 */
export function transcriptTokens(
  words: readonly TranscriptWord[],
  clips: readonly Clip[],
  language: string,
  options: TranscriptTokenOptions = {},
): TranscriptToken[] {
  const minGap = options.minGapMs ?? TRANSCRIPT_GAP_MS
  const keep = options.keepMs ?? TRANSCRIPT_KEEP_MS
  const paragraphGap = options.paragraphGapMs ?? PARAGRAPH_GAP_MS
  const fillers = new Set(findFillerWords(words, language))
  const tokens: TranscriptToken[] = []
  words.forEach((w, i) => {
    const prev = i > 0 ? words[i - 1]! : null
    const gap = prev ? w.start - prev.end : 0
    if (prev && gap >= minGap) {
      const start = Math.round(prev.end + keep / 2)
      const end = Math.round(w.start - keep / 2)
      const mid = (prev.end + w.start) / 2
      tokens.push({
        kind: 'gap',
        index: i,
        start: Math.min(start, Math.round(mid)),
        end: Math.max(end, Math.round(mid)),
        durationMs: Math.round(gap),
        cut: !isKept(clips, mid),
      })
    }
    tokens.push({
      kind: 'word',
      index: i,
      text: w.text,
      start: w.start,
      end: w.end,
      filler: fillers.has(i),
      cut: !isKept(clips, (w.start + w.end) / 2),
      paragraph: i === 0 || gap >= paragraphGap,
    })
  })
  return tokens
}

export interface TranscriptStats {
  words: number
  /** Số từ đệm còn trên timeline (chưa cắt). */
  fillers: number
  /** Số khoảng lặng còn trên timeline (chưa cắt). */
  gaps: number
  /** Số từ đã cắt. */
  cutWords: number
}

export function transcriptStats(tokens: readonly TranscriptToken[]): TranscriptStats {
  const stats: TranscriptStats = { words: 0, fillers: 0, gaps: 0, cutWords: 0 }
  for (const t of tokens) {
    if (t.kind === 'gap') {
      if (!t.cut) stats.gaps++
      continue
    }
    stats.words++
    if (t.cut) stats.cutWords++
    else if (t.filler) stats.fillers++
  }
  return stats
}

/** Cắt các từ theo chỉ số khỏi timeline (đoạn video + tiếng tương ứng, kèm khoảng nghỉ ngay sau). */
export function cutTranscriptWords(
  clips: readonly Clip[],
  words: readonly TranscriptWord[],
  indices: readonly number[],
): Clip[] {
  const ranges = wordsToRanges(words, indices)
  return ranges.length > 0 ? removeSourceRanges(clips, ranges) : [...clips]
}

/** Cắt mọi từ đệm còn trên timeline. */
export function cutAllFillers(
  clips: readonly Clip[],
  words: readonly TranscriptWord[],
  language: string,
): { clips: Clip[]; count: number } {
  const indices = findFillerWords(words, language).filter((i) =>
    isKept(clips, (words[i]!.start + words[i]!.end) / 2),
  )
  return { clips: cutTranscriptWords(clips, words, indices), count: indices.length }
}

/** Rút ngắn mọi khoảng lặng dài còn trên timeline. */
export function cutAllGaps(
  clips: readonly Clip[],
  words: readonly TranscriptWord[],
  minGapMs = TRANSCRIPT_GAP_MS,
  keepMs = TRANSCRIPT_KEEP_MS,
): { clips: Clip[]; count: number } {
  const ranges = findSilences(words, minGapMs, keepMs).filter((r) =>
    isKept(clips, (r.start + r.end) / 2),
  )
  return {
    clips: ranges.length > 0 ? removeSourceRanges(clips, ranges) : [...clips],
    count: ranges.length,
  }
}

/** Hai clip nối liền nhau trên thời gian nguồn và giống hệt cài đặt thì gộp làm một. */
function canMerge(a: Clip, b: Clip): boolean {
  if (a.freeze || b.freeze || a.reversed || b.reversed || a.speedCurve || b.speedCurve) return false
  if (a.sourceEnd !== b.sourceStart) return false
  const rest = (c: Clip) => {
    const o: Record<string, unknown> = { ...c }
    delete o.id
    delete o.sourceStart
    delete o.sourceEnd
    return JSON.stringify(o)
  }
  return rest(a) === rest(b)
}

function mergeAdjacent(clips: readonly Clip[]): Clip[] {
  const out: Clip[] = []
  for (const clip of clips) {
    const last = out[out.length - 1]
    if (last && canMerge(last, clip)) out[out.length - 1] = { ...last, sourceEnd: clip.sourceEnd }
    else out.push(clip)
  }
  return out
}

/**
 * Khôi phục một khoảng thời gian nguồn đã cắt: phần chưa có trên timeline được chèn lại đúng chỗ
 * (sau clip kết thúc trước nó, hoặc trước clip bắt đầu sau nó) và gộp với clip kề nếu nối liền.
 */
export function restoreSourceRange(clips: readonly Clip[], range: SourceRange): Clip[] {
  if (range.end <= range.start) return [...clips]
  // Các phần của khoảng chưa có trên timeline.
  let missing: SourceRange[] = [{ start: range.start, end: range.end }]
  for (const c of clips) {
    if (c.freeze) continue
    missing = missing.flatMap((m) => {
      if (c.sourceEnd <= m.start || c.sourceStart >= m.end) return [m]
      const out: SourceRange[] = []
      if (c.sourceStart > m.start) out.push({ start: m.start, end: c.sourceStart })
      if (c.sourceEnd < m.end) out.push({ start: c.sourceEnd, end: m.end })
      return out
    })
  }
  const result = [...clips]
  for (const m of missing) {
    if (m.end - m.start <= 0) continue
    const fresh: Clip = { id: newClipId(), sourceStart: m.start, sourceEnd: m.end, speed: 1 }
    // Chèn sau clip (không đứng yên) kết thúc gần nhất trước đoạn này.
    let at = -1
    let best = -Infinity
    result.forEach((c, i) => {
      if (!c.freeze && c.sourceEnd <= m.start && c.sourceEnd > best) {
        best = c.sourceEnd
        at = i
      }
    })
    if (at >= 0) result.splice(at + 1, 0, fresh)
    else {
      // Không có clip nào trước: chèn trước clip bắt đầu sớm nhất sau đoạn này.
      let firstAfter = -1
      let bestStart = Infinity
      result.forEach((c, i) => {
        if (!c.freeze && c.sourceStart >= m.end && c.sourceStart < bestStart) {
          bestStart = c.sourceStart
          firstAfter = i
        }
      })
      if (firstAfter >= 0) result.splice(firstAfter, 0, fresh)
      else result.push(fresh)
    }
  }
  return mergeAdjacent(result)
}

/** Khôi phục các từ đã cắt theo chỉ số (cùng khoảng nghỉ ngay sau, như khi cắt). */
export function restoreTranscriptWords(
  clips: readonly Clip[],
  words: readonly TranscriptWord[],
  indices: readonly number[],
): Clip[] {
  const ranges = wordsToRanges(words, indices)
  return ranges.reduce<Clip[]>((acc, r) => restoreSourceRange(acc, r), [...clips])
}

const normalizeWord = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?…;:"'“”‘’()[\]]/g, '')
    .trim()

/**
 * Tìm một cụm từ trong lời thoại (không phân biệt hoa thường, dấu câu): trả về chỉ số các từ của
 * từng lần xuất hiện. `all` = mọi lần, không thì chỉ lần đầu.
 */
export function findPhrase(
  words: readonly TranscriptWord[],
  phrase: string,
  all = true,
): number[][] {
  const target = phrase.split(/\s+/).map(normalizeWord).filter(Boolean)
  if (target.length === 0) return []
  const norm = words.map((w) => normalizeWord(w.text))
  const hits: number[][] = []
  for (let i = 0; i + target.length <= words.length; i++) {
    let ok = true
    for (let k = 0; k < target.length; k++) {
      if (norm[i + k] !== target[k]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    hits.push(Array.from({ length: target.length }, (_, k) => i + k))
    if (!all) break
    i += target.length - 1
  }
  return hits
}

/**
 * Cắt mọi lần xuất hiện (hoặc lần đầu) của một cụm từ khỏi timeline (lệnh `cutText` của AI, hay
 * người dùng gõ cụm từ cần bỏ).
 */
export function cutPhrase(
  clips: readonly Clip[],
  words: readonly TranscriptWord[],
  phrase: string,
  all = true,
): { clips: Clip[]; count: number } {
  const hits = findPhrase(words, phrase, all).filter((idx) =>
    idx.some((i) => isKept(clips, (words[i]!.start + words[i]!.end) / 2)),
  )
  if (hits.length === 0) return { clips: [...clips], count: 0 }
  return { clips: cutTranscriptWords(clips, words, hits.flat()), count: hits.length }
}

/** Văn bản lời thoại còn trên timeline (bỏ phần đã cắt), để sao chép / xem nhanh. */
export function keptTranscriptText(tokens: readonly TranscriptToken[]): string {
  return tokens
    .filter((t) => t.kind === 'word' && !t.cut)
    .map((t) => (t as Extract<TranscriptToken, { kind: 'word' }>).text)
    .join(' ')
}
