import {
  accentForeground,
  chromaKey,
  compositeOf,
  lookLayers,
  overlayMotion,
  posedOverlay,
  STILL_MOTION,
  type Overlay,
  type OverlayMask,
} from '@lumora/core'
import type { AnyCanvas, Ctx, FrameSource } from './draw'
import { applyLookLayers } from './look-draw'

/** Hình của lớp ảnh / video tại `local` ms kể từ lúc hiện (null nếu chưa tải xong). */
export type OverlayMediaFn = (overlay: Overlay, local: number) => FrameSource | null

/** Mặt nạ người (AI) của khung ảnh / video meme đang vẽ (null nếu chưa có). */
export type OverlayMaskFn = (overlay: Overlay, local: number) => AnyCanvas | null

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

/**
 * Vẽ chữ, emoji, ảnh/GIF meme: tư thế theo keyframe, hoạt ảnh vào / ra / lặp, độ mờ, hòa trộn,
 * lật, mặt nạ.
 */
export function drawOverlays(
  ctx: Ctx,
  items: readonly OverlayItem[],
  width: number,
  height: number,
  mediaAt: OverlayMediaFn,
  maskAt?: OverlayMaskFn,
) {
  for (const { overlay: raw, local, still } of items) {
    const t = raw.start + local
    const o = posedOverlay(raw, t)
    const m = still ? STILL_MOTION : overlayMotion(o, t)
    const alpha = m.opacity * (o.opacity ?? 1)
    if (alpha <= 0 || m.scale <= 0 || m.scaleX <= 0.001) continue
    const box = overlayBox(ctx, o, width, height)
    const px = o.size * height
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.globalCompositeOperation = compositeOf(o.blend)
    if (m.blur > 0) ctx.filter = `blur(${(m.blur * height).toFixed(2)}px)`
    ctx.translate(box.cx + m.dx * height, box.cy + m.dy * height)
    ctx.rotate(((o.rotation + m.rotate) * Math.PI) / 180)
    ctx.scale(m.scale * m.scaleX * (o.flipH ? -1 : 1), m.scale * (o.flipV ? -1 : 1))
    if (o.kind === 'image' || o.kind === 'video') {
      const media = mediaAt(raw, local)
      const aiMask = o.aiKey ? (maskAt?.(raw, local) ?? null) : null
      if (media) drawMedia(ctx, media, o, box.w, box.h, Math.floor(t / 40), aiMask)
    } else if (o.kind === 'emoji') {
      ctx.font = `${px}px ${EMOJI_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.text, 0, 0)
    } else {
      drawText(ctx, o, px, box, m.reveal)
    }
    ctx.restore()
  }
}

/** Cắt chữ còn `reveal` (0..1) phần đầu (hiệu ứng máy đánh chữ). */
function revealRows(rows: string[], reveal: number): string[] {
  if (reveal >= 1) return rows
  let left = Math.floor(rows.reduce((n, r) => n + [...r].length, 0) * reveal)
  return rows.map((row) => {
    const chars = [...row]
    const shown = chars.slice(0, Math.max(0, left)).join('')
    left -= chars.length
    return shown
  })
}

function drawText(ctx: Ctx, o: Overlay, px: number, box: { w: number; h: number }, reveal = 1) {
  const rows = revealRows(lines(o), reveal)
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
function drawMedia(
  ctx: Ctx,
  media: FrameSource,
  o: Overlay,
  w: number,
  h: number,
  frame: number,
  aiMask: AnyCanvas | null = null,
) {
  const full = [0, 0, media.width, media.height] as const
  const look = o.look ? lookLayers(o.look) : null
  if (!o.keyColor && !look && !o.mask && !aiMask) {
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
  if (aiMask) {
    // Xóa phông AI: chỉ giữ phần là người.
    sctx.save()
    sctx.globalCompositeOperation = 'destination-in'
    sctx.filter = `blur(${Math.max(0.5, sw / 400).toFixed(2)}px)`
    sctx.drawImage(aiMask, 0, 0, sw, sh)
    sctx.restore()
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
  if (o.mask) applyMask(ctx.canvas, sctx, o.mask, sw, sh)
  ctx.drawImage(scratch, -w / 2, -h / 2, w, h)
}

const shapeScratch = new WeakMap<object, OffscreenCanvas | HTMLCanvasElement>()

/** Đường viền trái tim / ngôi sao, cỡ đơn vị (vừa khung -1..1). */
function shapePath(ctx: Ctx, shape: OverlayMask['shape'], r: number) {
  ctx.beginPath()
  if (shape === 'heart') {
    ctx.moveTo(0, r * 0.95)
    ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.65, -r * 1.1, 0, -r * 0.45)
    ctx.bezierCurveTo(r * 0.65, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.95)
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2
      const rr = i % 2 === 0 ? r : r * 0.45
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
  }
  ctx.closePath()
}

/** Mặt nạ hình (tròn, chữ nhật, tim, sao, tuyến tính, gương) có viền mềm, đảo được. */
function applyMask(owner: object, sctx: Ctx, mask: OverlayMask, sw: number, sh: number) {
  const canvas = scratchFor(shapeScratch, owner, sw, sh)
  const m = canvas.getContext('2d') as Ctx | null
  if (!m) return
  const min = Math.min(sw, sh)
  const big = Math.hypot(sw, sh) * 2
  m.save()
  m.setTransform(1, 0, 0, 1, 0, 0)
  m.globalCompositeOperation = 'source-over'
  m.filter = 'none'
  m.clearRect(0, 0, sw, sh)
  if (mask.invert) {
    m.fillStyle = '#fff'
    m.fillRect(0, 0, sw, sh)
    m.globalCompositeOperation = 'destination-out'
  }
  m.filter = mask.feather > 0 ? `blur(${(mask.feather * 0.2 * min).toFixed(2)}px)` : 'none'
  m.fillStyle = '#fff'
  m.translate(sw * (0.5 + mask.x), sh * (0.5 + mask.y))
  m.rotate((mask.rotation * Math.PI) / 180)
  switch (mask.shape) {
    case 'circle':
      m.beginPath()
      m.arc(0, 0, (mask.scale * min) / 2, 0, Math.PI * 2)
      m.fill()
      break
    case 'rect':
      m.fillRect((-mask.scale * sw) / 2, (-mask.scale * sh) / 2, mask.scale * sw, mask.scale * sh)
      break
    case 'heart':
    case 'star':
      shapePath(m, mask.shape, (mask.scale * min) / 2)
      m.fill()
      break
    case 'linear':
      // Giữ nửa phía trên đường thẳng đi qua tâm.
      m.fillRect(-big, -big, big * 2, big)
      break
    case 'mirror':
      // Giữ một dải ngang quanh tâm.
      m.fillRect(-big, (-mask.scale * sh) / 2, big * 2, mask.scale * sh)
      break
  }
  m.restore()
  sctx.save()
  sctx.globalCompositeOperation = 'destination-in'
  sctx.drawImage(canvas, 0, 0)
  sctx.restore()
}
