import { describe, expect, it } from 'vitest'
import { computePeaks, parseWaveform, waveLevel, waveformSlice } from './waveform'

/** 1 giây im lặng, 1 giây sóng sine biên độ 0.5, 1 giây tiếng nhỏ 0.1 (8 kHz). */
function samples(): Int16Array {
  const rate = 8000
  const out = new Int16Array(rate * 3)
  for (let i = 0; i < rate; i++) {
    out[rate + i] = Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 0.5 * 32767)
    out[rate * 2 + i] = Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 0.1 * 32767)
  }
  return out
}

describe('computePeaks', () => {
  it('chia 20ms một giá trị, im lặng = 0, đỉnh đúng biên độ', () => {
    const wave = computePeaks(samples(), 8000)
    expect(wave.bucketMs).toBe(20)
    expect(wave.peaks).toHaveLength(150)
    expect(wave.peaks.slice(0, 50).every((p) => p === 0)).toBe(true)
    expect(Math.max(...wave.peaks.slice(50, 100))).toBeCloseTo(127, -1)
    expect(Math.max(...wave.peaks.slice(100))).toBeCloseTo(25, -1)
  })

  it('đoạn cuối lẻ vẫn được tính', () => {
    expect(computePeaks(new Int16Array(170).fill(16384), 8000).peaks).toEqual([128, 128])
  })
})

describe('waveformSlice', () => {
  const wave = computePeaks(samples(), 8000)

  it('chuẩn hóa theo đỉnh lớn nhất; giữ đúng vị trí im lặng / tiếng to / tiếng nhỏ', () => {
    const bars = waveformSlice(wave, 0, 3000, 30)
    expect(bars).toHaveLength(30)
    expect(bars.slice(0, 10).every((b) => b === 0)).toBe(true)
    expect(Math.max(...bars.slice(10, 20))).toBe(1)
    // Tiếng nhỏ hơn 5 lần (-14 dB) theo thang dB vẫn cao gần nửa cột, nhưng thấp hơn tiếng to.
    const quiet = Math.max(...bars.slice(20))
    expect(quiet).toBeGreaterThan(0.4)
    expect(quiet).toBeLessThan(0.6)
  })

  it('chỉ lấy phần của clip (đã cắt), nhiều cột hơn số khoảng vẫn đúng', () => {
    const bars = waveformSlice(wave, 900, 1100, 40)
    expect(bars.slice(0, 18).every((b) => b === 0)).toBe(true)
    expect(bars.slice(22).every((b) => b > 0.5)).toBe(true)
  })

  it('trường hợp rỗng', () => {
    expect(waveformSlice(wave, 500, 500, 5)).toEqual([0, 0, 0, 0, 0])
    expect(waveformSlice({ bucketMs: 20, peaks: [] }, 0, 1000, 3)).toEqual([0, 0, 0])
    expect(waveformSlice(wave, 0, 1000, 0)).toEqual([])
  })

  it('bản quay toàn im lặng (nhiễu rất nhỏ) không bị phóng to thành sóng lớn', () => {
    expect(Math.max(...waveformSlice({ bucketMs: 20, peaks: [2, 3, 2] }, 0, 60, 3))).toBeLessThan(
      0.2,
    )
  })
})

describe('waveLevel', () => {
  it('thang dB: to nhất = 1, nhỏ dần đều, tạp âm dưới -45 dBFS = 0', () => {
    expect(waveLevel(200, 200)).toBe(1)
    expect(waveLevel(0, 200)).toBe(0)
    expect(waveLevel(1, 200)).toBe(0)
    const half = waveLevel(100, 200)
    const tenth = waveLevel(20, 200)
    expect(half).toBeGreaterThan(0.7)
    expect(tenth).toBeGreaterThan(0.3)
    expect(tenth).toBeLessThan(half)
  })
})

describe('parseWaveform', () => {
  it('nhận file hợp lệ, bỏ file hỏng', () => {
    expect(parseWaveform({ bucketMs: 20, peaks: [0, 255] })).toEqual({
      bucketMs: 20,
      peaks: [0, 255],
    })
    expect(parseWaveform({ bucketMs: 20, peaks: [300] })).toBeNull()
    expect(parseWaveform({ peaks: [] })).toBeNull()
    expect(parseWaveform(null)).toBeNull()
  })
})
