import { accentForeground, overlayMotion, type Overlay } from '@lumora/core'
import type { Ctx } from './draw'

export interface OverlayItem {
  overlay: Overlay
  /** ms kể từ lúc lớp xuất hiện (cho GIF và hiệu ứng). */
  local: number
}

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'

function textFont(o: Overlay, px: number): string {
  switch (o.style) {
    case 'meme':
      return `900 ${px}px Impact, "Arial Black", "Segoe UI", sans-serif`
    case 'title':
      return `800 ${px}px "Segoe UI", "Inter", system-ui, sans-serif`
    case 'bubble':
      return `700 ${px}px "Segoe UI", "Inter", system-ui, sans-serif`
    case 'neon':
      return `700 ${px}px "Segoe UI", "Inter", system-ui, sans-serif`
  }
}

const lines = (o: Overlay) => {
  const text = o.style === 'meme' ? o.text.toUpperCase() : o.text
  return text.split('\n').map((l) => l || ' ')
}

/** Khung bao (px, chưa xoay) của lớp nổi — dùng để vẽ và để bấm/kéo trên khung xem trước. */
export function overlayBox(ctx: Ctx, o: Overlay, width: number, height: number) {
  const px = o.size * height
  const cx = o.x * width
  const cy = o.y * height
  if (o.kind === 'image') return { cx, cy, w: px * o.aspect, h: px }
  if (o.kind === 'emoji') return { cx, cy, w: px * 1.2, h: px * 1.2 }
  ctx.save()
  ctx.font = textFont(o, px)
  const w = Math.max(...lines(o).map((l) => ctx.measureText(l).width))
  ctx.restore()
  const pad = o.style === 'bubble' ? px * 0.5 : px * 0.15
  return { cx, cy, w: w + pad * 2, h: lines(o).length * px * 1.2 + pad }
}

/** Vẽ chữ, emoji, ảnh/GIF meme với hiệu ứng xuất hiện / chuyển động. */
export function drawOverlays(
  ctx: Ctx,
  items: readonly OverlayItem[],
  width: number,
  height: number,
  imageAt: (file: string, local: number) => CanvasImageSource | null,
) {
  for (const { overlay: o, local } of items) {
    const m = overlayMotion(o, o.start + local)
    if (m.opacity <= 0 || m.scale <= 0) continue
    const box = overlayBox(ctx, o, width, height)
    const px = o.size * height
    ctx.save()
    ctx.globalAlpha = m.opacity
    ctx.translate(box.cx + m.dx * height, box.cy + m.dy * height)
    ctx.rotate(((o.rotation + m.rotate) * Math.PI) / 180)
    ctx.scale(m.scale, m.scale)
    if (o.kind === 'image') {
      const img = imageAt(o.file, local)
      if (img) ctx.drawImage(img, -box.w / 2, -box.h / 2, box.w, box.h)
    } else if (o.kind === 'emoji') {
      ctx.font = `${px}px ${EMOJI_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.text, 0, 0)
    } else {
      drawText(ctx, o, px, box)
    }
    ctx.restore()
  }
}

function drawText(ctx: Ctx, o: Overlay, px: number, box: { w: number; h: number }) {
  const rows = lines(o)
  ctx.font = textFont(o, px)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const lineH = px * 1.2
  const top = -((rows.length - 1) * lineH) / 2
  if (o.style === 'bubble') {
    const r = px * 0.5
    ctx.beginPath()
    ctx.roundRect(-box.w / 2, -box.h / 2, box.w, box.h, r)
    ctx.fillStyle = o.color
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = px * 0.3
    ctx.fill()
    ctx.shadowColor = 'transparent'
  }
  rows.forEach((row, i) => {
    const y = top + i * lineH
    switch (o.style) {
      case 'meme':
        ctx.lineWidth = px * 0.14
        ctx.strokeStyle = '#000000'
        ctx.strokeText(row, 0, y)
        ctx.fillStyle = o.color
        ctx.fillText(row, 0, y)
        break
      case 'title':
        ctx.shadowColor = 'rgba(0,0,0,0.55)'
        ctx.shadowBlur = px * 0.25
        ctx.shadowOffsetY = px * 0.06
        ctx.fillStyle = o.color
        ctx.fillText(row, 0, y)
        break
      case 'bubble':
        ctx.fillStyle = accentForeground(o.color)
        ctx.fillText(row, 0, y)
        break
      case 'neon':
        ctx.shadowColor = o.color
        ctx.shadowBlur = px * 0.6
        ctx.lineWidth = px * 0.05
        ctx.strokeStyle = o.color
        ctx.strokeText(row, 0, y)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(row, 0, y)
        break
    }
  })
}
