import { describe, expect, it } from 'vitest'
import {
  applyCaptionTexts,
  countCaptionMatches,
  replaceInCaptions,
  type CaptionLine,
} from './captions'

const w = (text: string, start: number, end: number) => ({ text, start, end })
const line = (id: string, words: ReturnType<typeof w>[], extra: Partial<CaptionLine> = {}) => ({
  id,
  start: words[0]!.start,
  end: words[words.length - 1]!.end,
  text: words.map((x) => x.text).join(' '),
  words,
  edited: false,
  ...extra,
})

const lines: CaptionLine[] = [
  line('a', [w('Xin', 0, 300), w('chào', 300, 600), w('Lumora', 600, 900)]),
  line('b', [w('lumora', 1000, 1300), w('rất', 1300, 1600), w('nhanh.', 1600, 1900)]),
  line('c', [w('Hôm', 2000, 2300), w('nay', 2300, 2600)], { translation: 'Today Lumora' }),
]

describe('tìm và thay thế phụ đề', () => {
  it('đếm dòng khớp, không phân biệt hoa thường trừ khi yêu cầu', () => {
    expect(countCaptionMatches(lines, 'lumora')).toBe(3)
    expect(countCaptionMatches(lines, 'lumora', { matchCase: true })).toBe(1)
    expect(countCaptionMatches(lines, '')).toBe(0)
    expect(countCaptionMatches(lines, 'nha', { wholeWord: true })).toBe(0)
    expect(countCaptionMatches(lines, 'nhanh', { wholeWord: true })).toBe(1)
  })

  it('thay trong từng từ để vẫn tô sáng được, kể cả trong bản dịch', () => {
    const { lines: next, count } = replaceInCaptions(lines, 'lumora', 'Lumora Pro'.replace(' ', ''))
    expect(count).toBe(3)
    expect(next[0]).toMatchObject({ text: 'Xin chào LumoraPro', edited: false })
    expect(next[0]!.words[2]).toEqual(w('LumoraPro', 600, 900))
    expect(next[1]!.text).toBe('LumoraPro rất nhanh.')
    expect(next[2]).toMatchObject({ text: 'Hôm nay', translation: 'Today LumoraPro' })
  })

  it('chuỗi nhiều từ thì sửa nội dung và đánh dấu đã sửa; xóa từ thì bỏ từ rỗng', () => {
    const multi = replaceInCaptions(lines, 'xin chào', 'Chào')
    expect(multi.count).toBe(1)
    expect(multi.lines[0]).toMatchObject({ text: 'Chào Lumora', edited: true })
    expect(multi.lines[0]!.words).toHaveLength(3)
    const removed = replaceInCaptions(lines, 'rất', '')
    expect(removed.lines[1]).toMatchObject({ text: 'lumora nhanh.', edited: false })
    expect(removed.lines[1]!.words.map((x) => x.text)).toEqual(['lumora', 'nhanh.'])
    // Không khớp thì giữ nguyên tham chiếu từng dòng.
    const none = replaceInCaptions(lines, 'không có', 'x')
    expect(none.count).toBe(0)
    expect(none.lines[0]).toBe(lines[0])
  })

  it('"$" trong chuỗi thay được giữ nguyên, không phải mẫu đặc biệt', () => {
    const { lines: next } = replaceInCaptions(lines, 'rất', 'cost $$ $& $1')
    expect(next[1]!.text).toBe('lumora cost $$ $& $1 nhanh.')
  })

  it('tìm được dù phụ đề hay chuỗi tìm ở dạng Unicode tách dấu (NFD)', () => {
    const nfd = [line('d', [w('cha\u0300o'.normalize('NFD'), 0, 300), w('ban', 300, 600)])]
    expect(countCaptionMatches(nfd, 'chào')).toBe(1)
    expect(countCaptionMatches(lines, 'chào'.normalize('NFD'))).toBe(1)
    const { lines: next, count } = replaceInCaptions(nfd, 'chào', 'hi')
    expect(count).toBe(1)
    expect(next[0]!.text).toBe('hi ban')
  })

  it('thay cả dòng bằng rỗng thì bỏ dòng đó', () => {
    const { lines: next, count } = replaceInCaptions(lines, 'hôm nay', '')
    expect(count).toBe(1)
    expect(next.map((l) => l.id)).toEqual(['a', 'b'])
    const perWord = replaceInCaptions([line('e', [w('ừm', 0, 300)])], 'ừm', '')
    expect(perWord.lines).toEqual([])
  })

  it('áp dụng nội dung Claude trả về theo id: chỉ dòng đổi mới đánh dấu đã sửa', () => {
    const { lines: next, count } = applyCaptionTexts(lines, [
      { id: 'a', text: 'Xin chào Lumora' },
      { id: 'b', text: 'Lumora rất nhanh.' },
      { id: 'c', text: '   ' },
      { id: 'zzz', text: 'lạ' },
    ])
    expect(count).toBe(1)
    expect(next[0]).toBe(lines[0])
    expect(next[1]).toMatchObject({ text: 'Lumora rất nhanh.', edited: true })
    expect(next[2]).toBe(lines[2])
  })
})
