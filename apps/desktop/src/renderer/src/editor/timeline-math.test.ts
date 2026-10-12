import { describe, expect, it } from 'vitest'
import {
  assignLanes,
  formatTimecode,
  laneCount,
  tickInterval,
  zoomOutputIntervals,
} from './timeline-math'

describe('timeline-math', () => {
  it('đoạn zoom bị cắt một phần chỉ hiện phần còn lại, có tính tốc độ', () => {
    const clips = [
      { id: 'a', sourceStart: 0, sourceEnd: 2000, speed: 1 },
      { id: 'b', sourceStart: 4000, sourceEnd: 8000, speed: 2 },
    ]
    expect(zoomOutputIntervals({ start: 1000, end: 6000 }, clips)).toEqual([
      { start: 1000, end: 2000 },
      { start: 2000, end: 3000 },
    ])
    expect(zoomOutputIntervals({ start: 2500, end: 3500 }, clips)).toEqual([])
  })

  it('vạch chia thước đủ thưa', () => {
    expect(tickInterval(60_000, 1200)).toBe(5000)
    expect(tickInterval(5000, 1200)).toBe(500)
  })

  it('timecode', () => {
    expect(formatTimecode(65_340)).toBe('1:05.3')
    expect(formatTimecode(0)).toBe('0:00.0')
  })
})

describe('assignLanes', () => {
  it('khối không trùng giờ ở chung một hàng; trùng giờ thì xuống hàng dưới', () => {
    const items = [
      { start: 0, end: 1000 },
      { start: 500, end: 1500 },
      { start: 1000, end: 2000 },
      { start: 600, end: 900 },
      { start: 1500, end: 1600 },
    ]
    expect(assignLanes(items)).toEqual([0, 1, 0, 2, 1])
    expect(laneCount(items)).toBe(3)
    expect(laneCount([])).toBe(1)
    expect(assignLanes([{ start: 0, end: 10 }])).toEqual([0])
  })
})
