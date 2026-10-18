import { describe, expect, it } from 'vitest'
import type { TranscriptWord } from './captions'
import { outputDuration, sourceToOutput, type Clip } from './timeline'
import {
  cutAllFillers,
  cutAllGaps,
  cutPhrase,
  cutTranscriptWords,
  findPhrase,
  keptTranscriptText,
  restoreSourceRange,
  restoreTranscriptWords,
  transcriptStats,
  transcriptTokens,
} from './transcript-edit'

const w = (text: string, start: number, end: number): TranscriptWord => ({ text, start, end })
// "Xin chào ừm các bạn. [lặng 2,3 s] Hôm nay mình ờ demo. [lặng 3 s] Xin chào."
const words = [
  w('Xin', 0, 300),
  w('chào', 350, 700),
  w('ừm', 800, 1000),
  w('các', 1100, 1300),
  w('bạn.', 1350, 1700),
  w('Hôm', 4000, 4300),
  w('nay', 4350, 4600),
  w('mình', 4650, 4900),
  w('ờ', 5000, 5200),
  w('demo.', 5300, 5700),
  w('Xin', 8700, 9000),
  w('chào.', 9050, 9400),
]
const full: Clip[] = [{ id: 'c1', sourceStart: 0, sourceEnd: 10_000, speed: 1 }]
const kept = (clips: readonly Clip[]) => keptTranscriptText(transcriptTokens(words, clips, 'vi'))

describe('transcriptTokens', () => {
  it('đánh dấu từ đệm, chèn ô khoảng lặng ở khoảng nghỉ dài và mở đoạn văn mới', () => {
    const tokens = transcriptTokens(words, full, 'vi')
    const kinds = tokens.map((t) => (t.kind === 'gap' ? `gap${t.durationMs}` : t.text))
    expect(kinds).toEqual([
      'Xin',
      'chào',
      'ừm',
      'các',
      'bạn.',
      'gap2300',
      'Hôm',
      'nay',
      'mình',
      'ờ',
      'demo.',
      'gap3000',
      'Xin',
      'chào.',
    ])
    const fillers = tokens.filter((t) => t.kind === 'word' && t.filler).map((t) => t.index)
    expect(fillers).toEqual([2, 8])
    const paragraphs = tokens.filter((t) => t.kind === 'word' && t.paragraph).map((t) => t.index)
    // Đoạn mới sau khoảng nghỉ ≥ 2,5 s (3 s trước "Xin chào." cuối), và từ đầu tiên.
    expect(paragraphs).toEqual([0, 10])
    const gap = tokens[5]!
    expect(gap.kind).toBe('gap')
    // Chừa 175 ms mỗi đầu.
    expect(gap).toMatchObject({ start: 1875, end: 3825, cut: false })
    expect(tokens.every((t) => !t.cut)).toBe(true)
    expect(transcriptStats(tokens)).toEqual({ words: 12, fillers: 2, gaps: 2, cutWords: 0 })
  })

  it('từ và khoảng lặng nằm trong phần đã cắt khỏi timeline được đánh dấu đã cắt', () => {
    const clips: Clip[] = [
      { id: 'a', sourceStart: 0, sourceEnd: 800, speed: 1 },
      { id: 'b', sourceStart: 1100, sourceEnd: 1800, speed: 1 },
      { id: 'c', sourceStart: 3900, sourceEnd: 10_000, speed: 1 },
    ]
    const tokens = transcriptTokens(words, clips, 'vi')
    expect(tokens.filter((t) => t.cut).map((t) => (t.kind === 'gap' ? 'gap' : t.text))).toEqual([
      'ừm',
      'gap',
    ])
    expect(transcriptStats(tokens)).toEqual({ words: 12, fillers: 1, gaps: 1, cutWords: 1 })
    expect(kept(clips)).toBe('Xin chào các bạn. Hôm nay mình ờ demo. Xin chào.')
  })
})

