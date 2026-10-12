import {
  fontFamily,
  overlayTextStyle,
  typewriterChars,
  wordMotion,
  type Overlay,
  type TextStyleProps,
} from '@lumora/core'
import { seeded, type Ctx } from './draw'

interface Word {
  text: string
  /** Vị trí trái của từ so với đầu dòng (px). */
  x: number
  width: number
}
interface Line {
  text: string
  width: number
  words: Word[]
}
export interface TextLayout {
  style: TextStyleProps
  font: string
  lines: Line[]
  /** Kích thước khung (đã gồm lề nền / viền). */
  width: number
  height: number
  lineH: number
  maxLine: number
  letterSpacing: number
}

const hasLetterSpacing = (ctx: Ctx) => 'letterSpacing' in ctx

function applyFont(ctx: Ctx, layout: Pick<TextLayout, 'font' | 'letterSpacing'>) {
  ctx.font = layout.font
  if (hasLetterSpacing(ctx))
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${layout.letterSpacing}px`
}

/** Dàn chữ: chia dòng, đo độ rộng từng dòng / từng từ, tính khung của lớp chữ. */
export function layoutText(ctx: Ctx, o: Overlay, px: number): TextLayout {
  const style = overlayTextStyle(o)
  const font = `${style.italic ? 'italic ' : ''}${style.weight} ${px}px ${fontFamily(style.font)}`
  const letterSpacing = style.letterSpacing * px
  const raw = style.uppercase ? o.text.toUpperCase() : o.text
  ctx.save()
  applyFont(ctx, { font, letterSpacing })
  const lines: Line[] = raw.split('\n').map((text) => {
    const words: Word[] = []
    let offset = 0
    for (const part of text.split(/(\s+)/)) {
      if (part && !/^\s+$/.test(part))
        words.push({
          text: part,
          x: ctx.measureText(text.slice(0, offset)).width,
          width: ctx.measureText(part).width,
        })
      offset += part.length
    }
    return { text, width: ctx.measureText(text || ' ').width, words }
  })
  ctx.restore()
  const lineH = px * style.lineHeight
  const maxLine = Math.max(...lines.map((l) => l.width), px * 0.3)
  const pad = style.background.opacity > 0 ? style.background.padding * px : px * 0.15
  const stroke = style.stroke.width * px
  return {
    style,
    font,
    lines,
    width: maxLine + pad * 2 + stroke * 2,
    height: lines.length * lineH + pad * 2 + stroke,
    lineH,
    maxLine,
    letterSpacing,
  }
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
}

/** Một mẩu chữ (dòng hoặc từ) với bóng, viền, màu / chuyển màu. */
function paintText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  px: number,
  style: TextStyleProps,
  fill: string | CanvasGradient,
) {
  const shadow = style.shadow.blur > 0 || style.shadow.dx !== 0 || style.shadow.dy !== 0
  const setShadow = (on: boolean) => {
    ctx.shadowColor = on ? style.shadow.color : 'transparent'
    ctx.shadowBlur = on ? style.shadow.blur * px : 0
    ctx.shadowOffsetX = on ? style.shadow.dx * px : 0
    ctx.shadowOffsetY = on ? style.shadow.dy * px : 0
  }
  if (style.stroke.width > 0) {
    // Viền vẽ trước (nét nằm giữa đường viền chữ: dày gấp đôi), chữ tô đè lên phần bên trong.
    setShadow(shadow)
    ctx.lineJoin = 'round'
    ctx.lineWidth = style.stroke.width * px * 2
    ctx.strokeStyle = style.stroke.color
    ctx.strokeText(text, x, y)
    setShadow(false)
  } else setShadow(shadow)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  setShadow(false)
}

/**
 * Vẽ lớp chữ đã dàn (gốc toạ độ ở tâm lớp): nền, rồi từng dòng / từng từ theo hiệu ứng chữ.
 * `reveal` (0..1) là phần chữ hiện do hoạt ảnh vào "đánh chữ".
 */
export function drawTextLayer(
  ctx: Ctx,
  o: Overlay,
  px: number,
  layout: TextLayout,
  local: number,
  reveal = 1,
) {
  const { style, lines, lineH, maxLine } = layout
  const w = layout.width
  const h = layout.height
  if (style.background.opacity > 0) {
    ctx.save()
    ctx.globalAlpha *= style.background.opacity
    ctx.fillStyle = style.background.color
    roundedRect(ctx, -w / 2, -h / 2, w, h, (style.background.radius * h) / 2)
    ctx.fill()
    ctx.restore()
  }
  applyFont(ctx, layout)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  let fill: string | CanvasGradient = style.color
  if (style.gradient) {
    const a = (style.gradient.angle * Math.PI) / 180
    const dx = (Math.sin(a) * w) / 2
    const dy = (-Math.cos(a) * h) / 2
    const g = ctx.createLinearGradient(-dx, -dy, dx, dy)
    g.addColorStop(0, style.gradient.from)
    g.addColorStop(1, style.gradient.to)
    fill = g
  }
  // Máy đánh chữ: số ký tự hiện theo thời gian (hiệu ứng chữ) và theo hoạt ảnh vào.
  const total = lines.reduce((n, l) => n + [...l.text].length, 0)
  let chars = total
  if (style.anim === 'typewriter') chars = typewriterChars(total, local, o.end - o.start)
  if (reveal < 1) chars = Math.min(chars, Math.floor(total * reveal))
  const top = -((lines.length - 1) * lineH) / 2
  const lineX = (line: Line) =>
    style.align === 'left'
      ? -maxLine / 2
      : style.align === 'right'
        ? maxLine / 2 - line.width
        : -line.width / 2
  const glitch = style.anim === 'glitch'
  const rand = glitch ? seeded(Math.floor(local / 90) + 1) : null
  let left = chars
  let wordIndex = 0
  lines.forEach((line, i) => {
    const y = top + i * lineH
    const x0 = lineX(line)
    const perWord = style.anim === 'wordPop' || style.anim === 'slideWords' || style.anim === 'wave'
    if (!perWord) {
      const shown = [...line.text].slice(0, Math.max(0, left)).join('')
      left -= [...line.text].length
      if (!shown) return
      if (glitch && rand) {
        // Tách màu đỏ / xanh lệch nhau, nhảy theo nhịp.
        const jitter = (rand() - 0.5) * px * 0.12
        ctx.save()
        ctx.globalAlpha *= 0.7
        ctx.fillStyle = '#ff0040'
        ctx.fillText(shown, x0 + jitter - px * 0.04, y)
        ctx.fillStyle = '#00e5ff'
        ctx.fillText(shown, x0 - jitter + px * 0.04, y)
        ctx.restore()
      }
      paintText(ctx, shown, x0, y, px, style, fill)
      return
    }
    for (const word of line.words) {
      const m = wordMotion(style.anim, wordIndex++, local)
      if (m.opacity <= 0 || m.scale <= 0) continue
      ctx.save()
      ctx.globalAlpha *= m.opacity
      const cx = x0 + word.x + word.width / 2
      ctx.translate(cx + m.dx * px, y + m.dy * px)
      ctx.scale(m.scale, m.scale)
      paintText(ctx, word.text, -word.width / 2, 0, px, style, fill)
      ctx.restore()
    }
  })
}
