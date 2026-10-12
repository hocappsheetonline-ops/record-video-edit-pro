import { describe, expect, it } from 'vitest'
import { evenRect, intersectRect, rectFromPoints, scaleRect } from './geometry'

describe('geometry', () => {
  it('scaleRect đổi DIP sang pixel vật lý (màn hình 125%)', () => {
    expect(scaleRect({ x: 100, y: 50, width: 1536, height: 864 }, 1.25)).toEqual({
      x: 125,
      y: 63,
      width: 1920,
      height: 1080,
    })
  })

  it('intersectRect trả về phần giao', () => {
    expect(
      intersectRect(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 60, width: 100, height: 100 },
      ),
    ).toEqual({ x: 50, y: 60, width: 50, height: 40 })
  })

  it('intersectRect trả về null khi không chồng lên nhau', () => {
    expect(
      intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }),
    ).toBeNull()
  })

  it('evenRect làm tròn kích thước xuống số chẵn', () => {
    expect(evenRect({ x: 10.4, y: 3, width: 641, height: 359.7 })).toEqual({
      x: 10,
      y: 3,
      width: 640,
      height: 358,
    })
    expect(evenRect({ x: 0, y: 0, width: 1, height: 0 })).toMatchObject({ width: 2, height: 2 })
  })

  it('rectFromPoints chấp nhận kéo ngược', () => {
    expect(rectFromPoints({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    })
  })
})
