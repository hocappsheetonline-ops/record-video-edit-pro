import { beautyLayers, coverSource, type BeautyStyle } from '@lumora/core'
import type { FrameScene } from './scene'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

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
export function drawBeautified(ctx: Ctx, beauty: BeautyStyle, width: number, paint: () => void) {
  const layers = beautyLayers(beauty, width)
  const before = { filter: ctx.filter, alpha: ctx.globalAlpha }
  ctx.filter = layers.base
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

/** Chia các từ thành dòng vừa chiều rộng tối đa. */
function wrapWords(ctx: Ctx, words: { text: string; active: boolean }[], maxWidth: number) {
  const lines: { text: string; active: boolean }[][] = []
  let current: { text: string; active: boolean }[] = []
  for (const word of words) {
    const candidate = [...current, word].map((w) => w.text).join(' ')
    if (current.length > 0 && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = [word]
    } else current.push(word)
  }
  if (current.length > 0) lines.push(current)
  return lines
}

function drawCaptions(ctx: Ctx, scene: FrameScene) {
  const cap = scene.captions
  if (!cap || cap.words.length === 0) return
  ctx.save()
  ctx.font = `700 ${cap.fontSize}px "Segoe UI", "Inter", system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  const maxWidth = scene.width * 0.82
  const lines = wrapWords(ctx, cap.words, maxWidth)
  const lineHeight = cap.fontSize * 1.3
  const padX = cap.fontSize * 0.6
  const padY = cap.fontSize * 0.35
  const space = ctx.measureText(' ').width
  const widths = lines.map((line) => ctx.measureText(line.map((w) => w.text).join(' ')).width)
  const boxW = Math.max(...widths) + padX * 2
  const boxH = lines.length * lineHeight + padY * 2
  const margin = scene.height * 0.06
  const boxX = (scene.width - boxW) / 2
  const boxY = cap.position === 'top' ? margin : scene.height - margin - boxH
  roundedRect(ctx, boxX, boxY, boxW, boxH, cap.fontSize * 0.35)
  ctx.fillStyle = 'rgba(0,0,0,0.68)'
  ctx.fill()
  lines.forEach((line, i) => {
    let x = (scene.width - widths[i]!) / 2
    const y = boxY + padY + lineHeight * (i + 0.5)
    for (const word of line) {
      ctx.fillStyle = word.active ? '#facc15' : '#ffffff'
      ctx.fillText(word.text, x, y)
      x += ctx.measureText(word.text).width + space
    }
  })
  ctx.restore()
}

/** Vẽ một khung hình hoàn chỉnh. Dùng chung cho xem trước và xuất video. */
export function drawScene(
  ctx: Ctx,
  scene: FrameScene,
  frames: { screen: FrameSource | null; camera: FrameSource | null },
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
  ctx.fillStyle = '#000000'
  ctx.fillRect(content.x, content.y, content.width, content.height)
  const screen = frames.screen
  if (screen) {
    const v = scene.view
    screen.draw(
      ctx,
      v.x * screen.width,
      v.y * screen.height,
      v.width * screen.width,
      v.height * screen.height,
      content.x,
      content.y,
      content.width,
      content.height,
    )
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
    ctx.save()
    const r = cam.shape === 'circle' ? width / 2 : cam.shape === 'rounded' ? width * 0.18 : 0
    if (cam.shape !== 'strip') {
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = width * 0.08
    }
    roundedRect(ctx, x, y, width, height, r)
    ctx.fillStyle = '#000000'
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.clip()
    // Cắt giữa khung webcam cho vừa ô hiển thị (cover).
    const crop = coverSource({ width: camFrame.width, height: camFrame.height }, cam.rect)
    drawBeautified(ctx, cam.beauty, width, () =>
      camFrame.draw(ctx, crop.x, crop.y, crop.width, crop.height, x, y, width, height),
    )
    ctx.restore()
  }
  drawCaptions(ctx, scene)
}
