import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import { planAudio } from './audio'
import { canReverse, reversedFileName } from './reverse'
import {
  curveAlongAt,
  curveDuration,
  curveOutputAt,
  curveSpeedAt,
  normalizeCurve,
  parseSpeedCurve,
  presetCurve,
  SPEED_CURVE_PRESETS,
  subCurve,
  type SpeedCurve,
} from './speed-curve'
import {
  clipDuration,
  clipSpeedAt,
  outputToSource,
  removeSourceRanges,
  setClipSpeed,
  sourceToOutput,
  splitAt,
  trimAtPlayhead,
  type Clip,
} from './timeline'

const flat = (v: number): SpeedCurve => ({
  preset: 'custom',
  points: [
    { u: 0, v },
    { u: 1, v },
  ],
})
const ramp: SpeedCurve = {
  preset: 'custom',
  points: [
    { u: 0, v: 1 },
    { u: 1, v: 3 },
  ],
}

describe('đường cong tốc độ', () => {
  it('tốc độ không đổi: giống tốc độ thường', () => {
    expect(curveDuration(flat(2), 4000)).toBeCloseTo(2000)
    expect(curveAlongAt(flat(2), 4000, 500)).toBeCloseTo(1000)
  })

  it('tăng dần 1× → 3×: thời lượng = L·ln(3)/2, nhanh dần, hai chiều khớp nhau', () => {
    expect(curveDuration(ramp, 3000)).toBeCloseTo((3000 * Math.log(3)) / 2, 6)
    const outs = [0, 500, 1000, 1500, 2000, 2500, 3000].map((a) => curveOutputAt(ramp, 3000, a))
    for (let i = 1; i < outs.length; i++) expect(outs[i]!).toBeGreaterThan(outs[i - 1]!)
    // Mỗi 500ms nguồn tốn ít thời gian xuất hơn đoạn trước (nhanh dần).
    expect(outs[2]! - outs[1]!).toBeLessThan(outs[1]! - outs[0]!)
    for (const a of [0, 123, 1500, 2999])
      expect(curveAlongAt(ramp, 3000, curveOutputAt(ramp, 3000, a))).toBeCloseTo(a, 6)
    expect(curveSpeedAt(ramp, 0.5)).toBeCloseTo(2)
  })

  it('mọi mẫu có sẵn: thời lượng dương, đảo chiều khớp', () => {
    for (const preset of SPEED_CURVE_PRESETS) {
      const c = presetCurve(preset)
      const d = curveDuration(c, 5000)
      expect(d, preset).toBeGreaterThan(0)
      expect(curveAlongAt(c, 5000, d / 3), preset).toBeCloseTo(
        curveAlongAt(c, 5000, curveOutputAt(c, 5000, curveAlongAt(c, 5000, d / 3))),
        6,
      )
    }
  })

  it('cắt phần đường cong và đọc file', () => {
    const half = subCurve(ramp, 0.5, 1)
    expect(half.points[0]).toEqual({ u: 0, v: 2 })
    expect(half.points.at(-1)).toEqual({ u: 1, v: 3 })
    // Tổng hai nửa = cả đường cong.
    const left = curveDuration(subCurve(ramp, 0, 0.5), 1500)
    const right = curveDuration(half, 1500)
    expect(left + right).toBeCloseTo(curveDuration(ramp, 3000), 6)
    expect(parseSpeedCurve({ points: [{ u: 0.5, v: 99 }] })).toBeUndefined()
    expect(
      parseSpeedCurve({
        preset: 'hero',
        points: [
          { u: 0.2, v: 99 },
          { u: 0.8, v: 0 },
        ],
      }),
    ).toEqual({
      preset: 'hero',
      points: [
        { u: 0, v: 10 },
        { u: 0.2, v: 10 },
        { u: 0.8, v: 0.1 },
        { u: 1, v: 0.1 },
      ],
    })
    expect(normalizeCurve({ preset: 'custom', points: [] }).points).toHaveLength(2)
  })
})

const clip = (patch: Partial<Clip> = {}): Clip => ({
  id: 'a',
  sourceStart: 1000,
  sourceEnd: 4000,
  speed: 1,
  ...patch,
})

