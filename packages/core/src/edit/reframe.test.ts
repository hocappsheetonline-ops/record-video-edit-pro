import { describe, expect, it } from 'vitest'
import { cameraCrop, coverSource, fillBaseView, fillViewRect, frameLayout } from './reframe'
import { cameraAt, type ZoomRegion } from './zoom'

const FHD = { width: 1920, height: 1080 }
const VERTICAL = { width: 1080, height: 1920 }
const camera = {
  visible: true,
  layout: 'bubble' as const,
  split: 0.4,
  position: 'top-left' as const,
}

describe('frameLayout', () => {
  it('lấp đầy: video màn hình phủ kín khung, bỏ qua lề', () => {
    expect(frameLayout(VERTICAL, FHD, { padding: 0.1, fill: true }, camera)).toEqual({
      content: { x: 0, y: 0, width: 1080, height: 1920 },
      strip: null,
    })
  })

  it('không lấp đầy: giữ cách cũ (video vừa trong lề, đúng tỉ lệ)', () => {
    const { content } = frameLayout(VERTICAL, FHD, { padding: 0.05, fill: false }, camera)
    expect(content.width).toBeCloseTo(1080 - 2 * 54)
    expect(content.width / content.height).toBeCloseTo(16 / 9)
    expect(content.y + content.height / 2).toBeCloseTo(960)
  })

  it('dải webcam ở trên: video màn hình lấp phần còn lại bên dưới', () => {
    const layout = frameLayout(
      VERTICAL,
      FHD,
      { padding: 0, fill: true },
      { ...camera, layout: 'stack', split: 0.35, position: 'top-right' },
    )
    expect(layout.strip).toEqual({ x: 0, y: 0, width: 1080, height: 672 })
    expect(layout.content).toEqual({ x: 0, y: 672, width: 1080, height: 1248 })
  })

  it('dải webcam ở dưới; webcam tắt thì không có dải', () => {
    const stack = { ...camera, layout: 'stack' as const, position: 'bottom-left' as const }
    expect(frameLayout(VERTICAL, FHD, { padding: 0, fill: true }, stack).strip?.y).toBe(1920 - 768)
    expect(
      frameLayout(VERTICAL, FHD, { padding: 0, fill: true }, { ...stack, visible: false }).strip,
    ).toBeNull()
    expect(frameLayout(VERTICAL, FHD, { padding: 0, fill: true }, null).strip).toBeNull()
  })
})

describe('fillViewRect', () => {
  it('khung dọc 9:16 từ video ngang: cắt một dải dọc đúng tỉ lệ, đi theo tâm camera', () => {
    const view = fillViewRect({ scale: 1, x: 0.5, y: 0.5 }, FHD, VERTICAL)
    // Tỉ lệ pixel của phần được cắt phải đúng 9:16.
    expect((view.width * FHD.width) / (view.height * FHD.height)).toBeCloseTo(9 / 16)
    expect(view.height).toBe(1)
    expect(view.x + view.width / 2).toBeCloseTo(0.5)
  })

  it('không vượt ra ngoài video khi con trỏ ở sát mép', () => {
    const left = fillViewRect({ scale: 1, x: 0.01, y: 0.5 }, FHD, VERTICAL)
    expect(left.x).toBe(0)
    const right = fillViewRect({ scale: 1, x: 0.99, y: 0.5 }, FHD, VERTICAL)
    expect(right.x + right.width).toBeCloseTo(1)
  })

  it('zoom thu nhỏ khung nhìn theo mức zoom, vẫn giữ tỉ lệ', () => {
    const view = fillViewRect({ scale: 2, x: 0.3, y: 0.4 }, FHD, VERTICAL)
    expect(view.height).toBeCloseTo(0.5)
    expect((view.width * FHD.width) / (view.height * FHD.height)).toBeCloseTo(9 / 16)
    expect(view.x + view.width / 2).toBeCloseTo(0.3)
    expect(view.y + view.height / 2).toBeCloseTo(0.4)
  })

  it('cùng tỉ lệ: hiện toàn bộ video như bình thường', () => {
    expect(fillViewRect({ scale: 1, x: 0.5, y: 0.5 }, FHD, { width: 1280, height: 720 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
  })

  it('khung ngang từ video dọc: cắt một dải ngang', () => {
    const view = fillViewRect({ scale: 1, x: 0.5, y: 0.9 }, VERTICAL, FHD)
    expect(view.width).toBe(1)
    expect(view.y + view.height).toBeCloseTo(1)
  })
})

describe('cameraAt cho chế độ lấp đầy', () => {
  const zoom: ZoomRegion = {
    id: 'z',
    start: 1000,
    end: 5000,
    scale: 2,
    mode: 'fixed',
    x: 0.03,
    y: 0.5,
  }

  it('không zoom: tâm ở vị trí nghỉ (con trỏ) thay vì giữa video', () => {
    expect(cameraAt([], 500, null, { x: 0.2, y: 0.7 })).toEqual({ scale: 1, x: 0.2, y: 0.7 })
  })

  it('khung dọc hẹp: zoom vào sát mép trái mà vẫn thấy điểm cần xem', () => {
    const base = fillBaseView(FHD, VERTICAL)
    const cam = cameraAt([zoom], 3000, null, { x: 0.5, y: 0.5 }, base)
    const view = fillViewRect(cam, FHD, VERTICAL)
    expect(view.x).toBeLessThanOrEqual(0.03)
    expect(view.x + view.width).toBeGreaterThanOrEqual(0.03)
    // Cách cũ (khung vuông) sẽ kẹp tâm ở 0.25 và làm mất điểm này.
    expect(cameraAt([zoom], 3000, null).x).toBe(0.25)
  })
})

describe('coverSource', () => {
  it('cắt giữa webcam 16:9 cho vừa dải ngang hoặc hình vuông', () => {
    expect(coverSource({ width: 1280, height: 720 }, { width: 1080, height: 672 })).toMatchObject({
      y: 0,
      height: 720,
    })
    const square = coverSource({ width: 1280, height: 720 }, { width: 300, height: 300 })
    expect(square).toEqual({ x: 280, y: 0, width: 720, height: 720 })
    const tall = coverSource({ width: 720, height: 1280 }, { width: 1080, height: 672 })
    expect(tall.width).toBe(720)
    expect(tall.y).toBeCloseTo((1280 - (720 * 672) / 1080) / 2)
  })
})

describe('cameraCrop', () => {
  const src = { width: 1280, height: 720 }
  const box = { width: 300, height: 300 }
  it('mặc định giống cắt cover ở giữa', () => {
    expect(cameraCrop(src, box, { zoom: 1, focusX: 0.5, focusY: 0.5 })).toEqual(
      coverSource(src, box),
    )
  })
  it('phóng to và dời tâm tới mặt, không cắt ra ngoài khung nguồn', () => {
    const c = cameraCrop(src, box, { zoom: 2, focusX: 0.3, focusY: 0.4 })
    expect(c.width).toBe(360)
    expect(c.height).toBe(360)
    expect(c.x + c.width / 2).toBeCloseTo(384)
    expect(c.y + c.height / 2).toBeCloseTo(288)
    const edge = cameraCrop(src, box, { zoom: 2, focusX: 0, focusY: 1 })
    expect(edge.x).toBe(0)
    expect(edge.y + edge.height).toBe(720)
    // zoom < 1 bị kẹp về 1 (không lộ viền đen).
    expect(cameraCrop(src, box, { zoom: 0.2, focusX: 0.5, focusY: 0.5 }).height).toBe(720)
  })
})
