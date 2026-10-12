import { accentForeground, chromaKey, lookLayers, overlayMotion, type Overlay } from '@lumora/core'
import type { Ctx, FrameSource } from './draw'
import { applyLookLayers } from './look-draw'

/** Hình của lớp ảnh / video tại `local` ms kể từ lúc hiện (null nếu chưa tải xong). */
export type OverlayMediaFn = (overlay: Overlay, local: number) => FrameSource | null

/** Bọc ảnh (ImageBitmap…) thành nguồn hình chung. */
export function imageSource(image: ImageBitmap | null): FrameSource | null {
  if (!image) return null
  return {
    width: image.width,
    height: image.height,
    draw: (ctx, ...args) => ctx.drawImage(image, ...args),
  }
}

export interface OverlayItem {
  overlay: Overlay
  /** ms kể từ lúc lớp xuất hiện (cho GIF và hiệu ứng). */
  local: number
  /**
   * Vẽ đứng yên, bỏ hiệu ứng chuyển động: lớp đang chọn khi tạm dừng xem trước (để thấy và chỉnh
   * được ngay cả ở khung đầu, lúc hiệu ứng "bật ra" còn cỡ 0). Không dùng khi xuất video.
   */
  still?: boolean
}

const STILL = { scale: 1, opacity: 1, dx: 0, dy: 0, rotate: 0 }

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
  if (o.kind === 'image' || o.kind === 'video') return { cx, cy, w: px * o.aspect, h: px }
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
  mediaAt: OverlayMediaFn,
) {
  for (const { overlay: o, local, still } of items) {
    const m = still ? STILL : overlayMotion(o, o.start + local)
    if (m.opacity <= 0 || m.scale <= 0) continue
    const box = overlayBox(ctx, o, width, height)
    const px = o.size * height
    ctx.save()
    ctx.globalAlpha = m.opacity
    ctx.translate(box.cx + m.dx * height, box.cy + m.dy * height)
    ctx.rotate(((o.rotation + m.rotate) * Math.PI) / 180)
    ctx.scale(m.scale, m.scale)
    if (o.kind === 'image' || o.kind === 'video') {
      const media = mediaAt(o, local)
      if (media) drawMedia(ctx, media, o, box.w, box.h, Math.floor((o.start + local) / 40))
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

/** Bản nháp xóa phông, riêng cho từng canvas đích (giống `snapshot`). */
const keyScratch = new WeakMap<object, OffscreenCanvas | HTMLCanvasElement>()
const maskScratch = new WeakMap<object, OffscreenCanvas | HTMLCanvasElement>()
/** Cạnh dài tối đa (px) khi xử lý ảnh / video meme ở canvas nháp (xóa phông, bộ lọc). */
const KEY_MAX = 720

function scratchFor(
  map: WeakMap<object, OffscreenCanvas | HTMLCanvasElement>,
  owner: object,
  w: number,
  h: number,
) {
  let scratch = map.get(owner)
  if (!scratch) {
    scratch =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h })
    map.set(owner, scratch)
  }
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w
    scratch.height = h
  }
  return scratch
}

/**
 * Vẽ ảnh / video của lớp nổi. Có xóa phông hoặc bộ lọc thì xử lý ở canvas nháp: xóa phông trước
 * (màu cần xóa không bị bộ lọc làm lệch), rồi bộ lọc màu, rồi trả lại đúng phần trong suốt.
 */
function drawMedia(ctx: Ctx, media: FrameSource, o: Overlay, w: number, h: number, frame: number) {
  const full = [0, 0, media.width, media.height] as const
  const look = o.look ? lookLayers(o.look) : null
  if (!o.keyColor && !look) {
    media.draw(ctx, ...full, -w / 2, -h / 2, w, h)
    return
  }
  const scale = Math.min(1, KEY_MAX / Math.max(w, h, 1))
  const sw = Math.max(1, Math.round(w * scale))
  const sh = Math.max(1, Math.round(h * scale))
  const scratch = scratchFor(keyScratch, ctx.canvas, sw, sh)
  const sctx = scratch.getContext('2d', { willReadFrequently: !!o.keyColor }) as Ctx | null
  if (!sctx) return
  sctx.clearRect(0, 0, sw, sh)
  media.draw(sctx, ...full, 0, 0, sw, sh)
  if (o.keyColor) {
    try {
      const pixels = sctx.getImageData(0, 0, sw, sh)
      chromaKey(pixels.data, o.keyColor, o.keyStrength)
      sctx.putImageData(pixels, 0, 0)
    } catch {
      // Nguồn khác gốc (không đọc được điểm ảnh): vẽ nguyên bản thay vì bỏ trống.
    }
  }
  if (look) {
    // Bản sao trước khi lọc: vừa làm nguồn cho bộ lọc CSS, vừa làm mặt nạ độ trong suốt.
    const mask = scratchFor(maskScratch, ctx.canvas, sw, sh)
    const mctx = mask.getContext('2d') as Ctx | null
    if (mctx) {
      mctx.globalCompositeOperation = 'copy'
      mctx.drawImage(scratch, 0, 0)
      sctx.save()
      sctx.globalCompositeOperation = 'copy'
      sctx.filter = look.css
      sctx.drawImage(mask, 0, 0)
      sctx.restore()
      applyLookLayers(sctx, look, { x: 0, y: 0, width: sw, height: sh }, frame)
      sctx.save()
      sctx.globalCompositeOperation = 'destination-in'
      sctx.drawImage(mask, 0, 0)
      sctx.restore()
    }
  }
  ctx.drawImage(scratch, -w / 2, -h / 2, w, h)
}
