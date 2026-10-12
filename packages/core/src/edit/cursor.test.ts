import { describe, expect, it } from 'vitest'
import type { InputEvent } from '../events'
import type { Segment } from '../project'
import {
  buildCursorTrack,
  clickAt,
  cursorAt,
  cursorOpacity,
  smoothPath,
  springOmega,
} from './cursor'

const segments: Segment[] = [{ index: 0, startedAt: 1000, endedAt: 5000, tracks: {} }]
const rect = { x: 100, y: 0, width: 1000, height: 500 }

describe('buildCursorTrack', () => {
  const events: InputEvent[] = [
    { type: 'move', t: 1000, x: 100, y: 0 },
    { type: 'move', t: 2000, x: 1100, y: 500 },
    { type: 'down', t: 2000, x: 1100, y: 500, button: 'left' },
    { type: 'key', t: 2500 },
    { type: 'move', t: 9000, x: 0, y: 0 }, // ngoài thời gian quay
  ]

  it('chuẩn hóa tọa độ theo vùng quay và đổi sang thời gian nguồn', () => {
    const track = buildCursorTrack(events, segments, rect, 0)
    expect(cursorAt(track, 0)).toEqual({ x: 0, y: 0 })
    const mid = cursorAt(track, 500)!
    expect(mid.x).toBeCloseTo(0.5, 1)
    expect(cursorAt(track, 1000)!.x).toBeCloseTo(1, 2)
    expect(track.clicks).toEqual([{ s: 1000, x: 1, y: 1, button: 'left' }])
    expect(track.keys).toEqual([1500])
    expect(track.samples.length).toBeGreaterThan(200)
  })

  it('làm mượt: con trỏ đi trễ hơn một chút nhưng vẫn tới đích', () => {
    const smooth = buildCursorTrack(events, segments, rect, 0.8)
    expect(cursorAt(smooth, 500)!.x).toBeLessThan(0.5)
    expect(cursorAt(smooth, 3500)!.x).toBeCloseTo(1, 2)
  })

  it('không có vùng quay (quay cửa sổ) thì không có dữ liệu con trỏ', () => {
    expect(buildCursorTrack(events, segments, null, 0.5).samples).toEqual([])
  })
})

describe('smoothPath', () => {
  it('không vọt quá đích (giảm chấn tới hạn)', () => {
    const raw = Array.from({ length: 120 }, (_, i) => ({ s: i * 16, x: i < 10 ? 0 : 1, y: 0 }))
    const out = smoothPath(raw, 16, 0.5)
    expect(Math.max(...out.map((p) => p.x))).toBeLessThanOrEqual(1.0001)
    expect(out[out.length - 1]!.x).toBeCloseTo(1, 3)
  })

  it('độ mượt cao hơn thì lò xo mềm hơn', () => {
    expect(springOmega(0.9)).toBeLessThan(springOmega(0.1))
  })
})

describe('hiệu ứng click và ẩn con trỏ', () => {
  const track = buildCursorTrack(
    [
      { type: 'move', t: 1000, x: 600, y: 250 },
      { type: 'down', t: 1500, x: 600, y: 250, button: 'left' },
    ],
    segments,
    rect,
    0,
  )

  it('click tạo hiệu ứng trong khoảng ngắn', () => {
    expect(clickAt(track, 400)).toBeNull()
    expect(clickAt(track, 700)?.progress).toBeCloseTo(200 / 450)
    expect(clickAt(track, 1000)).toBeNull()
  })

  it('con trỏ mờ dần khi đứng yên lâu', () => {
    expect(cursorOpacity(track, 1000)).toBe(1)
    expect(cursorOpacity(track, 500 + 2500 + 150)).toBeCloseTo(0.5)
    expect(cursorOpacity(track, 3900)).toBe(0)
  })
})
