import { describe, expect, it } from 'vitest'
import { clipBeats, detectBeats } from './beats'

describe('detectBeats', () => {
  it('nhịp đều 120 BPM (mỗi 500ms) trên nền nhạc nhỏ', () => {
    // 20ms một giá trị, 4 giây: nền 30, cứ 25 giá trị có một đỉnh 200.
    const peaks = Array.from({ length: 200 }, (_, i) => (i % 25 === 5 ? 200 : 30 + (i % 3)))
    expect(detectBeats(peaks, 20)).toEqual([100, 600, 1100, 1600, 2100, 2600, 3100, 3600])
  })

  it('đỉnh quá sát nhau chỉ lấy một; im lặng hoặc dữ liệu ngắn thì không có nhịp', () => {
    const peaks = Array.from({ length: 100 }, (_, i) => (i === 10 || i === 13 ? 200 : 20))
    expect(detectBeats(peaks, 20)).toEqual([200])
    expect(detectBeats(new Array(100).fill(0), 20)).toEqual([])
    expect(detectBeats([1, 2], 20)).toEqual([])
  })

  it('nhịp trên timeline: bỏ phần đã cắt đầu, lặp theo bài, dừng ở cuối đoạn', () => {
    const clip = { start: 1000, offset: 500, duration: 3000, sourceDuration: 2000, loop: true }
    expect(clipBeats(clip, [0, 600, 1200, 1800])).toEqual([1100, 1700, 2300, 2500, 3100, 3700])
    expect(clipBeats({ ...clip, loop: false }, [0, 600, 1200, 1800])).toEqual([1100, 1700, 2300])
  })
})
