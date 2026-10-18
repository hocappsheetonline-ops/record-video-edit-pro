import { beautyLayers, cameraCrop, type BeautyStyle } from '@lumora/core'
import { applyEffects } from './effects-draw'
import { drawCaptionBlock } from './caption-draw'
import { applyLookLayers, joinFilters } from './look-draw'
import { drawOverlays, type OverlayMaskFn, type OverlayMediaFn } from './overlay-draw'
import type { FrameScene } from './scene'

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Một nguồn hình (thẻ video khi xem trước, VideoSample khi xuất) có thể vẽ một phần của nó. */
export interface FrameSource {
  width: number
  height: number
  draw(
    ctx: Ctx,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
}

export function videoElementSource(video: HTMLVideoElement): FrameSource | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    draw: (ctx, ...args) => ctx.drawImage(video, ...args),
  }
}

/**
 * Vẽ webcam có làm đẹp: lớp gốc qua bộ lọc màu, rồi một lớp mờ trong suốt phủ lên để mịn da.
 * Dùng chung cho trình chỉnh sửa, video xuất và studio livestream.
 */
export function drawBeautified(
  ctx: Ctx,
  beauty: BeautyStyle,
  width: number,
  paint: () => void,
  /** Bộ lọc màu thêm (bộ lọc của clip). */
  extra?: string,
) {
  const layers = beautyLayers(beauty, width)
  const before = { filter: ctx.filter, alpha: ctx.globalAlpha }
  ctx.filter = joinFilters(layers.base, extra)
  paint()
  if (layers.soft) {
    ctx.filter = layers.soft.filter
    ctx.globalAlpha = before.alpha * layers.soft.alpha
    paint()
  }
  ctx.filter = before.filter
  ctx.globalAlpha = before.alpha
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawBackground(ctx: Ctx, scene: FrameScene) {
  const { background: bg, width, height } = scene
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color
  } else {
    const angle = (bg.angle * Math.PI) / 180
    const r = Math.hypot(width, height) / 2
    const cx = width / 2
    const cy = height / 2
    const dx = Math.sin(angle) * r
    const dy = -Math.cos(angle) * r
    const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    gradient.addColorStop(0, bg.color)
    gradient.addColorStop(1, bg.color2)
    ctx.fillStyle = gradient
  }
  ctx.fillRect(0, 0, width, height)
}

/** Con trỏ dạng mũi tên quen thuộc, vẽ bằng đường vector để phóng to vẫn nét. */
function drawCursor(ctx: Ctx, x: number, y: number, size: number, opacity: number) {
  const s = size / 24
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1.5
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 21)
  ctx.lineTo(5.2, 16.2)
  ctx.lineTo(8.6, 23.6)
  ctx.lineTo(12, 22.1)
  ctx.lineTo(8.7, 14.9)
  ctx.lineTo(15.4, 14.9)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 1.4
  ctx.strokeStyle = '#111111'
  ctx.stroke()
  ctx.restore()
}

function drawCaptions(ctx: Ctx, scene: FrameScene) {
  if (scene.captions) drawCaptionBlock(ctx, scene.captions, scene.width, scene.height)
}

/**
 * Phím tắt vừa bấm: các viên thuốc tối chữ trắng xếp ngang, giữa mép dưới video màn hình (như
 * Screen Studio / Camtasia). Mờ dần theo `opacity`.
 */
