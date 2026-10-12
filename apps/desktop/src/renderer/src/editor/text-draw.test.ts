import { describe, expect, it, vi } from 'vitest'
import { NO_ANIM, templateStyle, withTextStyle, type Overlay } from '@lumora/core'
import type { Ctx } from './draw'
import { drawShape } from './shape-draw'
import { drawTextLayer, layoutText } from './text-draw'

/** Canvas giả: mỗi ký tự rộng 10px, ghi lại chữ được vẽ / viền / gradient. */
function fakeCtx() {
  const fills: string[] = []
  const strokes: string[] = []
  const ctx = {
    font: '',
    letterSpacing: '0px',
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    setTransform: vi.fn(),
    measureText: (text: string) => ({ width: [...text].length * 10 }),
    fillText: (text: string) => fills.push(text),
    strokeText: (text: string) => strokes.push(text),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
  return { ctx: ctx as unknown as Ctx & typeof ctx, fills, strokes }
}

const text = (t: string, style = templateStyle('title')): Overlay => ({
  id: 't',
  kind: 'text',
  start: 0,
  end: 3000,
  x: 0.5,
  y: 0.5,
  size: 0.1,
  rotation: 0,
  anim: NO_ANIM,
  text: t,
  style: 'title',
  color: '#ffffff',
  textStyle: style,
  file: '',
  aspect: 1,
  mediaOffset: 0,
  sourceDuration: 0,
  hasAudio: false,
  volume: 1,
  keyColor: '',
  keyStrength: 0.4,
})

describe('lớp chữ', () => {
  it('dàn chữ: chia dòng, đo từng từ, chữ in hoa, phông trong chuỗi font', () => {
    const { ctx } = fakeCtx()
    const o = text('ab cd\nxyz', withTextStyle(templateStyle('title'), { uppercase: true }))
    const layout = layoutText(ctx, o, 40)
    expect(layout.lines.map((l) => l.text)).toEqual(['AB CD', 'XYZ'])
    expect(layout.lines[0]!.words.map((w) => [w.text, w.x])).toEqual([
      ['AB', 0],
      ['CD', 30],
    ])
    expect(layout.maxLine).toBe(50)
    expect(layout.font).toContain('40px')
    expect(layout.width).toBeGreaterThan(50)
  })

  it('máy đánh chữ chỉ vẽ phần đã gõ; viền vẽ trước chữ', () => {
    const { ctx, fills, strokes } = fakeCtx()
    const style = withTextStyle(templateStyle('meme'), { anim: 'typewriter' })
    const o = text('hello world', style)
    drawTextLayer(ctx, o, 40, layoutText(ctx, o, 40), 0)
    expect(fills).toEqual(['H'])
    expect(strokes).toEqual(['H'])
    fills.length = 0
    drawTextLayer(ctx, o, 40, layoutText(ctx, o, 40), 2900)
    expect(fills).toEqual(['HELLO WORLD'])
  })

  it('hiệu ứng từng từ vẽ riêng từng từ; chuyển màu tạo gradient', () => {
    const { ctx, fills } = fakeCtx()
    const style = withTextStyle(templateStyle('title'), {
      anim: 'wave',
      gradient: { from: '#ff0000', to: '#0000ff', angle: 45 },
    })
    const o = text('một hai ba', style)
    drawTextLayer(ctx, o, 40, layoutText(ctx, o, 40), 500)
    expect(fills).toEqual(['một', 'hai', 'ba'])
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1)
  })

  it('nền chữ vẽ khung bo góc; mờ dần khi hoạt ảnh vào chưa xong', () => {
    const { ctx, fills } = fakeCtx()
    const o = text('abcd', templateStyle('bubble'))
    drawTextLayer(ctx, o, 40, layoutText(ctx, o, 40), 0, 0.5)
    expect(ctx.roundRect).toHaveBeenCalled()
    expect(fills).toEqual(['ab'])
  })
})

describe('hình vẽ sẵn', () => {
  it('mỗi hình đều vẽ được; hình nét dùng stroke, ngôi sao tô kín', () => {
    for (const shape of ['arrow', 'circle', 'box', 'check'] as const) {
      const { ctx } = fakeCtx()
      drawShape(ctx, shape, '#ef4444', 200, 100, 8)
      expect(ctx.stroke).toHaveBeenCalled()
    }
    const { ctx } = fakeCtx()
    drawShape(ctx, 'star', '#facc15', 100, 100, 8)
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})
