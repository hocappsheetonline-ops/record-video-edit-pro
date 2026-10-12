import { describe, expect, it } from 'vitest'
import { beautyLayers, NO_BEAUTY, parseBeauty } from './beauty'

describe('beautyLayers', () => {
  it('tắt hết: vẽ ảnh gốc, không có lớp mờ', () => {
    expect(beautyLayers(NO_BEAUTY, 300)).toEqual({ base: 'none', soft: null })
  })

  it('làm sáng và tông ấm thành bộ lọc màu', () => {
    const { base } = beautyLayers({ smooth: 0, brighten: 1, warmth: 1 }, 300)
    expect(base).toBe('brightness(1.300) contrast(0.920) sepia(0.220) saturate(1.150)')
  })

  it('mịn da: lớp mờ tỉ lệ theo kích thước ô và mức mịn', () => {
    const small = beautyLayers({ smooth: 1, brighten: 0, warmth: 0 }, 300).soft!
    const big = beautyLayers({ smooth: 1, brighten: 0, warmth: 0 }, 1080).soft!
    expect(small).toEqual({ filter: 'blur(3.60px)', alpha: 0.6 })
    expect(big.filter).toBe('blur(12.96px)')
    expect(beautyLayers({ smooth: 0.5, brighten: 0.5, warmth: 0 }, 300).soft).toEqual({
      filter: 'brightness(1.150) contrast(0.960) blur(1.80px)',
      alpha: 0.3,
    })
  })
})

describe('parseBeauty', () => {
  it('giới hạn 0..1, giá trị sai thành 0', () => {
    expect(parseBeauty({ smooth: 2, brighten: -1, warmth: 'x' })).toEqual({
      smooth: 1,
      brighten: 0,
      warmth: 0,
    })
    expect(parseBeauty(undefined)).toEqual(NO_BEAUTY)
  })
})
