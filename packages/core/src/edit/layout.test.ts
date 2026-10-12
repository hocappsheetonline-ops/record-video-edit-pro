import { describe, expect, it } from 'vitest'
import { cameraRect, contentRect, outputSize } from './layout'

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
})
