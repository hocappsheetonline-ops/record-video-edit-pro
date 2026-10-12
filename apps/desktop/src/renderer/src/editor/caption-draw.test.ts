import { describe, expect, it, vi } from 'vitest'
import { CAPTION_TEMPLATES, DEFAULT_CAPTION_LOOK, withCaptionTemplate } from '@lumora/core'
import { drawCaptionBlock } from './caption-draw'
import type { Ctx } from './draw'
import type { SceneCaptions } from './scene'

/** Canvas giả: mỗi ký tự rộng 10px; ghi lại chữ vẽ (kèm màu tô) và khung nền. */
function fakeCtx() {
  const fills: { text: string; color: string; y: number }[] = []
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = []
  const ctx = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn((x: number, y: number, w: number, h: number) =>
      rects.push({ x, y, w, h, color: '' }),
    ),
    fill: vi.fn(() => {
      const last = rects[rects.length - 1]
      if (last && !last.color) last.color = String(ctx.fillStyle)
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
      rects.push({ x, y, w, h, color: String(ctx.fillStyle) }),
    ),
    strokeText: vi.fn(),
    measureText: (text: string) => ({ width: [...text].length * 10 }),
    fillText: (text: string, _x: number, y: number) =>
      fills.push({ text, color: String(ctx.fillStyle), y }),
  }
  return { ctx: ctx as unknown as Ctx & typeof ctx, fills, rects }
}

const caption = (patch: Partial<SceneCaptions> = {}): SceneCaptions => ({
  words: ['một', 'hai', 'ba'].map((text, i) => ({
    text,
    active: i === 1,
    spoken: i <= 1,
    since: i === 1 ? 50 : 500,
  })),
  style: 'highlight',
  look: DEFAULT_CAPTION_LOOK,
  fontSize: 40,
  translation: null,
  ...patch,
})

describe('vẽ phụ đề theo mẫu', () => {
  it('mẫu hộp: nền tối, từ đang nói màu nhấn; khối nằm quanh vị trí dọc đã đặt', () => {
    const { ctx, fills, rects } = fakeCtx()
    drawCaptionBlock(ctx, caption({ look: { ...DEFAULT_CAPTION_LOOK, y: 0.5 } }), 1000, 600)
    expect(rects[0]!.color).toBe('rgba(0,0,0,0.68)')
    expect(fills.map((f) => [f.text, f.color])).toEqual([
      ['một', '#ffffff'],
      ['hai', '#facc15'],
      ['ba', '#ffffff'],
    ])
    expect(fills[0]!.y).toBeCloseTo(300, 0)
  })

  it('karaoke tô các từ đã nói; popWord chỉ vẽ từ đã nói; tiktok có khối màu sau từ đang nói', () => {
    const k = fakeCtx()
    drawCaptionBlock(
      k.ctx,
      caption({ look: withCaptionTemplate(DEFAULT_CAPTION_LOOK, 'karaoke') }),
      1000,
      600,
    )
    expect(k.fills.map((f) => f.color)).toEqual(['#22d3ee', '#22d3ee', '#ffffff'])

    const p = fakeCtx()
    drawCaptionBlock(
      p.ctx,
      caption({ look: withCaptionTemplate(DEFAULT_CAPTION_LOOK, 'popWord') }),
      1000,
      600,
    )
    expect(p.fills.map((f) => f.text)).toEqual(['một', 'hai'])
    expect(p.ctx.scale).toHaveBeenCalled()

    const t = fakeCtx()
    drawCaptionBlock(
      t.ctx,
      caption({ look: withCaptionTemplate(DEFAULT_CAPTION_LOOK, 'tiktok') }),
      1000,
      600,
    )
    expect(t.rects.map((r) => r.color)).toEqual(['#8b5cf6'])
  })

  it('song ngữ: dòng dịch vẽ dưới dòng gốc; khối không ra ngoài khung', () => {
    const { ctx, fills } = fakeCtx()
    drawCaptionBlock(
      ctx,
      caption({ translation: 'one two three', look: { ...DEFAULT_CAPTION_LOOK, y: 0.95 } }),
      1000,
      600,
    )
    const sub = fills.find((f) => f.text === 'one two three')!
    expect(sub.y).toBeGreaterThan(fills[0]!.y)
    expect(sub.y).toBeLessThan(600)
  })

  it('mọi mẫu đều vẽ được đủ chữ (trừ popWord chỉ vẽ từ đã nói)', () => {
    for (const template of CAPTION_TEMPLATES) {
      const { ctx, fills } = fakeCtx()
      drawCaptionBlock(
        ctx,
        caption({ look: withCaptionTemplate(DEFAULT_CAPTION_LOOK, template) }),
        1000,
        600,
      )
      expect(fills.length).toBe(template === 'popWord' ? 2 : 3)
    }
  })
})
