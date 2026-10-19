import { describe, expect, it } from 'vitest'
import { createDefaultEdit, parseEditState } from './edit-state'
import { type Clip } from './timeline'
import {
  cutPoints,
  isSceneCut,
  parseTransitions,
  pruneTransitions,
  sceneCuts,
  transitionAt,
} from './transitions'
import { sourceSegments } from './timeline'

const clips: Clip[] = [
  { id: 'a', sourceStart: 0, sourceEnd: 3000, speed: 1 },
  { id: 'b', sourceStart: 5000, sourceEnd: 9000, speed: 2 },
  { id: 'c', sourceStart: 9000, sourceEnd: 10_000, speed: 1 },
]

describe('transitions', () => {
  it('chỗ nối sau mỗi clip (trừ clip cuối), tính theo tốc độ clip', () => {
    expect(cutPoints(clips)).toEqual([
      { afterClip: 'a', at: 3000 },
      { afterClip: 'b', at: 5000 },
    ])
  })

  it('chỗ đổi cảnh: bỏ một đoạn dài hoặc đổi đoạn quay; tách tại chỗ / cắt lặng thì không', () => {
    const list: Clip[] = [
      { id: 'a', sourceStart: 0, sourceEnd: 3000, speed: 1 },
      // Tách tại chỗ: hình liền.
      { id: 'b', sourceStart: 3000, sourceEnd: 6000, speed: 1 },
      // Cắt khoảng lặng 1,5 s: vẫn liền (không phải đổi cảnh).
      { id: 'c', sourceStart: 7500, sourceEnd: 10_000, speed: 1 },
      // Bỏ đi 5 s: đổi cảnh.
      { id: 'd', sourceStart: 15_000, sourceEnd: 18_000, speed: 1 },
      // Khung đứng yên rồi tiếp tục: không đổi cảnh.
      { id: 'e', sourceStart: 18_000, sourceEnd: 18_000, speed: 1, freeze: 1000 },
      { id: 'f', sourceStart: 18_000, sourceEnd: 20_000, speed: 1 },
      // Đảo thứ tự (quay lại đoạn đầu): đổi cảnh.
      { id: 'g', sourceStart: 0, sourceEnd: 2000, speed: 1 },
    ]
    expect(sceneCuts(list).map((c) => c.afterClip)).toEqual(['c', 'f'])
    expect(cutPoints(list).length).toBe(6)
    // Hai đoạn quay nối nhau: chỗ nối giữa hai đoạn là đổi cảnh dù nguồn liền số.
    const segments = sourceSegments([
      { index: 0, startedAt: 1000, endedAt: 4000, tracks: {} },
      { index: 1, startedAt: 9000, endedAt: 15_000, tracks: {} },
    ])
    const two: Clip[] = [
      { id: 'x', sourceStart: 0, sourceEnd: 3000, speed: 1 },
      { id: 'y', sourceStart: 3000, sourceEnd: 9000, speed: 1 },
    ]
    expect(sceneCuts(two)).toEqual([])
    expect(sceneCuts(two, segments).map((c) => c.afterClip)).toEqual(['x'])
    // Clip phát ngược: mép theo chiều phát.
    expect(
      isSceneCut(
        { id: 'r', sourceStart: 0, sourceEnd: 3000, speed: 1, reversed: true },
        { id: 's', sourceStart: 0, sourceEnd: 2000, speed: 1 },
      ),
    ).toBe(false)
    expect(
      isSceneCut(
        { id: 'r', sourceStart: 0, sourceEnd: 3000, speed: 1, reversed: true },
        { id: 's', sourceStart: 3000, sourceEnd: 5000, speed: 1 },
      ),
    ).toBe(true)
  })

  it('tiến trình và độ mạnh quanh chỗ nối: mạnh nhất đúng chỗ nối', () => {
    const tr = [{ afterClip: 'a', kind: 'fadeBlack' as const, durationMs: 1000 }]
    expect(transitionAt(clips, tr, 2400)).toBeNull()
    expect(transitionAt(clips, tr, 2500)).toEqual({
      kind: 'fadeBlack',
      progress: 0,
      strength: 0,
      after: false,
    })
    expect(transitionAt(clips, tr, 2750)!.strength).toBeCloseTo(0.5)
    expect(transitionAt(clips, tr, 3000)).toMatchObject({ progress: 0.5, strength: 1, after: true })
    expect(transitionAt(clips, tr, 3250)!.strength).toBeCloseTo(0.5)
    expect(transitionAt(clips, tr, 3500)).toBeNull()
    expect(transitionAt(clips, [], 3000)).toBeNull()
  })

  it('bỏ chuyển tiếp của clip đã xóa hoặc trở thành clip cuối', () => {
    const tr = [
      { afterClip: 'a', kind: 'zoom' as const, durationMs: 600 },
      { afterClip: 'b', kind: 'blur' as const, durationMs: 600 },
      { afterClip: 'gone', kind: 'flash' as const, durationMs: 600 },
    ]
    expect(pruneTransitions(clips, tr).map((t) => t.afterClip)).toEqual(['a', 'b'])
    expect(pruneTransitions(clips.slice(0, 2), tr).map((t) => t.afterClip)).toEqual(['a'])
  })

  it('đọc file: kiểu lạ bị bỏ, thời gian bị giới hạn; edit.json cũ không có chuyển tiếp vẫn đọc được', () => {
    expect(
      parseTransitions([
        { afterClip: 'a', kind: 'slide', durationMs: 99_999 },
        { afterClip: 'b', kind: 'explode', durationMs: 500 },
        { afterClip: 'c', kind: 'glitch' },
      ]),
    ).toEqual([
      { afterClip: 'a', kind: 'slide', durationMs: 2000 },
      { afterClip: 'c', kind: 'glitch', durationMs: 600 },
    ])
    const project = {
      segments: [{ index: 0, startedAt: 0, endedAt: 10_000, tracks: {} }],
      cursorHidden: true,
      fps: 30,
    }
    const old = { ...createDefaultEdit(project) } as Record<string, unknown>
    delete old.transitions
    expect(parseEditState(old, project as never).transitions).toEqual([])
  })
})

describe('thư viện chuyển cảnh', () => {
  it('mỗi chuyển cảnh có nhóm, mô tả cho AI và phân tích được từ file dự án', async () => {
    const { TRANSITION_CATEGORIES, TRANSITION_CATEGORY, TRANSITION_INFO, TRANSITION_KINDS } =
      await import('./transitions')
    expect(TRANSITION_KINDS.length).toBeGreaterThanOrEqual(21)
    expect(new Set(TRANSITION_KINDS).size).toBe(TRANSITION_KINDS.length)
    for (const kind of TRANSITION_KINDS) {
      expect(TRANSITION_CATEGORIES).toContain(TRANSITION_CATEGORY[kind])
      expect(TRANSITION_INFO[kind].length).toBeGreaterThan(10)
    }
    for (const cat of TRANSITION_CATEGORIES)
      expect(
        TRANSITION_KINDS.some((k) => TRANSITION_CATEGORY[k] === cat),
        cat,
      ).toBe(true)
    const parsed = parseTransitions(
      TRANSITION_KINDS.map((kind) => ({ afterClip: `c-${kind}`, kind, durationMs: 400 })),
    )
    expect(parsed.map((t) => t.kind)).toEqual([...TRANSITION_KINDS])
    expect(parseTransitions([{ afterClip: 'a', kind: 'crossfade' }])).toEqual([])
  })
})
