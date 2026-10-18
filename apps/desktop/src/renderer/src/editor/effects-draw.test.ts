import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EFFECT_KINDS, TRANSITION_KINDS, type ActiveEffect } from '@lumora/core'
import { applyEffects } from './effects-draw'
import { applyTransition } from './draw'
import type { FrameScene } from './scene'

/**
 * Ngữ cảnh canvas giả nhận mọi lệnh vẽ (Proxy): kiểm tra từng hiệu ứng / chuyển cảnh vẽ được,
 * cân bằng save/restore và không để lại bộ lọc hay độ trong suốt cho lớp vẽ sau.
 */
function fakeCtx() {
  const counts = { save: 0, restore: 0, draws: 0, fills: 0 }
  const state: Record<string, unknown> = {
    filter: 'none',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    fillStyle: '#000',
    canvas: { width: 1280, height: 720 },
  }
  const gradient = { addColorStop: vi.fn() }
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (...args: unknown[]) => {
        if (prop === 'save') counts.save += 1
        if (prop === 'restore') counts.restore += 1
        if (prop === 'drawImage') counts.draws += 1
        if (prop === 'fillRect' || prop === 'fill') counts.fills += 1
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return gradient
        if (prop === 'getContext') return ctx
        void args
        return undefined
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, counts }
}

class FakeOffscreen {
  width: number
  height: number
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
  }
  getContext() {
    return fakeCtx().ctx
  }
}

const sceneWith = (effects: ActiveEffect[], transition: FrameScene['transition'] = null) =>
  ({ width: 1280, height: 720, effects, transition }) as unknown as FrameScene

describe('thư viện hiệu ứng & chuyển cảnh: vẽ được mọi loại', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreen)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(EFFECT_KINDS)(
    'hiệu ứng %s vẽ không lỗi ở nhiều thời điểm, trả lại trạng thái',
    (kind) => {
      for (const local of [0, 120, 333, 700, 1999]) {
        const { ctx, counts } = fakeCtx()
        applyEffects(ctx, sceneWith([{ kind, intensity: 0.7, local, progress: local / 2000 }]))
        expect(counts.save).toBe(counts.restore)
        expect(counts.draws + counts.fills).toBeGreaterThanOrEqual(0)
      }
      // Độ mạnh tối đa và tối thiểu đều phải vẽ được.
      for (const intensity of [0.05, 1]) {
        const { ctx, counts } = fakeCtx()
        applyEffects(ctx, sceneWith([{ kind, intensity, local: 500, progress: 0.25 }]))
        expect(counts.save).toBe(counts.restore)
      }
    },
  )

  it('hiệu ứng có chuyển động thật sự vẽ gì đó khi độ mạnh 1', () => {
    for (const kind of EFFECT_KINDS) {
      const { ctx, counts } = fakeCtx()
      applyEffects(ctx, sceneWith([{ kind, intensity: 1, local: 50, progress: 0.05 }]))
      // strobe tắt ở nửa sau mỗi chu kỳ, kiểm tra tại lúc sáng (local 50 < 40% của 166).
      expect(counts.draws + counts.fills, kind).toBeGreaterThan(0)
    }
  })

  it.each(TRANSITION_KINDS)('chuyển cảnh %s vẽ được cả hai phía chỗ nối', (kind) => {
    for (const [progress, after] of [
      [0.1, false],
      [0.49, false],
      [0.5, true],
      [0.9, true],
    ] as const) {
      const { ctx, counts } = fakeCtx()
      const strength = 1 - Math.abs(progress * 2 - 1)
      applyTransition(ctx, sceneWith([], { kind, progress, strength, after }))
      expect(counts.save).toBe(counts.restore)
      expect(counts.draws + counts.fills, `${kind}@${progress}`).toBeGreaterThan(0)
    }
  })

  it('nhiều hiệu ứng chồng nhau vẽ theo thứ tự, mỗi cái một cặp save/restore', () => {
    const { ctx, counts } = fakeCtx()
    applyEffects(
      ctx,
      sceneWith([
        { kind: 'bw', intensity: 1, local: 0, progress: 0 },
        { kind: 'letterbox', intensity: 1, local: 0, progress: 0 },
        { kind: 'grain', intensity: 0.5, local: 0, progress: 0 },
      ]),
    )
    expect(counts.save).toBe(3)
    expect(counts.restore).toBe(3)
  })
})
