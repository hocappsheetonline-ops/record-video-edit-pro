import { describe, expect, it } from 'vitest'
import {
  CAPTION_TEMPLATES,
  captionChunk,
  DEFAULT_CAPTION_LOOK,
  mergeCaptionLine,
  parseCaptionLook,
  setCaptionTiming,
  splitCaptionLine,
  withCaptionTemplate,
  wordBounce,
} from './caption-style'
import type { CaptionLine } from './captions'
import type { Segment } from '../project'
import { parseEditState } from './edit-state'

const w = (text: string, start: number, end: number) => ({ text, start, end })
const line = (id: string, words: ReturnType<typeof w>[]): CaptionLine => ({
  id,
  start: words[0]!.start,
  end: words[words.length - 1]!.end,
  text: words.map((x) => x.text).join(' '),
  words,
  edited: false,
})

describe('mẫu phụ đề', () => {
  it('14 mẫu; đổi mẫu lấy phông / màu của mẫu nhưng giữ vị trí', () => {
    expect(CAPTION_TEMPLATES).toHaveLength(14)
    expect(CAPTION_TEMPLATES).toEqual(
      expect.arrayContaining(['typewriter', 'wave', 'slideUp', 'shadowPop', 'gradient', 'comic']),
    )
    expect(withCaptionTemplate(DEFAULT_CAPTION_LOOK, 'comic')).toMatchObject({
      font: 'bangers',
      keywordColor: '#ffffff',
    })
    expect(parseCaptionLook({ keywordColor: '#ABC123' }, 'bottom').keywordColor).toBe('#abc123')
    expect(parseCaptionLook({ keywordColor: 'red' }, 'bottom').keywordColor).toBe(
      DEFAULT_CAPTION_LOOK.keywordColor,
    )
    const moved = { ...DEFAULT_CAPTION_LOOK, y: 0.4 }
    const tiktok = withCaptionTemplate(moved, 'tiktok')
    expect(tiktok).toMatchObject({ template: 'tiktok', uppercase: true, maxWords: 3, y: 0.4 })
  })

  it('đọc file: thiếu thì theo vị trí cũ, giá trị sai về mặc định, kẹp giới hạn', () => {
    expect(parseCaptionLook(undefined, 'top')).toEqual({ ...DEFAULT_CAPTION_LOOK, y: 0.12 })
    expect(
      parseCaptionLook(
        {
          template: 'neon',
          font: 'comic',
          color: 'red',
          highlightColor: '#ABCDEF',
          maxWords: 99,
          y: 2,
        },
        'bottom',
      ),
    ).toMatchObject({
      template: 'neon',
      font: 'montserrat',
      color: '#ffffff',
      highlightColor: '#abcdef',
      maxWords: 8,
      y: 0.95,
    })
  })

  it('dự án cũ (chưa có mẫu) vẫn mở được, phụ đề trên thì mẫu đặt ở trên', () => {
    const project = {
      segments: [{ index: 0, startedAt: 0, endedAt: 5000, tracks: {} }] as Segment[],
      cursorHidden: false,
      fps: 30,
    }
    const edit = parseEditState(
      {
        version: 1,
        captions: {
          enabled: true,
          position: 'top',
          lines: [{ text: 'a', start: 0, end: 500, translation: 'b' }],
        },
      },
      project,
    )
    expect(edit.captions.look.y).toBe(0.12)
    expect(edit.captions.bilingual).toBe(false)
    expect(edit.captions.lines[0]!.translation).toBe('b')
  })

  it('chỉ hiện vài từ một lúc: nhóm chứa từ đang nói', () => {
    expect(captionChunk(7, -1, 3)).toEqual([0, 3])
    expect(captionChunk(7, 4, 3)).toEqual([3, 6])
    expect(captionChunk(7, 6, 3)).toEqual([6, 7])
    expect(captionChunk(7, 4, 0)).toEqual([0, 7])
    expect(captionChunk(2, 1, 3)).toEqual([0, 2])
  })

  it('từ nảy lên rồi về cỡ thường', () => {
    expect(wordBounce(0)).toBe(1)
    expect(wordBounce(110)).toBeCloseTo(1.25)
    expect(wordBounce(400)).toBe(1)
  })
})

describe('gộp / tách / chỉnh thời gian dòng phụ đề', () => {
  const lines = [
    line('a', [w('Xin', 0, 300), w('chào', 300, 600), w('các', 700, 900), w('bạn', 900, 1200)]),
    line('b', [w('Hôm', 1500, 1700), w('nay', 1700, 2000)]),
  ]

  it('gộp với dòng sau: nối chữ, nối từ, thời gian bao trọn', () => {
    const merged = mergeCaptionLine(lines, 'a')
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'a',
      start: 0,
      end: 2000,
      text: 'Xin chào các bạn Hôm nay',
    })
    expect(merged[0]!.words).toHaveLength(6)
    expect(mergeCaptionLine(lines, 'b')).toEqual(lines)
  })

  it('tách theo từ gốc: chia đôi số từ, cắt giữa hai từ', () => {
    const split = splitCaptionLine(lines, 'a')
    expect(split.map((l) => l.text)).toEqual(['Xin chào', 'các bạn', 'Hôm nay'])
    expect(split[0]!.end).toBe(650)
    expect(split[1]!.start).toBe(650)
    expect(split[1]!.id).not.toBe('a')
  })

  it('tách dòng đã sửa tay: chia theo chữ, thời gian theo tỉ lệ ký tự', () => {
    const edited = [{ ...lines[0]!, text: 'một hai', words: [], edited: true }]
    const split = splitCaptionLine(edited, 'a')
    expect(split.map((l) => [l.text, l.start, l.end])).toEqual([
      ['một', 0, 600],
      ['hai', 600, 1200],
    ])
    // Một từ: không tách được.
    expect(splitCaptionLine([{ ...edited[0]!, text: 'một' }], 'a')).toHaveLength(1)
  })

  it('kéo mép: không chồng dòng bên cạnh, tối thiểu 200ms', () => {
    let r = setCaptionTiming(lines, 'a', 0, 1800)
    expect(r[0]!.end).toBe(1500)
    r = setCaptionTiming(lines, 'b', 1000, 1100)
    expect([r[1]!.start, r[1]!.end]).toEqual([1200, 1400])
  })
})
