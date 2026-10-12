import { describe, expect, it } from 'vitest'
import { cameraRect, contentRect, outputSize, placementAt, placementCorner } from './layout'

describe('layout', () => {
  it('kích thước xuất theo tỉ lệ và độ phân giải (cạnh ngắn)', () => {
    const src = { width: 2560, height: 1600 }
    expect(outputSize('16:9', 1080, src)).toEqual({ width: 1920, height: 1080 })
    expect(outputSize('9:16', 1080, src)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('1:1', 720, src)).toEqual({ width: 720, height: 720 })
    expect(outputSize('4:3', 1080, src)).toEqual({ width: 1440, height: 1080 })
    expect(outputSize('source', 1080, src)).toEqual({ width: 1728, height: 1080 })
  })

  it('video nằm giữa khung, chừa lề và giữ đúng tỉ lệ', () => {
    const rect = contentRect({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 0.1)
    // Lề 10% cạnh ngắn = 108px; chiều cao còn 864 nên rộng 1536 (16:9), căn giữa.
    expect(rect).toEqual({ x: 192, y: 108, width: 1536, height: 864 })
    const tall = contentRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, 0)
    expect(tall.width).toBe(1080)
    expect(tall.height).toBeCloseTo(607.5)
    expect(tall.y).toBeCloseTo((1920 - 607.5) / 2)
  })

  it('bong bóng webcam ở góc đã chọn', () => {
    const out = { width: 1920, height: 1080 }
    const br = cameraRect(out, 0.25, 'bottom-right')
    expect(br.width).toBe(270)
    expect(br.x + br.width).toBeCloseTo(1920 - 1080 * 0.035)
    expect(cameraRect(out, 0.25, 'top-left')).toMatchObject({ x: 1080 * 0.035, y: 1080 * 0.035 })
  })

  it('bong bóng webcam đặt tự do, không bao giờ ra ngoài khung', () => {
    const out = { width: 1920, height: 1080 }
    const m = 1080 * 0.035
    // Giữa khung.
    const mid = cameraRect(out, 0.25, { x: 0.5, y: 0.5 })
    expect(mid.x + mid.width / 2).toBeCloseTo(960)
    expect(mid.y + mid.height / 2).toBeCloseTo(540)
    // Vị trí góc giống hệt nút góc cũ.
    expect(cameraRect(out, 0.25, { x: 1, y: 1 })).toEqual(cameraRect(out, 0.25, 'bottom-right'))
    // Giá trị ngoài 0..1 bị kẹp lại trong khung.
    const far = cameraRect(out, 0.25, { x: 5, y: -3 })
    expect(far.x + far.width).toBeCloseTo(1920 - m)
    expect(far.y).toBeCloseTo(m)
    // Khung dọc: vẫn đúng góc dưới trái.
    const tall = cameraRect({ width: 1080, height: 1920 }, 0.4, { x: 0, y: 1 })
    expect(tall.x).toBeCloseTo(m)
    expect(tall.y + tall.height).toBeCloseTo(1920 - m)
  })

  it('kéo webcam: tâm ở đâu thì đặt ở đó, gần góc / giữa thì hít vào', () => {
    const out = { width: 1920, height: 1080 }
    const rect = cameraRect(out, 0.3, { x: 0.37, y: 0.81 })
    const back = placementAt(out, 0.3, {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    })
    expect(back.x).toBeCloseTo(0.37)
    expect(back.y).toBeCloseTo(0.81)
    expect(placementAt(out, 0.3, { x: 958, y: 543 })).toEqual({ x: 0.5, y: 0.5 })
    expect(placementAt(out, 0.3, { x: 99999, y: -50 })).toEqual({ x: 1, y: 0 })
    expect(placementCorner({ x: 1, y: 0 })).toBe('top-right')
    expect(placementCorner({ x: 0, y: 1 })).toBe('bottom-left')
    expect(placementCorner({ x: 0.5, y: 1 })).toBeNull()
  })
})
