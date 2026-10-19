import { describe, expect, it } from 'vitest'
import {
  applyCaptionEmojis,
  applyCaptionKeywords,
  cleanCaptionEmoji,
  cleanCaptionKeywords,
  clearCaptionDecor,
  dubDuration,
  dubSlots,
  dubSpeedFor,
  isCaptionKeyword,
  planDubClips,
  suggestCaptionEmoji,
  suggestCaptionKeywords,
} from './captions-ai'
import type { CaptionLine } from './captions'
import type { Clip } from './timeline'

const line = (id: string, start: number, text: string): CaptionLine => ({
  id,
  start,
  end: start + 800,
  text,
  words: [],
  edited: false,
})

describe('phụ đề kiểu Captions: emoji và từ khóa', () => {
  it('lọc emoji: bỏ chữ / số / khoảng trắng / quá dài; giữ emoji ghép', () => {
    expect(cleanCaptionEmoji('🔥')).toBe('🔥')
    expect(cleanCaptionEmoji(' 👍🏽 ')).toBe('👍🏽')
    expect(cleanCaptionEmoji('ok 👍')).toBe('')
    expect(cleanCaptionEmoji('🎉🎉🎉🎉🎉🎉🎉🎉🎉')).toBe('')
    expect(cleanCaptionEmoji(5)).toBe('')
  })

  it('từ khóa chỉ giữ từ có trong dòng, không phân biệt hoa thường / dấu câu, tối đa 3, bỏ trùng', () => {
    const text = 'Bấm Lưu, giá chỉ 99k thôi nhé!'
    expect(
      cleanCaptionKeywords(text, ['lưu', 'GIÁ 99k', 'không có', 'Lưu', 'thôi', 'nhé']),
    ).toEqual(['Lưu', 'giá', '99k'])
    expect(cleanCaptionKeywords(text, 'lưu')).toEqual([])
    expect(isCaptionKeyword('Lưu,', ['lưu'])).toBe(true)
    expect(isCaptionKeyword('lưu', undefined)).toBe(false)
    expect(isCaptionKeyword('!', ['!'])).toBe(false)
  })

  it('gắn / bỏ emoji và từ khóa theo id dòng, đếm số dòng đổi', () => {
    const lines = [line('a', 0, 'Xin chào các bạn'), line('b', 1000, 'Bấm Lưu nhé')]
    const e = applyCaptionEmojis(lines, [
      { id: 'a', emoji: '👋' },
      { id: 'b', emoji: 'abc' },
      { id: 'zzz', emoji: '🔥' },
    ])
    expect(e.count).toBe(1)
    expect(e.lines[0]!.emoji).toBe('👋')
    expect(e.lines[1]!.emoji).toBeUndefined()
    // Gắn lại cùng emoji: không đổi; chuỗi rỗng: bỏ.
    expect(applyCaptionEmojis(e.lines, [{ id: 'a', emoji: '👋' }]).count).toBe(0)
    const off = applyCaptionEmojis(e.lines, [{ id: 'a', emoji: '' }])
    expect(off.count).toBe(1)
    expect(off.lines[0]!.emoji).toBeUndefined()

    const k = applyCaptionKeywords(lines, [
      { id: 'a', keywords: ['bạn'] },
      { id: 'b', keywords: ['lưu', 'xyz'] },
    ])
    expect(k.count).toBe(2)
    expect(k.lines.map((l) => l.keywords)).toEqual([['bạn'], ['Lưu']])
    expect(applyCaptionKeywords(k.lines, [{ id: 'b', keywords: ['Lưu'] }]).count).toBe(0)
    const cleared = clearCaptionDecor(
      applyCaptionEmojis(k.lines, [{ id: 'a', emoji: '👋' }]).lines,
      { emoji: true, keywords: true },
    )
    expect(cleared.every((l) => l.emoji === undefined && l.keywords === undefined)).toBe(true)
  })

  it('gợi ý không cần AI: emoji theo từ điển vi/en; từ khóa ưu tiên số, tên riêng, từ dài', () => {
    expect(suggestCaptionEmoji('Xin chào các bạn')).toBe('👋')
    expect(suggestCaptionEmoji('Please Save the file')).toBe('💾')
    expect(suggestCaptionEmoji('Bấm nút này')).toBe('👆')
    expect(suggestCaptionEmoji('ờ à')).toBe('')
    expect(suggestCaptionKeywords('Giá chỉ 99k cho Lumora hôm nay')).toEqual(['99k', 'Lumora'])
    expect(suggestCaptionKeywords('mình demo tính năng chuyển cảnh')).toEqual(['chuyển'])
    expect(suggestCaptionKeywords('và là của', 2)).toEqual([])
  })
})

describe('lồng tiếng AI: xếp câu đọc theo dòng phụ đề', () => {
  // Clip 1: nguồn 1000-6000 → xuất 0-5000; clip 2: nguồn 9000-11000 → xuất 5000-7000.
  const clips: Clip[] = [
    { id: 'c1', sourceStart: 1000, sourceEnd: 6000, speed: 1 },
    { id: 'c2', sourceStart: 9000, sourceEnd: 11000, speed: 1 },
  ]
  const lines = [
    line('a', 1500, 'một'),
    line('b', 3500, 'hai'),
    line('cut', 7000, 'đã bị cắt'),
    line('c', 9500, 'ba'),
  ]

  it('dubSlots: bắt đầu đúng thời điểm dòng trên video xuất, kéo tới dòng kế / hết video; dòng bị cắt = null', () => {
    expect(dubSlots(lines, clips, 7000)).toEqual([
      { lineId: 'a', start: 500, slot: 2000 },
      { lineId: 'b', start: 2500, slot: 3000 },
      null,
      { lineId: 'c', start: 5500, slot: 1500 },
    ])
    // Dòng sát cuối video (chỗ trống < 200 ms) không đọc.
    expect(dubSlots([line('x', 10_950, 'x')], clips, 7000)).toEqual([null])
  })

  it('dubSpeedFor: 1 khi vừa (lệch ≤ 5 %), tăng theo tỷ lệ tới 1.2×', () => {
    expect(dubSpeedFor(1000, 2000)).toBe(1)
    expect(dubSpeedFor(2100, 2000)).toBe(1)
    expect(dubSpeedFor(2300, 2000)).toBe(1.15)
    expect(dubSpeedFor(4000, 2000)).toBe(1.2)
    expect(dubSpeedFor(4000, 2000, 1.5)).toBe(1.5)
    expect(dubSpeedFor(0, 2000)).toBe(1)
  })

  it('dubDuration / planDubClips: cắt tối đa 15 % câu đọc, không vượt phần còn lại của video', () => {
    expect(dubDuration(1000, 2000, 5000)).toBe(1000)
    expect(dubDuration(3000, 2000, 5000)).toBe(2550)
    expect(dubDuration(3000, 2000, 1000)).toBe(1000)
    const plan = planDubClips(
      lines,
      clips,
      new Map([
        ['a', 1000],
        ['b', 4000],
        ['c', 2000],
      ]),
      7000,
    )
    expect(plan).toEqual([
      { lineId: 'a', start: 500, duration: 1000 },
      { lineId: 'b', start: 2500, duration: 3400 },
      { lineId: 'c', start: 5500, duration: 1500 },
    ])
  })
})
