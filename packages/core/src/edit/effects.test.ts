import { describe, expect, it } from 'vitest'
import { dragRegion, effectsAt, parseEffects, type EffectRegion } from './effects'

const fx: EffectRegion[] = [
  { id: 'a', kind: 'shake', start: 1000, end: 3000, intensity: 0.8 },
  { id: 'b', kind: 'bw', start: 2000, end: 4000, intensity: 1 },
  { id: 'c', kind: 'vhs', start: 0, end: 5000, intensity: 0 },
]

describe('effects', () => {
  it('hiệu ứng đang chạy tại một thời điểm, có thời gian và tiến trình riêng; độ mạnh 0 thì bỏ qua', () => {
    expect(effectsAt(fx, 500)).toEqual([])
    expect(effectsAt(fx, 1500)).toEqual([
      { kind: 'shake', intensity: 0.8, local: 500, progress: 0.25 },
    ])
    expect(effectsAt(fx, 2500).map((e) => e.kind)).toEqual(['shake', 'bw'])
    expect(effectsAt(fx, 3000).map((e) => e.kind)).toEqual(['bw'])
  })

  it('kéo khoảng: di chuyển trong video, kéo mép không ngắn quá 200ms', () => {
    const r = { start: 1000, end: 3000 }
    expect(dragRegion(r, 'move', -5000, 10_000)).toEqual({ start: 0, end: 2000 })
    expect(dragRegion(r, 'move', 9000, 10_000)).toEqual({ start: 8000, end: 10_000 })
    expect(dragRegion(r, 'start', 5000, 10_000)).toEqual({ start: 2800, end: 3000 })
    expect(dragRegion(r, 'end', -5000, 10_000)).toEqual({ start: 1000, end: 1200 })
    expect(dragRegion(r, 'end', 50_000, 10_000)).toEqual({ start: 1000, end: 10_000 })
  })

  it('đọc file: bỏ kiểu lạ, khoảng sai; giới hạn độ mạnh', () => {
    expect(
      parseEffects([
        { id: 'x', kind: 'confetti', start: 0, end: 1000, intensity: 3 },
        { id: 'y', kind: 'laser', start: 0, end: 1000 },
        { id: 'z', kind: 'blur', start: 500, end: 600 },
        { id: 'w', kind: 'pulse', start: 0, end: 1000 },
      ]),
    ).toEqual([
      { id: 'x', kind: 'confetti', start: 0, end: 1000, intensity: 1 },
      { id: 'w', kind: 'pulse', start: 0, end: 1000, intensity: 0.7 },
    ])
    expect(parseEffects(null)).toEqual([])
  })
})

describe('thư viện hiệu ứng', () => {
  it('mỗi hiệu ứng có nhóm, mô tả cho AI và phân tích được từ file dự án', async () => {
    const { EFFECT_CATEGORIES, EFFECT_CATEGORY, EFFECT_INFO, EFFECT_KINDS } =
      await import('./effects')
    expect(EFFECT_KINDS.length).toBeGreaterThanOrEqual(27)
    expect(new Set(EFFECT_KINDS).size).toBe(EFFECT_KINDS.length)
    for (const kind of EFFECT_KINDS) {
      expect(EFFECT_CATEGORIES).toContain(EFFECT_CATEGORY[kind])
      expect(EFFECT_INFO[kind].length).toBeGreaterThan(10)
    }
    // Mỗi nhóm có ít nhất một hiệu ứng.
    for (const cat of EFFECT_CATEGORIES)
      expect(
        EFFECT_KINDS.some((k) => EFFECT_CATEGORY[k] === cat),
        cat,
      ).toBe(true)
    const parsed = parseEffects(
      EFFECT_KINDS.map((kind, i) => ({ id: `x${i}`, kind, start: 0, end: 1000, intensity: 0.5 })),
    )
    expect(parsed.map((e) => e.kind)).toEqual([...EFFECT_KINDS])
    expect(parseEffects([{ id: 'q', kind: 'notAnEffect', start: 0, end: 1000 }])).toEqual([])
  })
})
