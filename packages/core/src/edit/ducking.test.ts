import { describe, expect, it } from 'vitest'
import type { AudioClip } from './audio-clips'
import { duckGainAt, duckVolumeExpr, mergeRanges, parseDucking, voiceRanges } from './ducking'
import type { Clip } from './timeline'
import type { Waveform } from './waveform'

const clip = (sourceStart: number, sourceEnd: number, speed = 1): Clip =>
  ({ id: `c${sourceStart}`, sourceStart, sourceEnd, speed }) as unknown as Clip

/** Dạng sóng 20 ms / mẫu: 0..1000 ms im lặng, 1000..2000 ms có tiếng, 2000..3000 ms im lặng. */
const wave: Waveform = {
  bucketMs: 20,
  peaks: Array.from({ length: 150 }, (_, i) => (i >= 50 && i < 100 ? 200 : 5)),
}

const voice = (start: number, duration: number): AudioClip => ({
  id: 'v',
  file: 'v.wav',
  name: 'v',
  kind: 'voice',
  start,
  offset: 0,
  duration,
  sourceDuration: duration,
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  loop: false,
})

describe('parseDucking', () => {
  it('mặc định tắt, mức 30 %; kẹp giá trị sai', () => {
    expect(parseDucking(undefined)).toEqual({ enabled: false, level: 0.3 })
    expect(parseDucking({ enabled: true, level: 7 })).toEqual({ enabled: true, level: 1 })
    expect(parseDucking({ enabled: 'yes', level: 'x' })).toEqual({ enabled: false, level: 0.3 })
  })
})

describe('voiceRanges', () => {
  it('tìm khoảng có tiếng theo dạng sóng, theo thời gian video xuất', () => {
    expect(voiceRanges(wave, [clip(0, 3000)], [], 3000)).toEqual([{ start: 1000, end: 2000 }])
  })

  it('đi theo clip đã cắt: phần im lặng đầu bị bỏ thì lời bắt đầu ngay đầu video', () => {
    expect(voiceRanges(wave, [clip(1000, 3000)], [], 2000)).toEqual([{ start: 0, end: 1000 }])
  })

  it('clip đã bỏ đoạn có tiếng thì không có khoảng nào', () => {
    expect(voiceRanges(wave, [clip(0, 1000), clip(2000, 3000)], [], 2000)).toEqual([])
  })

  it('đoạn lồng tiếng được coi là có lời; nhạc / hiệu ứng thì không', () => {
    const ranges = voiceRanges(null, [clip(0, 3000)], [voice(500, 400)], 3000)
    expect(ranges).toEqual([{ start: 500, end: 900 }])
    expect(voiceRanges(null, [clip(0, 3000)], [{ ...voice(0, 500), kind: 'music' }], 3000)).toEqual(
      [],
    )
  })

  it('gộp khoảng gần nhau và bỏ khoảng quá ngắn', () => {
    expect(
      mergeRanges(
        [
          { start: 0, end: 100 },
          { start: 500, end: 1500 },
          { start: 1800, end: 2500 },
          { start: 5000, end: 5050 },
        ],
        700,
        150,
      ),
    ).toEqual([{ start: 0, end: 2500 }])
  })
})

describe('duckGainAt', () => {
  const ranges = [{ start: 1000, end: 2000 }]
  it('1 ngoài khoảng, level trong khoảng, dốc ở mép', () => {
    expect(duckGainAt(ranges, 0, 0.3)).toBe(1)
    expect(duckGainAt(ranges, 1500, 0.3)).toBeCloseTo(0.3)
    expect(duckGainAt(ranges, 850, 0.3, 300)).toBeCloseTo(1 - 0.7 * 0.5)
    expect(duckGainAt(ranges, 2150, 0.3, 300)).toBeCloseTo(1 - 0.7 * 0.5)
    expect(duckGainAt(ranges, 2400, 0.3, 300)).toBe(1)
  })
  it('không khoảng hoặc level 1 thì không đổi', () => {
    expect(duckGainAt([], 1500, 0.3)).toBe(1)
    expect(duckGainAt(ranges, 1500, 1)).toBe(1)
  })
})

describe('duckVolumeExpr', () => {
  it('biểu thức FFmpeg theo giây, trừ đi vị trí mảnh', () => {
    const expr = duckVolumeExpr([{ start: 1000, end: 2000 }], 0.3, 500, 5000, 300)
    expect(expr).toBe('1-0.7*clip(min((t-(0.2))/0.3,(1.8-t)/0.3),0,1)')
  })
  it('hai khoảng → max; khoảng ngoài mảnh bị bỏ; không khoảng → null', () => {
    const expr = duckVolumeExpr(
      [
        { start: 0, end: 1000 },
        { start: 3000, end: 4000 },
        { start: 20000, end: 21000 },
      ],
      0.5,
      0,
      5000,
      300,
    )
    expect(expr).toMatch(/^1-0\.5\*max\(clip\(.*\),clip\(.*\)\)$/)
    expect(expr).not.toContain('20.')
    expect(duckVolumeExpr([{ start: 20000, end: 21000 }], 0.5, 0, 5000)).toBeNull()
    expect(duckVolumeExpr([{ start: 0, end: 1000 }], 1, 0, 5000)).toBeNull()
  })
})
