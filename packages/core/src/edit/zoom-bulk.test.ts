import { describe, expect, it } from 'vitest'
import {
  clampZoomScale,
  commonZoomScale,
  updateAllZooms,
  zoomsFromProposals,
  type ZoomRegion,
} from './zoom'

const z = (id: string, start: number, end: number, scale = 2): ZoomRegion => ({
  id,
  start,
  end,
  scale,
  mode: 'follow',
  x: 0.5,
  y: 0.5,
})

describe('chỉnh tất cả đoạn zoom', () => {
  it('đặt mọi đoạn về một mức cố định, kẹp trong 1.2×–4×', () => {
    const zooms = [z('a', 0, 2000, 2), z('b', 3000, 5000, 3.5)]
    expect(updateAllZooms(zooms, { scale: 2.5 }).map((r) => r.scale)).toEqual([2.5, 2.5])
    expect(updateAllZooms(zooms, { scale: 9 }).map((r) => r.scale)).toEqual([4, 4])
    expect(clampZoomScale(0.3)).toBe(1.2)
    expect(clampZoomScale(Number.NaN)).toBe(2)
    expect(updateAllZooms(zooms, { mode: 'fixed', x: 0.2 })[1]).toMatchObject({
      mode: 'fixed',
      x: 0.2,
      scale: 3.5,
    })
  })

  it('mức chung chỉ có khi mọi đoạn bằng nhau', () => {
    expect(commonZoomScale([])).toBeNull()
    expect(commonZoomScale([z('a', 0, 1000, 2), z('b', 2000, 3000, 2)])).toBe(2)
    expect(commonZoomScale([z('a', 0, 1000, 2), z('b', 2000, 3000, 3)])).toBeNull()
  })
})

describe('đoạn zoom do Claude đề xuất', () => {
  it('giữ id cũ, tạo id mới, kẹp mức và tâm, bỏ đoạn sai', () => {
    const existing = [z('a', 0, 2000, 2), z('b', 5000, 7000, 3)]
    const regions = zoomsFromProposals(
      [
        { id: 'a', start_seconds: 0.5, end_seconds: 3, scale: 6, mode: 'fixed', x: 2, y: -1 },
        { id: '', start_seconds: 4, end_seconds: 6, scale: 1.5, mode: 'follow', x: 0.5, y: 0.5 },
        { id: 'a', start_seconds: 8, end_seconds: 9, scale: 2, mode: 'follow', x: 0.5, y: 0.5 },
        { id: 'x', start_seconds: 3, end_seconds: 1, scale: 2, mode: 'follow', x: 0.5, y: 0.5 },
        'rác',
      ],
      existing,
      20_000,
    )
    expect(regions.map((r) => [r.start, r.end, r.scale, r.mode, r.x, r.y])).toEqual([
      [500, 3000, 4, 'fixed', 1, 0],
      [4000, 6000, 1.5, 'follow', 0.5, 0.5],
      [8000, 9000, 2, 'follow', 0.5, 0.5],
    ])
    expect(regions[0]!.id).toBe('a')
    expect(regions[1]!.id).not.toBe('b')
    // id 'a' dùng lần hai thì thành đoạn mới.
    expect(regions[2]!.id).not.toBe('a')
  })

  it('cắt trong thời lượng và bỏ chồng lấn', () => {
    const regions = zoomsFromProposals(
      [
        { id: '', start_seconds: 1, end_seconds: 4, scale: 2, mode: 'follow', x: 0.5, y: 0.5 },
        { id: '', start_seconds: 3, end_seconds: 12, scale: 2, mode: 'follow', x: 0.5, y: 0.5 },
      ],
      [],
      10_000,
    )
    expect(regions.map((r) => [r.start, r.end])).toEqual([
      [1000, 4000],
      [4000, 10_000],
    ])
  })
})