function drawKeyCaption(ctx: Ctx, scene: FrameScene) {
  const keys = scene.keys
  if (!keys || keys.combos.length === 0) return
  const { content } = scene
  const fs = keys.fontSize
  ctx.save()
  ctx.globalAlpha = keys.opacity
  ctx.font = `600 ${fs}px system-ui, "Segoe UI", Roboto, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const padX = fs * 0.7
  const gap = fs * 0.4
  const h = fs * 1.75
  const widths = keys.combos.map((c) => ctx.measureText(c).width + padX * 2)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)
  let x = content.x + content.width / 2 - total / 2
  const y = content.y + content.height - h - fs * 0.9
  keys.combos.forEach((combo, i) => {
    const w = widths[i]!
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = fs * 0.4
    ctx.fillStyle = 'rgba(22,22,28,0.82)'
    roundedRect(ctx, x, y, w, h, h * 0.28)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = Math.max(1, fs * 0.05)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(combo, x + w / 2, y + h / 2)
    x += w + gap
  })
  ctx.restore()
}

/** Vẽ một khung hình hoàn chỉnh. Dùng chung cho xem trước và xuất video. */
export function drawScene(
  ctx: Ctx,
  scene: FrameScene,
  frames: {
    screen: FrameSource | null
    camera: FrameSource | null
    /** Ảnh / khung GIF / khung video của lớp nổi (null nếu chưa tải xong). */
    overlayMedia?: OverlayMediaFn
    /** Mặt nạ người (AI) của khung webcam hiện tại, khi webcam đang bỏ / đổi phông. */
    cameraMask?: AnyCanvas | null
    /** Mặt nạ người (AI) cho ảnh / video meme bật "xóa phông AI". */
    overlayMask?: OverlayMaskFn
  },
) {
  drawBackground(ctx, scene)
  const { content, radius } = scene

  if (scene.shadow > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${0.55 * scene.shadow})`
    ctx.shadowBlur = Math.min(scene.width, scene.height) * 0.04 * scene.shadow
    ctx.shadowOffsetY = Math.min(scene.width, scene.height) * 0.012 * scene.shadow
    roundedRect(ctx, content.x, content.y, content.width, content.height, radius)
    ctx.fillStyle = '#000000'
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  roundedRect(ctx, content.x, content.y, content.width, content.height, radius)
  ctx.clip()
  // Clip có độ mờ: không tô đen phía sau để thấy nền.
  const opacity = scene.opacity ?? 1
  ctx.fillStyle = '#000000'
  if (opacity >= 1) ctx.fillRect(content.x, content.y, content.width, content.height)
  const screen = frames.screen
  const look = scene.look
  if (screen) {
    const v = scene.source
    // Độ mờ < 1: vẽ lên một lớp riêng rồi ghép mờ (để bộ lọc và lớp màu cũng mờ theo).
    const layer = opacity < 1 ? beginLayer(ctx, scene.width, scene.height) : null
    const target = layer?.ctx ?? ctx
    target.save()
    if (look) target.filter = look.css
    if (!scene.orient) {
      screen.draw(
        target,
        v.x * screen.width,
        v.y * screen.height,
        v.width * screen.width,
        v.height * screen.height,
        content.x,
        content.y,
        content.width,
        content.height,
      )
    } else {
      // Lật / xoay quanh tâm khung: vẽ vùng gốc theo hướng gốc rồi để phép biến đổi xoay vào chỗ.
      const { flipH, flipV, rotate } = scene.orient
      const swap = rotate % 180 !== 0
      const dw = swap ? content.height : content.width
      const dh = swap ? content.width : content.height
      target.translate(content.x + content.width / 2, content.y + content.height / 2)
      target.rotate((rotate * Math.PI) / 180)
      target.scale(flipH ? -1 : 1, flipV ? -1 : 1)
      screen.draw(
        target,
        v.x * screen.width,
        v.y * screen.height,
        v.width * screen.width,
        v.height * screen.height,
        -dw / 2,
        -dh / 2,
        dw,
        dh,
      )
    }
    target.restore()
    if (look) applyLookLayers(target, look, content, Math.floor(scene.time / 40))
    if (layer) {
      ctx.save()
      ctx.globalAlpha = opacity
      ctx.drawImage(layer.canvas, 0, 0)
      ctx.restore()
    }
  }
  if (scene.ripple) {
    const r = scene.ripple
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${0.35 * r.opacity})`
    ctx.fill()
    ctx.lineWidth = Math.max(1, r.radius * 0.12)
    ctx.strokeStyle = `rgba(37,99,235,${0.9 * r.opacity})`
    ctx.stroke()
  }
  if (scene.cursor)
    drawCursor(ctx, scene.cursor.x, scene.cursor.y, scene.cursor.size, scene.cursor.opacity)
  ctx.restore()

  const cam = scene.camera
  const camFrame = frames.camera
  if (cam && camFrame) {
    const { x, y, width, height } = cam.rect
    // Phông nền bằng AI: chỉ khi đã có mặt nạ người của khung này.
    const bg = cam.background?.mode && cam.background.mode !== 'none' ? cam.background : null
    const mask = bg ? (frames.cameraMask ?? null) : null
    ctx.save()
    const r = cam.shape === 'circle' ? width / 2 : cam.shape === 'rounded' ? width * 0.18 : 0
    const cutout = mask && bg?.mode === 'remove'
    if (cam.shape !== 'strip' && !cutout) {
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = width * 0.08
    }
    roundedRect(ctx, x, y, width, height, r)
    ctx.fillStyle = mask && bg?.mode === 'color' ? bg.color : '#000000'
    // Xóa phông: không tô nền, để thấy video màn hình phía sau người.
    if (!cutout) ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.clip()
    // Cắt khung webcam cho vừa ô hiển thị (cover), phóng to / dời tâm tới mặt nếu có chỉnh.
    const crop = cameraCrop(
      { width: camFrame.width, height: camFrame.height },
      cam.rect,
      cam.framing,
    )
    const paint = (target: Ctx, dx: number, dy: number) =>
      drawBeautified(
        target,
        cam.beauty,
        width,
        () => camFrame.draw(target, crop.x, crop.y, crop.width, crop.height, dx, dy, width, height),
        look?.css,
      )
    if (!mask || !bg) paint(ctx, x, y)
    else {
      if (bg.mode === 'blur') {
        // Phông mờ: vẽ cả khung webcam thật mờ phía sau người.
        ctx.save()
        ctx.filter = `blur(${(bg.blur * width * 0.06).toFixed(2)}px)`
        camFrame.draw(ctx, crop.x, crop.y, crop.width, crop.height, x, y, width, height)
        ctx.restore()
      }
      const person = personLayer(ctx, width, height)
      paint(person.ctx, 0, 0)
      // Chỉ giữ phần là người (mặt nạ cùng khung cắt, viền mềm theo độ mềm).
      const kx = mask.width / camFrame.width
      const ky = mask.height / camFrame.height
      person.ctx.save()
      person.ctx.globalCompositeOperation = 'destination-in'
      person.ctx.filter = bg.edge > 0 ? `blur(${(bg.edge * width * 0.02).toFixed(2)}px)` : 'none'
      person.ctx.drawImage(
        mask,
        crop.x * kx,
        crop.y * ky,
        crop.width * kx,
        crop.height * ky,
        0,
        0,
        width,
        height,
      )
      person.ctx.restore()
      ctx.drawImage(person.canvas, x, y)
    }
    if (look) applyLookLayers(ctx, look, cam.rect, Math.floor(scene.time / 40) + 7)
    ctx.restore()
    if (cam.border > 0) {
      ctx.save()
      const b = cam.border
      roundedRect(ctx, x + b / 2, y + b / 2, width - b, height - b, Math.max(0, r - b / 2))
      ctx.lineWidth = b
      ctx.strokeStyle = cam.borderColor
      ctx.stroke()
      ctx.restore()
    }
  }
  drawKeyCaption(ctx, scene)
  applyTransition(ctx, scene)
  applyEffects(ctx, scene)
  drawOverlays(
    ctx,
    scene.overlays,
    scene.width,
    scene.height,
    frames.overlayMedia ?? (() => null),
    frames.overlayMask,
  )
  drawCaptions(ctx, scene)
}

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

const layers = new WeakMap<object, AnyCanvas>()
const persons = new WeakMap<object, AnyCanvas>()

/** Lớp tạm để cắt người theo mặt nạ AI (cỡ bằng ô webcam). */
function personLayer(ctx: Ctx, width: number, height: number): { canvas: AnyCanvas; ctx: Ctx } {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  let canvas = persons.get(ctx.canvas)
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h })
    persons.set(ctx.canvas, canvas)
  }
  const c = canvas.getContext('2d') as Ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  c.filter = 'none'
  c.clearRect(0, 0, w, h)
  return { canvas, ctx: c }
}

/** Lớp vẽ tạm (trong suốt, cùng cỡ khung) riêng cho từng canvas đích. */
function beginLayer(ctx: Ctx, width: number, height: number): { canvas: AnyCanvas; ctx: Ctx } {
  let canvas = layers.get(ctx.canvas)
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height })
    layers.set(ctx.canvas, canvas)
  }
  const c = canvas.getContext('2d') as Ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  c.filter = 'none'
  c.clearRect(0, 0, width, height)
  return { canvas, ctx: c }
}
/**
 * Mỗi canvas đích có bản nháp riêng: canvas xem trước bị trình duyệt đánh dấu "tainted" (video
 * khác nguồn), dùng chung bản nháp sẽ làm canvas xuất video cũng bị khóa và không mã hóa được.
 */
const scratches = new WeakMap<object, AnyCanvas>()

/** Bản sao khung hình hiện tại để vẽ lại có biến đổi (zoom, mờ, lướt, glitch). */
export function snapshot(ctx: Ctx, width: number, height: number): AnyCanvas {
  let scratch = scratches.get(ctx.canvas)
  if (!scratch || scratch.width !== width || scratch.height !== height) {
    scratch =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height })
    scratches.set(ctx.canvas, scratch)
  }
  const c = scratch.getContext('2d') as Ctx
  c.clearRect(0, 0, width, height)
  c.drawImage(ctx.canvas, 0, 0)
  return scratch
}

/** Số ngẫu nhiên cố định theo hạt giống (xem trước và xuất ra giống hệt nhau). */
export function seeded(seed: number) {
  let x = Math.floor(seed * 9301 + 49297) % 233280
  return () => {
    x = (x * 9301 + 49297) % 233280
    return x / 233280
  }
}

/** Glitch: lệch các dải ngang và tách màu đỏ/xanh (dùng cho chuyển tiếp và hiệu ứng). */
export function drawGlitch(
  ctx: Ctx,
  copy: AnyCanvas,
  w: number,
  h: number,
  s: number,
  seed: number,
) {
  const rand = seeded(seed)
  ctx.save()
  for (let i = 0; i < 7; i++) {
    const y = rand() * h
    const sh = h * (0.02 + rand() * 0.08)
    const dx = (rand() - 0.5) * w * 0.2 * s
    ctx.drawImage(copy, 0, y, w, sh, dx, y, w, sh)
  }
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.45 * s
  ctx.filter = 'sepia(1) saturate(6) hue-rotate(-50deg)'
  ctx.drawImage(copy, (w / 90) * s, 0)
  ctx.filter = 'sepia(1) saturate(6) hue-rotate(150deg)'
  ctx.drawImage(copy, (-w / 90) * s, 0)
  ctx.restore()
}

/** Hiệu ứng chuyển tiếp ở chỗ nối giữa hai clip (vẽ đè lên khung hình đã ghép xong). */
export function applyTransition(ctx: Ctx, scene: FrameScene) {
  const tr = scene.transition
  if (!tr || tr.strength <= 0) return
  const { width: w, height: h } = scene
  const s = tr.strength
  ctx.save()
  switch (tr.kind) {
    case 'fadeBlack':
    case 'fadeWhite':
      ctx.fillStyle = tr.kind === 'fadeBlack' ? `rgba(0,0,0,${s})` : `rgba(255,255,255,${s})`
      ctx.fillRect(0, 0, w, h)
      break
    case 'flash':
      ctx.fillStyle = `rgba(255,255,255,${0.95 * s ** 3})`
      ctx.fillRect(0, 0, w, h)
      break
    case 'zoom': {
      const copy = snapshot(ctx, w, h)
      const scale = 1 + 0.6 * s
      ctx.filter = `blur(${(s * w) / 400}px)`
      ctx.translate(w / 2, h / 2)
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'blur': {
      const copy = snapshot(ctx, w, h)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.filter = `blur(${(s * w) / 50}px)`
      ctx.drawImage(copy, 0, 0)
      break
    }
    case 'slide': {
      const copy = snapshot(ctx, w, h)
      // Trước chỗ nối: khung trôi sang trái; sau chỗ nối: khung mới trượt vào từ bên phải.
      const offset = (tr.after ? 1 : -1) * w * 0.45 * s
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.filter = `blur(${(s * w) / 120}px)`
      ctx.drawImage(copy, offset, 0)
      break
    }
    case 'glitch':
      drawGlitch(ctx, snapshot(ctx, w, h), w, h, s, Math.floor(tr.progress * 24) + 1)
      break
    case 'lightLeak': {
      const cx = w * (tr.after ? 0.2 : 0.8)
      const g = ctx.createRadialGradient(cx, h * 0.2, 0, cx, h * 0.2, Math.max(w, h))
      g.addColorStop(0, `rgba(255,190,80,${0.95 * s})`)
      g.addColorStop(0.5, `rgba(255,90,120,${0.5 * s})`)
      g.addColorStop(1, 'rgba(255,90,120,0)')
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'zoomOut': {
      const copy = snapshot(ctx, w, h)
      const scale = 1 - 0.4 * s
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.filter = `blur(${(s * w) / 600}px)`
      ctx.translate(w / 2, h / 2)
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'whip': {
      // Lia máy nhanh: khung bay ngang và nhòe mạnh theo chiều ngang (vẽ nhiều bản lệch).
      const copy = snapshot(ctx, w, h)
      const dir = tr.after ? 1 : -1
      const offset = dir * w * 0.8 * s
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.filter = `blur(${(s * w) / 300}px)`
      const steps = 6
      for (let k = 0; k < steps; k++) {
        ctx.globalAlpha = 1 / steps + (k === 0 ? 0.3 : 0)
        ctx.drawImage(copy, offset - dir * (k / steps) * w * 0.3 * s, 0)
      }
      break
    }
    case 'spin': {
      const copy = snapshot(ctx, w, h)
      const dir = tr.after ? 1 : -1
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.filter = `blur(${(s * w) / 400}px)`
      ctx.translate(w / 2, h / 2)
      ctx.rotate(dir * s * 0.6)
      const scale = 1 + 0.4 * s
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'slideRight':
    case 'slideUp':
    case 'slideDown': {
      const copy = snapshot(ctx, w, h)
      // Trước chỗ nối khung cũ trôi ra theo hướng; sau chỗ nối khung mới trượt vào từ phía ngược lại.
      const sign = tr.after ? -1 : 1
      const dx = tr.kind === 'slideRight' ? sign * w * 0.45 * s : 0
      const dy =
        tr.kind === 'slideUp'
          ? -sign * h * 0.45 * s
          : tr.kind === 'slideDown'
            ? sign * h * 0.45 * s
            : 0
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.filter = `blur(${(s * w) / 120}px)`
      ctx.drawImage(copy, dx, dy)
      break
    }
    case 'shake': {
      const copy = snapshot(ctx, w, h)
      const rand = seeded(Math.floor(tr.progress * 30) + 5)
      const dx = (rand() - 0.5) * w * 0.08 * s
      const dy = (rand() - 0.5) * h * 0.08 * s
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.translate(w / 2 + dx, h / 2 + dy)
      const scale = 1 + 0.1 * s
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'wipe': {
      // Rèm đen kéo từ trái sang phủ hết ở chỗ nối, rồi tiếp tục sang phải lộ khung mới.
      ctx.fillStyle = '#000'
      if (tr.after) ctx.fillRect(w * (1 - s), 0, w * s, h)
      else ctx.fillRect(0, 0, w * s, h)
      break
    }
    case 'iris': {
      // Vòng tròn đóng lại tới chỗ nối rồi mở ra.
      const r = Math.hypot(w, h) * 0.5 * (1 - s)
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      break
    }
    case 'blinds': {
      // 8 dải ngang đóng dần (trước) / mở dần (sau).
      const n = 8
      const slot = h / n
      ctx.fillStyle = '#000'
      for (let k = 0; k < n; k++) {
        const bar = slot * s
        ctx.fillRect(0, k * slot + (tr.after ? slot - bar : 0), w, bar)
      }
      break
    }
    case 'squeeze': {
      const copy = snapshot(ctx, w, h)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const sy = Math.max(0.02, 1 - s)
      ctx.translate(w / 2, h / 2)
      ctx.scale(1 + 0.15 * s, sy)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'flip': {
      // Lật thẻ ngang: co theo chiều ngang về một đường rồi nở ra; tối dần ở giữa.
      const copy = snapshot(ctx, w, h)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const sx = Math.max(0.02, Math.cos((s * Math.PI) / 2))
      ctx.translate(w / 2, h / 2)
      ctx.scale(sx, 1 + 0.08 * s)
      ctx.filter = `brightness(${1 - 0.5 * s})`
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'pixelate': {
      const copy = snapshot(ctx, w, h)
      const block = Math.max(1, Math.round((w / 24) * s))
      if (block <= 1) break
      const sw = Math.max(1, Math.round(w / block))
      const sh = Math.max(1, Math.round(h / block))
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(copy, 0, 0, w, h, 0, 0, sw, sh)
      ctx.drawImage(ctx.canvas, 0, 0, sw, sh, 0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      break
    }
  }
  ctx.restore()
}
