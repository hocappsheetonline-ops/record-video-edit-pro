import { describe, expect, it } from 'vitest'
import { overlayMotion, overlaysAt, parseOverlays, type Overlay } from './overlays'

const base: Overlay = {
  id: 'o',
  kind: 'text',
  start: 1000,
  end: 4000,
  x: 0.5,
  y: 0.2,
  size: 0.1,
  rotation: 0,
  animation: 'pop',
  text: 'Hết cứu',
  style: 'meme',
  color: '#ffffff',
  file: '',
  aspect: 1,
}

describe('overlays', () => {
  it('chỉ hiện trong khoảng của nó, lớp sau đè lớp trước', () => {
    const list = [base, { ...base, id: 'p', start: 2000 }]
    expect(overlaysAt(list, 500)).toEqual([])
    expect(overlaysAt(list, 1500).map((o) => o.id)).toEqual(['o'])
    expect(overlaysAt(list, 2500).map((o) => o.id)).toEqual(['o', 'p'])
    expect(overlaysAt(list, 4000)).toEqual([])
  })

  it('pop: nở từ 0, vượt nhẹ rồi về đúng cỡ', () => {
    expect(overlayMotion(base, 1000).scale).toBeCloseTo(0)
    const mid = [1100, 1200, 1250, 1300].map((t) => overlayMotion(base, t).scale)
    expect(Math.max(...mid)).toBeGreaterThan(1)
    expect(overlayMotion(base, 1350).scale).toBeCloseTo(1)
    expect(overlayMotion(base, 3000).scale).toBe(1)
  })

  it('fade: hiện dần, mờ dần lúc cuối; slide: trượt từ trái vào', () => {
    const fade = { ...base, animation: 'fade' as const }
    expect(overlayMotion(fade, 1150).opacity).toBeCloseTo(0.5)
    expect(overlayMotion(fade, 2000).opacity).toBe(1)
    expect(overlayMotion(fade, 3850).opacity).toBeCloseTo(0.5)
    const slide = { ...base, animation: 'slide' as const }
    expect(overlayMotion(slide, 1000).dx).toBeCloseTo(-0.6)
    expect(overlayMotion(slide, 1400).dx).toBeCloseTo(0)
  })

  it('bounce / shake chuyển động lặp lại; none đứng yên', () => {
    expect(overlayMotion({ ...base, animation: 'bounce' }, 1250).dy).toBeCloseTo(-0.03)
    expect(Math.abs(overlayMotion({ ...base, animation: 'shake' }, 1035).rotate)).toBeGreaterThan(3)
    expect(overlayMotion({ ...base, animation: 'none' }, 1000)).toEqual({
      scale: 1,
      opacity: 1,
      dx: 0,
      dy: 0,
      rotate: 0,
    })
  })

  it('đọc file: ảnh phải có tên file an toàn; giá trị sai về mặc định', () => {
    expect(parseOverlays([base])).toEqual([base])
    expect(parseOverlays([{ ...base, kind: 'image', file: '../x.png' }])).toEqual([])
    expect(parseOverlays([{ ...base, kind: 'gif' }])).toEqual([])
    const fixed = parseOverlays([
      { ...base, size: 9, animation: 'spin', color: 'red', style: 'x' },
    ])[0]!
    expect(fixed).toMatchObject({ size: 1, animation: 'pop', color: '#ffffff', style: 'meme' })
  })
})
