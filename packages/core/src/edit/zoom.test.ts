import { describe, expect, it } from 'vitest'
import type { CursorTrack } from './cursor'
import {
  cameraAt,
  clampCenter,
  easeInOut,
  generateAutoZooms,
  normalizeZooms,
  viewRect,
  zoomProgress,
  type ZoomRegion,
} from './zoom'

function trackWith(clicks: number[], keys: number[] = [], at = { x: 0.8, y: 0.3 }): CursorTrack {
  const samples = Array.from({ length: 601 }, (_, i) => ({ s: i * 50, ...at }))
  return {
    stepMs: 50,
    samples,
    clicks: clicks.map((s) => ({ s, ...at, button: 'left' as const })),
    keys,
    moves: [],
  }
}

const region = (start: number, end: number, extra: Partial<ZoomRegion> = {}): ZoomRegion => ({
  id: 'z',
  start,
  end,
  scale: 2,
  mode: 'fixed',
  x: 0.5,
  y: 0.5,
  ...extra,
})

describe('generateAutoZooms', () => {
  it('gom các click gần nhau thành một lần zoom', () => {
    const zooms = generateAutoZooms(trackWith([5000, 6000, 7500, 20_000]), 30_000)
    expect(zooms.map((z) => [z.start, z.end])).toEqual([
      [4500, 9000],
      [19_500, 21_500],
    ])
    expect(zooms[0]).toMatchObject({ mode: 'follow', scale: 2, x: 0.8, y: 0.3 })
  })

  it('zoom khi gõ phím liên tục', () => {
    const zooms = generateAutoZooms(trackWith([], [10_000, 10_300, 10_600, 10_900, 11_200]), 30_000)
    expect(zooms).toHaveLength(1)
    expect(zooms[0]!.start).toBe(9500)
  })

  it('gõ lẻ tẻ thì không zoom', () => {
    expect(generateAutoZooms(trackWith([], [1000, 5000, 9000]), 30_000)).toEqual([])
  })

  it('nối hai lần zoom quá sát nhau, và giữ trong thời lượng video', () => {
    // Hai cụm riêng: [500, 2500] và [3700, 5700]; cách nhau 1200ms < 2 lần chuyển cảnh nên được nối.
    const zooms = generateAutoZooms(trackWith([1000, 4200]), 5000)
    expect(zooms.map((z) => [z.start, z.end])).toEqual([[500, 5000]])
  })
})

describe('camera', () => {
  it('easeInOut đi từ 0 tới 1, đối xứng', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBe(0.5)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1)
  })

  it('zoom vào và ra mượt ở hai đầu đoạn', () => {
    const r = region(1000, 5000)
    expect(zoomProgress(r, 900)).toBe(0)
    expect(zoomProgress(r, 1000)).toBe(0)
    expect(zoomProgress(r, 1350)).toBe(0.5)
    expect(zoomProgress(r, 3000)).toBe(1)
    expect(zoomProgress(r, 5000)).toBe(0)
  })

  it('ngoài đoạn zoom thì thấy toàn bộ video', () => {
    expect(cameraAt([region(1000, 5000)], 500, null)).toEqual({ scale: 1, x: 0.5, y: 0.5 })
  })

  it('zoom cố định vào một điểm, không để khung vượt ra ngoài video', () => {
    const cam = cameraAt([region(1000, 5000, { x: 0.95, y: 0.1, scale: 2 })], 3000, null)
    expect(cam).toEqual({ scale: 2, x: 0.75, y: 0.25 })
    expect(viewRect(cam)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 })
  })

  it('zoom theo con trỏ', () => {
    const cam = cameraAt(
      [region(1000, 5000, { mode: 'follow' })],
      3000,
      trackWith([], [], { x: 0.6, y: 0.4 }),
    )
    expect(cam.x).toBeCloseTo(0.6)
    expect(cam.y).toBeCloseTo(0.4)
  })

  it('clampCenter', () => {
    expect(clampCenter(0, 4)).toBe(0.125)
    expect(clampCenter(0.5, 1)).toBe(0.5)
  })

  it('normalizeZooms sắp xếp, cắt chồng lấn và bỏ đoạn quá ngắn', () => {
    const out = normalizeZooms([region(3000, 6000), region(1000, 4000), region(9000, 9100)], 8000)
    expect(out.map((z) => [z.start, z.end])).toEqual([
      [1000, 4000],
      [4000, 6000],
    ])
  })
})
