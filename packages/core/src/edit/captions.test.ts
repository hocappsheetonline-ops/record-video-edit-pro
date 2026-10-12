import { describe, expect, it } from 'vitest'
import {
  buildCaptionLines,
  captionAt,
  toSrt,
  toVtt,
  wordsFromElevenLabs,
  type TranscriptWord,
} from './captions'

const w = (text: string, start: number, end: number): TranscriptWord => ({ text, start, end })

describe('buildCaptionLines', () => {
  it('ngắt dòng ở cuối câu và khi dừng lâu', () => {
    const lines = buildCaptionLines([
      w('Xin', 0, 200),
      w('chào.', 250, 500),
      w('Hôm', 600, 800),
      w('nay', 850, 1000),
      w('mình', 2500, 2700),
      w('demo', 2750, 3000),
    ])
    expect(lines.map((l) => l.text)).toEqual(['Xin chào.', 'Hôm nay', 'mình demo'])
    expect(lines[1]).toMatchObject({ start: 600, end: 1000, edited: false })
  })

  it('không vượt quá số ký tự tối đa', () => {
    const words = Array.from({ length: 20 }, (_, i) => w('abcdefgh', i * 100, i * 100 + 90))
    const lines = buildCaptionLines(words, { maxChars: 20 })
    expect(lines.every((l) => l.text.length <= 20)).toBe(true)
  })

  it('không vượt quá thời lượng tối đa', () => {
    const words = Array.from({ length: 30 }, (_, i) => w('a', i * 300, i * 300 + 250))
    expect(
      buildCaptionLines(words, { maxDurationMs: 2000 }).every((l) => l.end - l.start <= 2000),
    ).toBe(true)
  })
})

describe('captionAt', () => {
  it('tìm dòng và từ đang nói', () => {
    const lines = buildCaptionLines([w('một', 0, 300), w('hai', 400, 700)])
    expect(captionAt(lines, 500)).toMatchObject({ wordIndex: 1, line: { text: 'một hai' } })
    expect(captionAt(lines, 900)).toBeNull()
  })
})

describe('SRT/VTT', () => {
  const lines = buildCaptionLines([w('Một.', 0, 900), w('Hai.', 2000, 2900), w('Ba.', 4000, 4900)])
  const clips = [
    { id: 'a', sourceStart: 0, sourceEnd: 1000, speed: 1 },
    { id: 'b', sourceStart: 3500, sourceEnd: 6000, speed: 1 },
  ]

  it('SRT theo thời gian video đã cắt, bỏ dòng bị cắt mất', () => {
    expect(toSrt(lines, clips)).toBe(
      '1\n00:00:00,000 --> 00:00:00,900\nMột.\n\n2\n00:00:01,500 --> 00:00:02,400\nBa.\n',
    )
  })

  it('bỏ các từ đã cắt khỏi video, trừ khi dòng đã được sửa tay', () => {
    const words = buildCaptionLines([w('Xin', 0, 300), w('ừm', 400, 600), w('chào.', 700, 1000)])
    const cut = [
      { id: 'a', sourceStart: 0, sourceEnd: 350, speed: 1 },
      { id: 'b', sourceStart: 650, sourceEnd: 2000, speed: 1 },
    ]
    expect(toSrt(words, cut)).toContain('Xin chào.')
    expect(toSrt([{ ...words[0]!, edited: true, text: 'Sửa tay' }], cut)).toContain('Sửa tay')
  })

  it('VTT dùng dấu chấm và có tiêu đề WEBVTT', () => {
    expect(toVtt(lines, clips).startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:00.900\nMột.')).toBe(
      true,
    )
  })
})

describe('wordsFromElevenLabs', () => {
  it('lấy từ (bỏ khoảng trắng, tiếng động), đổi giây sang ms', () => {
    const transcript = wordsFromElevenLabs({
      language_code: 'vie',
      text: 'Xin chào',
      words: [
        { text: 'Xin', start: 0.1, end: 0.4, type: 'word' },
        { text: ' ', start: 0.4, end: 0.45, type: 'spacing' },
        { text: '(cười)', start: 0.45, end: 0.9, type: 'audio_event' },
        { text: 'chào', start: 0.9, end: 1.2, type: 'word' },
      ],
    })
    expect(transcript).toEqual({
      language: 'vie',
      words: [w('Xin', 100, 400), w('chào', 900, 1200)],
    })
  })

  it('dữ liệu lạ thì trả về rỗng', () => {
    expect(wordsFromElevenLabs(null)).toEqual({ language: '', words: [] })
  })
})
