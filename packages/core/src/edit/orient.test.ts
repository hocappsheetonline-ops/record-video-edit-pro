import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSFORM,
  isDefaultTransform,
  normalizeCrop,
  orientedSize,
  orientPoint,
  parseClipTransform,
  ROTATIONS,
  unorientPoint,
  unorientRect,
  type ClipTransform,
} from './orient'

const near = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => {
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(a[k]).toBeCloseTo(b[k], 9)
}

const t = (patch: Partial<ClipTransform>): ClipTransform => ({ ...DEFAULT_TRANSFORM, ...patch })

describe('orient', () => {
  it('mặc định không đổi gì; đọc file sai thì bỏ qua', () => {
    expect(isDefaultTransform(undefined)).toBe(true)
    expect(isDefaultTransform(DEFAULT_TRANSFORM)).toBe(true)
    expect(parseClipTransform(undefined)).toBeUndefined()
    expect(parseClipTransform({ rotate: 45 })).toBeUndefined()
    expect(parseClipTransform({ flipH: true, rotate: 90 })).toMatchObject({
      flipH: true,
      flipV: false,
      rotate: 90,
    })
    expect(orientPoint({ x: 0.3, y: 0.7 }, DEFAULT_TRANSFORM)).toEqual({ x: 0.3, y: 0.7 })
  })

  it('vùng cắt luôn nằm trong video và không quá nhỏ', () => {
    expect(normalizeCrop({ x: 0.9, y: -1, width: 0.5, height: 0.01 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.1,
    })
    expect(parseClipTransform({ crop: { x: 0, y: 0, width: 1, height: 1 } })).toBeUndefined()
  })

  it('xoay 90°: góc trên trái sang góc trên phải; kích thước đổi chiều', () => {
    const r = t({ rotate: 90 })
    expect(orientPoint({ x: 0, y: 0 }, r)).toEqual({ x: 1, y: 0 })
    expect(orientPoint({ x: 1, y: 0 }, r)).toEqual({ x: 1, y: 1 })
    expect(orientedSize({ width: 1920, height: 1080 }, r)).toEqual({ width: 1080, height: 1920 })
    expect(orientedSize({ width: 1920, height: 1080 }, t({ rotate: 180 }))).toEqual({
      width: 1920,
      height: 1080,
    })
  })

  it('lật và cắt: điểm đi qua rồi quay về đúng chỗ (mọi góc xoay)', () => {
    const crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }
    for (const rotate of ROTATIONS)
      for (const flipH of [false, true])
        for (const flipV of [false, true]) {
          const tf = t({ rotate, flipH, flipV, crop })
          const p = { x: 0.33, y: 0.41 }
          const back = unorientPoint(orientPoint(p, tf), tf)
          expect(back.x).toBeCloseTo(p.x, 9)
          expect(back.y).toBeCloseTo(p.y, 9)
        }
    // Lật ngang: trái thành phải.
    expect(orientPoint({ x: 0.1, y: 0.5 }, t({ flipH: true })).x).toBeCloseTo(0.9)
    // Cắt: mép trái của vùng cắt là 0.
    expect(orientPoint({ x: 0.2, y: 0.1 }, t({ crop }))).toEqual({ x: 0, y: 0 })
  })

  it('khung nhìn sau biến đổi → vùng của video gốc cần vẽ', () => {
    const crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }
    near(unorientRect({ x: 0, y: 0, width: 1, height: 1 }, t({ crop })), crop)
    // Xoay 90° rồi nhìn nửa trên: là nửa trái của video gốc.
    const r = unorientRect({ x: 0, y: 0, width: 1, height: 0.5 }, t({ rotate: 90 }))
    near(r, { x: 0, y: 0, width: 0.5, height: 1 })
  })
})
