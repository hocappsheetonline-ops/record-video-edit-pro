import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOOK,
  effectiveAdjust,
  FILTER_PRESETS,
  isDefaultLook,
  lookLayers,
  parseLook,
} from './look'

describe('look', () => {
  it('mặc định không làm gì; đọc file kẹp giá trị, bộ lọc lạ về none', () => {
    expect(isDefaultLook(DEFAULT_LOOK)).toBe(true)
    expect(isDefaultLook(undefined)).toBe(true)
    expect(lookLayers(DEFAULT_LOOK)).toBeNull()
    const parsed = parseLook({
      filter: 'instagram',
      intensity: 5,
      adjust: { contrast: 3, vignette: -1, grain: 0.5 },
    })
    expect(parsed.filter).toBe('none')
    expect(parsed.intensity).toBe(1)
    expect(parsed.adjust).toMatchObject({ contrast: 1, vignette: 0, grain: 0.5, brightness: 0 })
    expect(parseLook(null)).toEqual(DEFAULT_LOOK)
  })

  it('bộ lọc cộng với điều chỉnh, nhân theo độ mạnh; độ mạnh 0 coi như không lọc', () => {
    const half = {
      filter: 'bw' as const,
      intensity: 0.5,
      adjust: { ...DEFAULT_LOOK.adjust, saturation: 0.2 },
    }
    expect(effectiveAdjust(half).saturation).toBeCloseTo(-0.3)
    expect(isDefaultLook({ ...half, intensity: 0, adjust: DEFAULT_LOOK.adjust })).toBe(true)
    expect(effectiveAdjust({ ...half, intensity: 1, adjust: DEFAULT_LOOK.adjust }).saturation).toBe(
      -1,
    )
  })

  it('đen trắng → saturate(0); ấm / lạnh → nhiệt độ màu; cổ điển có sepia và hạt nhiễu', () => {
    const bw = lookLayers({ ...DEFAULT_LOOK, filter: 'bw' })!
    expect(bw.css).toBe('contrast(1.09) saturate(0)')
    expect(lookLayers({ ...DEFAULT_LOOK, filter: 'warm' })!.temperature).toBe(0.5)
    expect(lookLayers({ ...DEFAULT_LOOK, filter: 'cold' })!.temperature).toBe(-0.5)
    const vintage = lookLayers({ ...DEFAULT_LOOK, filter: 'vintage' })!
    expect(vintage.css).toContain('sepia(0.35)')
    expect(vintage.grain).toBe(0.35)
    // Mọi bộ lọc đều tạo ra thay đổi.
    for (const f of FILTER_PRESETS.filter((x) => x !== 'none'))
      expect(lookLayers({ ...DEFAULT_LOOK, filter: f }), f).not.toBeNull()
  })

  it('điều chỉnh độ sáng / phơi sáng / tương phản ra đúng chuỗi lọc', () => {
    const l = lookLayers({
      ...DEFAULT_LOOK,
      adjust: {
        ...DEFAULT_LOOK.adjust,
        exposure: 0.5,
        brightness: -0.2,
        contrast: 0.5,
        saturation: 0.3,
      },
    })!
    expect(l.css).toBe('brightness(1.2) contrast(1.3) saturate(1.3)')
  })
})
