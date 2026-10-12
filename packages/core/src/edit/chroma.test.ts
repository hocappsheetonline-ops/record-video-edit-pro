import { describe, expect, it } from 'vitest'
import { chromaKey } from './chroma'

const px = (...rgb: number[][]) => new Uint8ClampedArray(rgb.flatMap((c) => [...c, 255]))
const alphas = (d: Uint8ClampedArray) => Array.from(d.filter((_, i) => i % 4 === 3))

describe('chromaKey', () => {
  it('phông xanh lá (cả xanh "thật" của phông quay phim) thành trong suốt, giữ da người và màu khác', () => {
    const d = px(
      [0, 255, 0], // xanh chuẩn
      [60, 176, 67], // phông xanh thường gặp
      [224, 172, 140], // da
      [255, 255, 0], // vàng
      [128, 128, 128], // xám
      [30, 60, 200], // xanh dương
    )
    chromaKey(d, '#00ff00', 0.4)
    expect(alphas(d)).toEqual([0, 0, 255, 255, 255, 255])
  })

  it('viền mềm: điểm hơi xanh thì trong một phần và bị khử ám xanh', () => {
    const d = px([100, 166, 100])
    chromaKey(d, '#00ff00', 0.4)
    expect(d[3]).toBeGreaterThan(0)
    expect(d[3]).toBeLessThan(255)
    expect(d[1]).toBe(100)
  })

  it('độ mạnh càng lớn xóa càng nhiều', () => {
    const weak = px([110, 170, 110])
    const strong = px([110, 170, 110])
    chromaKey(weak, '#00ff00', 0)
    chromaKey(strong, '#00ff00', 1)
    expect(weak[3]).toBe(255)
    expect(strong[3]).toBe(0)
  })

  it('phông xanh dương, phông đen, phông trắng', () => {
    const blue = px([20, 40, 230], [0, 255, 0])
    chromaKey(blue, '#0000ff', 0.4)
    expect(alphas(blue)).toEqual([0, 255])
    const black = px([5, 5, 5], [200, 50, 50], [250, 250, 250])
    chromaKey(black, '#000000', 0.4)
    expect(alphas(black)).toEqual([0, 255, 255])
    const white = px([250, 250, 250], [5, 5, 5])
    chromaKey(white, '#ffffff', 0.4)
    expect(alphas(white)).toEqual([0, 255])
  })

  it('màu sai định dạng thì không đổi gì; giữ độ trong suốt sẵn có', () => {
    const d = px([0, 255, 0])
    chromaKey(d, 'green', 1)
    expect(d[3]).toBe(255)
    const half = new Uint8ClampedArray([200, 120, 120, 128])
    chromaKey(half, '#00ff00', 0.4)
    expect(half[3]).toBe(128)
  })
})
