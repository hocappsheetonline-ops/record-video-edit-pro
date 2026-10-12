import { describe, expect, it } from 'vitest'
import { NO_ANIM } from './overlay-fx'
import { overlayTextStyle, parseOverlays, type Overlay } from './overlays'
import { SHAPES } from './shapes'
import {
  DEFAULT_TEXT_STYLE,
  FONTS,
  fontFamily,
  legacyTextStyle,
  parseTextStyle,
  readableOn,
  TEXT_TEMPLATES,
  templateStyle,
  typewriterChars,
  WORD_STEP_MS,
  wordMotion,
} from './text-style'

describe('kiểu chữ', () => {
  it('24 mẫu chữ, id không trùng, đều dùng phông có sẵn; 10 phông', () => {
    expect(TEXT_TEMPLATES).toHaveLength(24)
    expect(new Set(TEXT_TEMPLATES.map((t) => t.id)).size).toBe(24)
    expect(FONTS).toHaveLength(10)
    for (const t of TEXT_TEMPLATES) expect(FONTS.some((f) => f.id === t.style.font)).toBe(true)
    expect(fontFamily('anton')).toMatch(/^"Anton", /)
  })

  it('kiểu cũ ánh xạ sang mẫu mới, giữ màu đã chọn', () => {
    expect(legacyTextStyle('meme', '#ff0000')).toMatchObject({
      font: 'anton',
      uppercase: true,
      color: '#ff0000',
      stroke: { width: 0.14, color: '#000000' },
    })
    // Bong bóng: màu chọn là màu nền, chữ tự đen / trắng.
    expect(legacyTextStyle('bubble', '#ffffff')).toMatchObject({
      color: '#111111',
      background: { color: '#ffffff', opacity: 1 },
    })
    expect(legacyTextStyle('bubble', '#1e3a8a').color).toBe('#ffffff')
    expect(legacyTextStyle('neon', '#22d3ee').shadow.color).toBe('#22d3ee')
    expect(readableOn('bogus')).toBe('#ffffff')
  })

  it('đọc file: giá trị sai về mặc định, kẹp trong giới hạn', () => {
    expect(parseTextStyle(undefined)).toBeUndefined()
    const s = parseTextStyle({
      font: 'comic-sans',
      weight: 300,
      lineHeight: 9,
      stroke: { width: 5, color: 'red' },
      gradient: { from: '#ff0000', angle: 999 },
      anim: 'wave',
    })!
    expect(s).toMatchObject({
      font: DEFAULT_TEXT_STYLE.font,
      weight: 700,
      lineHeight: 2,
      stroke: { width: 0.3, color: '#000000' },
      gradient: { from: '#ff0000', to: '#000000', angle: 360 },
      anim: 'wave',
    })
    expect(parseTextStyle(templateStyle('sunset'))).toEqual(templateStyle('sunset'))
  })

  it('máy đánh chữ hiện dần theo thời gian, xong trước khi lớp hết', () => {
    expect(typewriterChars(20, 0, 3000)).toBe(1)
    expect(typewriterChars(20, 500, 3000)).toBeLessThan(typewriterChars(20, 1500, 3000))
    expect(typewriterChars(20, 2400, 3000)).toBe(20)
    expect(typewriterChars(0, 100, 3000)).toBe(0)
  })

  it('hiệu ứng từng từ: từ sau xuất hiện sau từ trước; sóng lên xuống', () => {
    expect(wordMotion('wordPop', 2, WORD_STEP_MS).opacity).toBe(0)
    expect(wordMotion('wordPop', 2, WORD_STEP_MS * 2 + 400).scale).toBe(1)
    expect(wordMotion('slideWords', 0, 0).dy).toBeCloseTo(0.6)
    expect(wordMotion('slideWords', 0, 1000)).toMatchObject({ opacity: 1, dy: 0 })
    const a = wordMotion('wave', 0, 300).dy
    const b = wordMotion('wave', 1, 300).dy
    expect(a).not.toBeCloseTo(b)
    expect(wordMotion('none', 3, 0)).toMatchObject({ opacity: 1, scale: 1, dx: 0, dy: 0 })
  })
})

const base: Overlay = {
  id: 'o',
  kind: 'text',
  start: 0,
  end: 3000,
  x: 0.5,
  y: 0.5,
  size: 0.1,
  rotation: 0,
  anim: NO_ANIM,
  text: 'Xin chào',
  style: 'meme',
  color: '#ffffff',
  file: '',
  aspect: 1,
  mediaOffset: 0,
  sourceDuration: 0,
  hasAudio: false,
  volume: 1,
  keyColor: '',
  keyStrength: 0.4,
}

describe('lớp chữ / hình', () => {
  it('lớp chữ: kiểu mới được đọc lại; không có thì theo kiểu cũ', () => {
    const [styled, plain] = parseOverlays([
      { ...base, textStyle: templateStyle('ocean') },
      { ...base, id: 'p' },
    ])
    expect(overlayTextStyle(styled!)).toEqual(templateStyle('ocean'))
    expect(plain).not.toHaveProperty('textStyle')
    expect(overlayTextStyle(plain!).font).toBe('anton')
  })

  it('hình vẽ sẵn: phải có tên hình hợp lệ, độ dày nét được kẹp', () => {
    const list = parseOverlays([
      { ...base, kind: 'shape', shape: 'arrow', strokeWidth: 9, color: '#ef4444' },
      { ...base, id: 'x', kind: 'shape', shape: 'spiral' },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'shape', shape: 'arrow', strokeWidth: 0.3 })
    expect(SHAPES).toHaveLength(10)
  })
})
