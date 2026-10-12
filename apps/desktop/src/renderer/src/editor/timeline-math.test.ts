import { describe, expect, it } from 'vitest'
import { formatTimecode, tickInterval, zoomOutputIntervals } from './timeline-math'

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
