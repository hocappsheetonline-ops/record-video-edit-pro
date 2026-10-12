import { describe, expect, it } from 'vitest'
import { createDefaultEdit, parseEditState } from './edit-state'
import { type Clip } from './timeline'
import { cutPoints, parseTransitions, pruneTransitions, transitionAt } from './transitions'

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