describe('cutTranscriptWords / restoreTranscriptWords', () => {
  it('xóa chữ thì cắt đoạn video tương ứng (tới đầu từ kế tiếp); khôi phục chèn lại đúng chỗ', () => {
    const cut = cutTranscriptWords(full, words, [2])
    expect(cut.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 800],
      [1100, 10_000],
    ])
    expect(kept(cut)).toBe('Xin chào các bạn. Hôm nay mình ờ demo. Xin chào.')
    expect(outputDuration(cut)).toBe(9700)

    const restored = restoreTranscriptWords(cut, words, [2])
    expect(restored.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([[0, 10_000]])
    expect(kept(restored)).toBe(kept(full))
  })

  it('xóa một cụm liền nhau là một khoảng cắt; chỉ số ngoài phạm vi bị bỏ qua', () => {
    const cut = cutTranscriptWords(full, words, [5, 6, 7, 99, -1])
    expect(cut.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 4000],
      [5000, 10_000],
    ])
    expect(kept(cut)).toBe('Xin chào ừm các bạn. ờ demo. Xin chào.')
    expect(cutTranscriptWords(full, words, [])).toEqual(full)
  })

  it('cắt từ ở đầu / cuối video rồi khôi phục', () => {
    const cutStart = cutTranscriptWords(full, words, [0])
    expect(cutStart[0]).toMatchObject({ sourceStart: 350 })
    expect(restoreTranscriptWords(cutStart, words, [0])).toMatchObject([
      { sourceStart: 0, sourceEnd: 10_000 },
    ])
    const cutEnd = cutTranscriptWords(full, words, [11])
    expect(cutEnd.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 9050],
      [9400, 10_000],
    ])
    expect(restoreTranscriptWords(cutEnd, words, [11])).toMatchObject([
      { sourceStart: 0, sourceEnd: 10_000 },
    ])
  })

  it('khôi phục giữ nguyên clip có cài đặt khác (không gộp) và tôn trọng thứ tự clip', () => {
    const clips: Clip[] = [
      { id: 'a', sourceStart: 0, sourceEnd: 800, speed: 2 },
      { id: 'b', sourceStart: 1100, sourceEnd: 10_000, speed: 1 },
    ]
    const restored = restoreSourceRange(clips, { start: 800, end: 1100 })
    expect(restored.map((c) => [c.sourceStart, c.sourceEnd, c.speed])).toEqual([
      [0, 800, 2],
      [800, 10_000, 1],
    ])
    // Khôi phục đoạn đã có trên timeline: không đổi gì.
    expect(restoreSourceRange(restored, { start: 0, end: 500 })).toEqual(restored)
    // Clip đứng yên không ảnh hưởng.
    const withFreeze: Clip[] = [
      { id: 'f', sourceStart: 500, sourceEnd: 500, speed: 1, freeze: 1000 },
      { id: 'b', sourceStart: 1100, sourceEnd: 10_000, speed: 1 },
    ]
    expect(restoreSourceRange(withFreeze, { start: 0, end: 1100 })).toMatchObject([
      { freeze: 1000 },
      { sourceStart: 0, sourceEnd: 10_000 },
    ])
  })
})

describe('cutAllFillers / cutAllGaps', () => {
  it('bỏ mọi từ đệm còn lại; gọi lại lần hai không làm gì', () => {
    const first = cutAllFillers(full, words, 'vi')
    expect(first.count).toBe(2)
    expect(kept(first.clips)).toBe('Xin chào các bạn. Hôm nay mình demo. Xin chào.')
    const again = cutAllFillers(first.clips, words, 'vi')
    expect(again.count).toBe(0)
    expect(again.clips).toEqual(first.clips)
  })

  it('rút ngắn mọi khoảng lặng dài, chừa lại một chút; tiếng Anh cũng nhận um / uh', () => {
    const gaps = cutAllGaps(full, words)
    expect(gaps.count).toBe(2)
    expect(gaps.clips.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 1875],
      [3825, 5875],
      [8525, 10_000],
    ])
    expect(kept(gaps.clips)).toBe(kept(full))
    expect(cutAllGaps(gaps.clips, words).count).toBe(0)
    const en = [w('So', 0, 200), w('um', 300, 500), w('hello', 600, 900)]
    expect(cutAllFillers(full, en, 'en').count).toBe(1)
  })
})

describe('findPhrase / cutPhrase', () => {
  it('tìm cụm từ không phân biệt hoa thường và dấu câu, mọi lần hoặc lần đầu', () => {
    expect(findPhrase(words, 'xin chào')).toEqual([
      [0, 1],
      [10, 11],
    ])
    expect(findPhrase(words, '"Xin chào."', false)).toEqual([[0, 1]])
    expect(findPhrase(words, 'hôm nay mình ờ demo')).toEqual([[5, 6, 7, 8, 9]])
    expect(findPhrase(words, 'không có')).toEqual([])
    expect(findPhrase(words, '   ')).toEqual([])
  })

  it('cắt cụm từ khỏi video (mọi lần xuất hiện), bỏ qua lần đã cắt rồi', () => {
    const cut = cutPhrase(full, words, 'xin chào')
    expect(cut.count).toBe(2)
    expect(kept(cut.clips)).toBe('ừm các bạn. Hôm nay mình ờ demo.')
    expect(sourceToOutput(cut.clips, 100)).toBeNull()
    expect(cutPhrase(cut.clips, words, 'xin chào').count).toBe(0)
    const first = cutPhrase(full, words, 'Xin chào', false)
    expect(first.count).toBe(1)
    expect(kept(first.clips)).toBe('ừm các bạn. Hôm nay mình ờ demo. Xin chào.')
    expect(cutPhrase(full, words, 'không có').count).toBe(0)
  })
})
