import { describe, expect, it, vi } from 'vitest'
import { applyTransition } from './draw'
import type { FrameScene } from './scene'

/** Ngữ cảnh canvas giả ghi lại các lệnh vẽ. */
function fakeCtx() {
  const calls: string[] = []
  const state = {
    fillStyle: '',
    filter: 'none',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  }
  const ctx = {
    ...state,
    canvas: { width: 1280, height: 720 },
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    fillRect: vi.fn(function (this: typeof state) {
      calls.push(`fill ${this.fillStyle}`)
    }),
    drawImage: vi.fn(function (this: typeof state) {
      calls.push(`draw filter=${this.filter}`)
    }),
    translate: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    getContext: vi.fn(),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const scene = (transition: FrameScene['transition']) =>
  ({ width: 1280, height: 720, transition }) as unknown as FrameScene

describe('applyTransition', () => {
  it('không có chuyển tiếp: không vẽ gì', () => {
    const { ctx, calls } = fakeCtx()
    applyTransition(ctx, scene(null))
    applyTransition(ctx, scene({ kind: 'fadeBlack', progress: 0, strength: 0, after: false }))
    expect(calls).toEqual([])
  })

  it('mờ qua đen: phủ màu đen đúng độ mạnh, save/restore cân bằng', () => {
    const { ctx, calls } = fakeCtx()
    applyTransition(ctx, scene({ kind: 'fadeBlack', progress: 0.5, strength: 1, after: true }))
    expect(calls).toEqual(['save', 'fill rgba(0,0,0,1)', 'restore'])
  })

  it('lóe sáng mạnh nhất ở chỗ nối, yếu nhanh ở hai bên', () => {
    const peak = fakeCtx()
    applyTransition(peak.ctx, scene({ kind: 'flash', progress: 0.5, strength: 1, after: true }))
    expect(peak.calls[1]).toBe('fill rgba(255,255,255,0.95)')
    const edge = fakeCtx()
    applyTransition(edge.ctx, scene({ kind: 'flash', progress: 0.25, strength: 0.5, after: false }))
    expect(edge.calls[1]).toBe('fill rgba(255,255,255,0.11875)')
  })
})
