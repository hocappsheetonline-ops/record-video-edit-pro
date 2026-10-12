import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import {
  clipDuration,
  insertFreeze,
  initialClips,
  setFreezeDuration,
  mediaTime,
  outputDuration,
  outputToSource,
  removeClip,
  removeSourceRanges,
  segmentAt,
  setClipSpeed,
  sourceSegments,
  sourceToOutput,
  splitAt,
  trimAtPlayhead,
  wallToSource,
  type Clip,
} from './timeline'

const segments: Segment[] = [
  {
    index: 0,
    startedAt: 10_000,
    endedAt: 15_000,
    tracks: { screen: { file: 's0', startedAt: 10_050 }, mic: { file: 'm0', startedAt: 9_900 } },
  },
  {
    index: 1,
    startedAt: 30_000,
    endedAt: 33_000,
    tracks: { screen: { file: 's1', startedAt: 30_010 } },
  },
]

const clip = (id: string, sourceStart: number, sourceEnd: number, speed = 1): Clip => ({
  id,
  sourceStart,
  sourceEnd,
  speed,
})

describe('thời gian nguồn', () => {
  const list = sourceSegments(segments)

  it('nối các đoạn liền nhau, bỏ thời gian tạm dừng', () => {
    expect(list.map((s) => [s.offset, s.duration])).toEqual([
      [0, 5000],
      [5000, 3000],
    ])
  })

  it('tìm đoạn chứa một thời điểm', () => {
    expect(segmentAt(list, 4999)?.segment.index).toBe(0)
    expect(segmentAt(list, 5000)?.segment.index).toBe(1)
    expect(segmentAt(list, 8000)?.segment.index).toBe(1)
    expect(segmentAt(list, 8001)).toBeNull()
    expect(segmentAt(list, -1)).toBeNull()
  })

  it('đổi sang thời điểm trong file của từng track theo lúc bắt đầu ghi', () => {
    // Màn hình bắt đầu ghi trễ 50ms, micro sớm 100ms so với đoạn.
    expect(mediaTime(list[0]!, 'screen', 1000)).toBeCloseTo(0.95)
    expect(mediaTime(list[0]!, 'mic', 1000)).toBeCloseTo(1.1)
    expect(mediaTime(list[1]!, 'screen', 5000)).toBeCloseTo(-0.01)
    expect(mediaTime(list[1]!, 'camera', 5000)).toBeNull()
  })

  it('đổi thời điểm thật của sự kiện chuột sang thời gian nguồn', () => {
    expect(wallToSource(list, 12_000)).toBe(2000)
    expect(wallToSource(list, 31_000)).toBe(6000)
    expect(wallToSource(list, 20_000)).toBeNull() // lúc tạm dừng
  })
})

describe('clips', () => {
  it('mặc định mỗi đoạn là một clip', () => {
    const clips = initialClips({ segments })
    expect(clips.map((c) => [c.sourceStart, c.sourceEnd, c.speed])).toEqual([
      [0, 5000, 1],
      [5000, 8000, 1],
    ])
    expect(outputDuration(clips)).toBe(8000)
  })

  it('đổi qua lại giữa thời điểm xuất và thời điểm nguồn, có tính tốc độ', () => {
    const clips = [clip('a', 0, 2000), clip('b', 4000, 8000, 2)]
    expect(outputDuration(clips)).toBe(4000)
    expect(outputToSource(clips, 1000)?.source).toBe(1000)
    expect(outputToSource(clips, 3000)).toMatchObject({
      source: 6000,
      position: { index: 1, outputStart: 2000 },
    })
    expect(outputToSource(clips, 99_999)?.source).toBe(8000)
    expect(sourceToOutput(clips, 6000)).toBe(3000)
    expect(sourceToOutput(clips, 3000)).toBeNull() // đã bị cắt
  })

  it('tách clip tại đầu phát', () => {
    const result = splitAt([clip('a', 0, 5000)], 2000)
    expect(result.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 2000],
      [2000, 5000],
    ])
    expect(result[0]!.id).toBe('a')
    expect(result[1]!.id).not.toBe('a')
  })

  it('không tách sát mép clip', () => {
    expect(splitAt([clip('a', 0, 5000)], 50)).toHaveLength(1)
  })

  it('tách clip đang tua nhanh dùng đúng thời điểm nguồn', () => {
    const result = splitAt([clip('a', 0, 4000, 2)], 1000)
    expect(result.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 2000],
      [2000, 4000],
    ])
  })

  it('xóa clip và đổi tốc độ (giới hạn hợp lý)', () => {
    const clips = [clip('a', 0, 1000), clip('b', 1000, 2000)]
    expect(removeClip(clips, 'a').map((c) => c.id)).toEqual(['b'])
    expect(setClipSpeed(clips, 'b', 100)[1]!.speed).toBe(16)
  })

  it('bỏ nhiều khoảng thời gian (AI cắt từ thừa), loại mảnh quá ngắn', () => {
    const clips = [clip('a', 0, 5000), clip('b', 6000, 9000)]
    const result = removeSourceRanges(clips, [
      { start: 1000, end: 1500 },
      { start: 4950, end: 6500 },
      { start: 8000, end: 8000 }, // rỗng
    ])
    expect(result.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 1000],
      [1500, 4950],
      [6500, 9000],
    ])
    expect(new Set(result.map((c) => c.id)).size).toBe(3)
  })
})

