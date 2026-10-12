import { describe, expect, it } from 'vitest'
import {
  findFillerWords,
  findSilences,
  indexedTranscript,
  timestampedTranscript,
  wordsToRanges,
} from './ai-edit'
import type { TranscriptWord } from './captions'

const w = (text: string, start: number, end: number): TranscriptWord => ({ text, start, end })
const words = [
  w('Xin', 0, 300),
  w('ừm,', 400, 700),
  w('chào', 800, 1100),
  w('các', 3000, 3200),
  w('bạn', 3300, 3600),
]

describe('ai-edit', () => {
  it('tìm từ đệm tiếng Việt và tiếng Anh', () => {
    expect(findFillerWords(words, 'vi')).toEqual([1])
    expect(findFillerWords([w('So', 0, 1), w('um', 1, 2), w('yeah', 2, 3)], 'en')).toEqual([1])
  })

  it('bỏ từ: cắt từ đầu từ bỏ tới đầu từ giữ kế tiếp, gộp các từ liền nhau', () => {
    expect(wordsToRanges(words, [1])).toEqual([{ start: 400, end: 800 }])
    expect(wordsToRanges(words, [3, 4])).toEqual([{ start: 3000, end: 3600 }])
    expect(wordsToRanges(words, [0, 99])).toEqual([{ start: 0, end: 400 }])
  })

  it('rút ngắn khoảng lặng dài, chừa lại một chút', () => {
    expect(findSilences(words)).toEqual([{ start: 1275, end: 2825 }])
    expect(findSilences(words, 5000)).toEqual([])
  })

  it('văn bản gửi cho AI', () => {
    expect(indexedTranscript(words.slice(0, 2))).toBe('[0]Xin [1]ừm,')
    expect(timestampedTranscript(words, 2000)).toBe('[0:00] Xin ừm, chào \n[0:03] các bạn')
  })
})