describe('clip đường cong / phát ngược', () => {
  it('clip đường cong: thời lượng, đổi qua lại thời điểm, tốc độ tức thời', () => {
    const c = clip({ speedCurve: ramp })
    expect(clipDuration(c)).toBeCloseTo((3000 * Math.log(3)) / 2, 6)
    const hit = outputToSource([c], 800)!
    expect(sourceToOutput([c], hit.source)).toBeCloseTo(800, 6)
    expect(clipSpeedAt(c, 0)).toBeCloseTo(1)
    expect(clipSpeedAt(c, clipDuration(c) - 1)).toBeCloseTo(3, 1)
    // Đổi sang tốc độ cố định thì bỏ đường cong.
    expect(setClipSpeed([c], 'a', 2)[0]).not.toHaveProperty('speedCurve')
  })

  it('tách clip đường cong: hai nửa cộng lại đúng thời lượng, tốc độ nối liền', () => {
    const c = clip({ speedCurve: ramp })
    const [l, r] = splitAt([c], 1000)
    expect(clipDuration(l!) + clipDuration(r!)).toBeCloseTo(clipDuration(c), 3)
    expect(curveSpeedAt(l!.speedCurve!, 1)).toBeCloseTo(curveSpeedAt(r!.speedCurve!, 0), 3)
  })

  it('phát ngược: đầu clip là cuối đoạn nguồn; tách / cắt giữ đúng chiều', () => {
    const c = clip({ reversed: true })
    expect(outputToSource([c], 0)!.source).toBe(4000)
    expect(outputToSource([c], 1000)!.source).toBe(3000)
    expect(sourceToOutput([c], 3500)).toBe(500)
    const [l, r] = splitAt([c], 1000)
    // Nửa trái (phát trước) là phần nguồn phía sau.
    expect([l!.sourceStart, l!.sourceEnd, r!.sourceStart, r!.sourceEnd]).toEqual([
      3000, 4000, 1000, 3000,
    ])
    expect(l!.reversed && r!.reversed).toBe(true)
    const kept = trimAtPlayhead([c], 1000, 'left').clips[0]!
    expect([kept.sourceStart, kept.sourceEnd]).toEqual([1000, 3000])
    // AI cắt bớt một khoảng nguồn: các mảnh vẫn theo thứ tự phát.
    const pieces = removeSourceRanges([c], [{ start: 2000, end: 2500 }])
    expect(pieces.map((p) => [p.sourceStart, p.sourceEnd])).toEqual([
      [2500, 4000],
      [1000, 2000],
    ])
  })

  it('tên file đảo ngược cố định; chỉ phát ngược được clip nằm trong một đoạn, không quá dài', () => {
    const segments: Segment[] = [
      { index: 0, startedAt: 0, endedAt: 5000, tracks: {} },
      { index: 1, startedAt: 9000, endedAt: 12_000, tracks: {} },
    ]
    expect(reversedFileName(1, { sourceStart: 5000.4, sourceEnd: 7000 }, 'screen')).toBe(
      'rev-s1-5000-7000-screen.mp4',
    )
    expect(reversedFileName(0, clip(), 'mic')).toBe('rev-s0-1000-4000-mic.m4a')
    expect(canReverse(segments, clip())).toBe(true)
    expect(canReverse(segments, clip({ sourceStart: 4000, sourceEnd: 6000 }))).toBe(false)
    expect(canReverse(segments, clip({ freeze: 1000 }))).toBe(false)
  })
})

describe('âm thanh khi xuất', () => {
  const project = {
    segments: [
      {
        index: 0,
        startedAt: 0,
        endedAt: 10_000,
        tracks: { mic: { file: 'seg0-mic.webm', startedAt: 0 } },
      },
    ] as Segment[],
  }
  const mix = { mic: 1, system: 1 }

  it('phát ngược: lấy từ file đảo ngược, giây 0 của file ứng với cuối clip', () => {
    const [p] = planAudio(project, [clip({ reversed: true })], mix)
    expect(p).toMatchObject({
      file: 'rev-s0-1000-4000-mic.m4a',
      mediaStart: 0,
      duration: 3,
      outputStart: 0,
    })
  })

  it('đường cong: chia mảnh tốc độ cố định nối liền nhau, tổng khớp thời lượng clip', () => {
    const pieces = planAudio(project, [clip({ speedCurve: ramp })], mix)
    expect(pieces.length).toBe(10)
    let end = 0
    for (const p of pieces) {
      expect(p.outputStart).toBeCloseTo(end, 6)
      end = p.outputStart + p.duration / p.speed
    }
    expect(end * 1000).toBeCloseTo(clipDuration(clip({ speedCurve: ramp })), 3)
    expect(pieces[0]!.speed).toBeLessThan(pieces.at(-1)!.speed)
    expect(pieces.reduce((s, p) => s + p.duration, 0)).toBeCloseTo(3, 6)
  })
})