describe('trimAtPlayhead (phím A / D)', () => {
  const clips: Clip[] = [
    { id: 'a', sourceStart: 0, sourceEnd: 4000, speed: 1 },
    { id: 'b', sourceStart: 6000, sourceEnd: 10_000, speed: 2 },
  ]

  it('A: bỏ phần bên trái đầu phát trong clip hiện tại, đầu phát về đầu clip', () => {
    const r = trimAtPlayhead(clips, 1500, 'left')
    expect(r.clips[0]).toMatchObject({ id: 'a', sourceStart: 1500, sourceEnd: 4000 })
    expect(r.clips[1]).toEqual(clips[1])
    expect(r.time).toBe(0)
    expect(outputDuration(r.clips)).toBe(4500)
  })

  it('D: bỏ phần bên phải đầu phát, clip sau dồn lên; tính đúng khi clip chạy nhanh', () => {
    // 5000ms xuất = 1000ms vào clip b (tốc độ 2×) → nguồn 8000.
    const r = trimAtPlayhead(clips, 5000, 'right')
    expect(r.clips[1]).toMatchObject({ id: 'b', sourceStart: 6000, sourceEnd: 8000 })
    expect(r.time).toBe(5000)
    expect(outputDuration(r.clips)).toBe(5000)
  })

  it('phần còn lại quá ngắn thì bỏ cả clip; clip duy nhất thì không làm gì', () => {
    const r = trimAtPlayhead(clips, 3950, 'left')
    expect(r.clips.map((c) => c.id)).toEqual(['b'])
    const only = [clips[0]!]
    expect(trimAtPlayhead(only, 30, 'right').clips).toEqual(only)
  })
})

describe('khung hình đứng yên', () => {
  const clips: Clip[] = [clip('a', 0, 4000), clip('b', 6000, 10_000, 2)]

  it('chèn tại đầu phát: tách clip, giữ đúng khung đang xem, kéo dài video', () => {
    const r = insertFreeze(clips, 1500, 2000)!
    expect(r.clips.map((c) => [c.sourceStart, c.sourceEnd, c.freeze])).toEqual([
      [0, 1500, undefined],
      [1500, 1500, 2000],
      [1500, 4000, undefined],
      [6000, 10_000, undefined],
    ])
    expect(r.clips[1]!.id).toBe(r.id)
    expect(outputDuration(r.clips)).toBe(outputDuration(clips) + 2000)
    // Trong lúc đứng yên, thời điểm nguồn không đổi; sau đó chạy tiếp từ đúng chỗ.
    expect(outputToSource(r.clips, 1600)!.source).toBe(1500)
    expect(outputToSource(r.clips, 3400)!.source).toBe(1500)
    expect(outputToSource(r.clips, 3600)!.source).toBe(1600)
    // Thời điểm nguồn 1500 ứng với lúc bắt đầu đứng yên, không trỏ vào giữa khung đứng yên.
    expect(sourceToOutput(r.clips, 2000)).toBe(4000)
  })

  it('giữ bộ lọc / biến đổi của clip gốc; sát mép thì chèn trước / sau cả clip', () => {
    const look = { filter: 'bw' as const, intensity: 1, adjust: {} as never }
    const withLook: Clip[] = [{ ...clip('a', 0, 4000), look }]
    const start = insertFreeze(withLook, 20)!
    expect(start.clips.map((c) => c.freeze ?? 0)).toEqual([2000, 0])
    expect(start.clips[0]!.look).toBe(look)
    const end = insertFreeze(withLook, 3990)!
    expect(end.clips.map((c) => c.freeze ?? 0)).toEqual([0, 2000])
    expect(end.clips[1]!.sourceStart).toBe(3990)
  })

  it('tách, cắt A/D và đổi độ dài của clip đứng yên; không đổi tốc độ', () => {
    const frozen = insertFreeze(clips, 1500, 3000)!.clips
    const split = splitAt(frozen, 2500)
    expect(split.map((c) => c.freeze ?? 0)).toEqual([0, 1000, 2000, 0, 0])
    const trimmed = trimAtPlayhead(frozen, 2500, 'right')
    expect(trimmed.clips[1]!.freeze).toBe(1000)
    const left = trimAtPlayhead(frozen, 2500, 'left')
    expect(left.clips[1]!.freeze).toBe(2000)
    expect(setClipSpeed(frozen, frozen[1]!.id, 4)[1]!.speed).toBe(1)
    const longer = setFreezeDuration(frozen, frozen[1]!.id, 120_000)
    expect(clipDuration(longer[1]!)).toBe(60_000)
    // AI cắt khoảng nguồn không làm mất khung đứng yên.
    expect(removeSourceRanges(frozen, [{ start: 1000, end: 2000 }]).some((c) => c.freeze)).toBe(
      true,
    )
  })
})
