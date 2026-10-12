import { describe, expect, it, vi } from 'vitest'
import { BEAUTY_PRESET, NO_BEAUTY } from '@lumora/core'
import { drawBeautified } from './draw'

/** Ngữ cảnh canvas giả: ghi lại bộ lọc và độ trong suốt mỗi lần vẽ. */
function fakeCtx() {
  const calls: { filter: string; alpha: number }[] = []
  const ctx = { filter: 'none', globalAlpha: 1 } as unknown as CanvasRenderingContext2D
  const paint = vi.fn(() => calls.push({ filter: ctx.filter, alpha: ctx.globalAlpha }))
  return { ctx, calls, paint }
}

describe('drawBeautified', () => {
  it('tắt làm đẹp: vẽ đúng một lần, không bộ lọc', () => {
    const { ctx, calls, paint } = fakeCtx()
    drawBeautified(ctx, NO_BEAUTY, 300, paint)
    expect(calls).toEqual([{ filter: 'none', alpha: 1 }])
  })

  it('làm đẹp tự động: lớp gốc có bộ lọc màu, lớp mờ trong suốt phủ lên; trả lại trạng thái cũ', () => {
    const { ctx, calls, paint } = fakeCtx()
    drawBeautified(ctx, BEAUTY_PRESET, 300, paint)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.filter).toMatch(/^brightness\(.*\) sepia\(.*\)/)
    expect(calls[0]!.alpha).toBe(1)
    expect(calls[1]!.filter).toMatch(/blur\(2\.16px\)$/)
    expect(calls[1]!.alpha).toBeCloseTo(0.36)
    expect(ctx.filter).toBe('none')
    expect(ctx.globalAlpha).toBe(1)
  })
})
