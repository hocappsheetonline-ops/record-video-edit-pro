import { fontFamily, wordBounce, type FontId } from '@lumora/core'
import type { Ctx } from './draw'
import type { CaptionWord, SceneCaptions } from './scene'

/** Phông chỉ có một độ đậm (vẽ đậm hơn sẽ bị giả đậm, xấu). */
const SINGLE_WEIGHT: readonly FontId[] = ['anton', 'bangers', 'lobster', 'pacifico']

/** Phông màu cho emoji (Windows / macOS / Linux). */
export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
/** Mẫu máy chữ: mỗi ký tự hiện sau chừng này ms kể từ khi dòng bắt đầu. */
export const TYPEWRITER_MS_PER_CHAR = 45
/** Mẫu trượt lên: thời gian dòng trượt vào (ms). */
const SLIDE_MS = 220

/**
 * Mẫu máy chữ: số ký tự (kể cả khoảng trắng) đã "gõ" ra của dòng sau `lineSince` ms.
 * Chỉ các từ đã nói mới được gõ, nên chữ không bao giờ chạy trước lời.
 */
export function typewriterChars(lineSince: number): number {
  return Math.max(0, Math.floor(lineSince / TYPEWRITER_MS_PER_CHAR))
}

/** Mẫu lượn sóng: độ lệch dọc (tỷ lệ cỡ chữ) của từ thứ `index` tại thời điểm `lineSince`. */
export function waveOffset(lineSince: number, index: number): number {
  return Math.sin((lineSince / 1000) * Math.PI * 2 * 1.2 + index * 0.8) * 0.12
}

/** Mẫu trượt lên: độ hiện (0-1) của dòng sau `lineSince` ms. */
export function slideProgress(lineSince: number): number {
  return Math.min(1, Math.max(0, lineSince) / SLIDE_MS)
}

interface Placed {
  word: CaptionWord
  x: number
  width: number
}

function wrap(ctx: Ctx, words: readonly CaptionWord[], maxWidth: number, space: number) {
  const lines: Placed[][] = []
  let line: Placed[] = []
  let x = 0
  for (const word of words) {
    const width = ctx.measureText(word.text).width
    if (line.length > 0 && x + width > maxWidth) {
      lines.push(line)
      line = []
      x = 0
    }
    line.push({ word, x, width })
    x += width + space
  }
  if (line.length > 0) lines.push(line)
  return lines
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const out: string[] = []
  let line = ''
  for (const part of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${part}` : part
    if (line && ctx.measureText(next).width > maxWidth) {
      out.push(line)
      line = part
    } else line = next
  }
  if (line) out.push(line)
  return out
}

const lineWidth = (line: readonly Placed[]) =>
  line.length === 0 ? 0 : line[line.length - 1]!.x + line[line.length - 1]!.width

/**
 * Vẽ phụ đề theo mẫu (dùng chung cho xem trước và xuất). Khối phụ đề đặt giữa theo chiều
 * ngang, tâm theo `look.y`, luôn nằm trọn trong khung.
 */
export function drawCaptionBlock(ctx: Ctx, cap: SceneCaptions, width: number, height: number) {
  if (cap.words.length === 0) return
  const { look } = cap
  const px = cap.fontSize
  const t = look.template
  const weight = SINGLE_WEIGHT.includes(look.font)
    ? 400
    : t === 'tiktok' || t === 'shadowPop'
      ? 900
      : 800
  const family = fontFamily(look.font)
  ctx.save()
  ctx.font = `${weight} ${px}px ${family}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  const maxWidth = width * 0.82
  const space = ctx.measureText(' ').width
  const lines = wrap(ctx, cap.words, maxWidth, space)
  const lineH = px * 1.3
  const subPx = Math.round(px * 0.72)
  ctx.font = `600 ${subPx}px ${family}`
  const sub = cap.translation ? wrapText(ctx, cap.translation, maxWidth) : []
  const subH = subPx * 1.3
  ctx.font = `${weight} ${px}px ${family}`

  const padX = px * 0.6
  const padY = px * 0.35
  const textH = lines.length * lineH + (sub.length > 0 ? sub.length * subH + px * 0.15 : 0)
  const boxH = textH + padY * 2
  const margin = height * 0.04
  const top = Math.min(height - margin - boxH, Math.max(margin, look.y * height - boxH / 2))
  const emojiW = cap.emoji ? px * 1.15 : 0
  const widths = lines.map((line, i) => lineWidth(line) + (i === lines.length - 1 ? emojiW : 0))
  ctx.font = `600 ${subPx}px ${family}`
  const subWidths = sub.map((l) => ctx.measureText(l).width)
  ctx.font = `${weight} ${px}px ${family}`
  const boxW = Math.max(...widths, ...subWidths) + padX * 2

  if (t === 'box') {
    ctx.beginPath()
    ctx.roundRect((width - boxW) / 2, top, boxW, boxH, px * 0.35)
    ctx.fillStyle = 'rgba(0,0,0,0.68)'
    ctx.fill()
  }

  const stroke =
    t === 'outline'
      ? 0.22
      : t === 'comic'
        ? 0.2
        : t === 'karaoke' || t === 'popWord'
          ? 0.16
          : t === 'box' || t === 'neon' || t === 'underline' || t === 'shadowPop'
            ? 0
            : 0.13
  const slide = t === 'slideUp' ? slideProgress(cap.lineSince) : 1
  const typed = t === 'typewriter' ? typewriterChars(cap.lineSince) : Infinity
  const paint = (
    text: string,
    x: number,
    y: number,
    fill: string | CanvasGradient,
    glow = false,
  ) => {
    if (glow) {
      ctx.shadowColor = look.highlightColor
      ctx.shadowBlur = px * 0.55
    } else if (t === 'shadowPop') {
      // Bóng cứng lệch xuống phải kiểu poster.
      ctx.shadowColor = '#000000'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = px * 0.08
      ctx.shadowOffsetY = px * 0.08
    } else if (t === 'underline') {
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = px * 0.18
      ctx.shadowOffsetY = px * 0.05
    }
    if (stroke > 0) {
      ctx.lineWidth = px * stroke
      ctx.strokeStyle = '#000000'
      ctx.strokeText(text, x, y)
    }
    ctx.fillStyle = fill
    ctx.fillText(text, x, y)
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  /** Màu tô một từ: đang nói > từ khóa > karaoke đã nói > màu thường. */
  const fillFor = (word: CaptionWord): string => {
    if (t === 'karaoke')
      return word.spoken && cap.style === 'highlight'
        ? look.highlightColor
        : word.keyword
          ? look.keywordColor
          : look.color
    if (word.active) return t === 'tiktok' ? look.color : look.highlightColor
    return word.keyword ? look.keywordColor : look.color
  }

  let charCursor = 0
  lines.forEach((line, i) => {
    const x0 = (width - widths[i]!) / 2
    const baseY = top + padY + lineH * (i + 0.5)
    line.forEach(({ word, x, width: w }, j) => {
      const left = x0 + x
      let text = word.text
      if (t === 'popWord' && !word.spoken) return
      if (t === 'typewriter') {
        // Gõ dần từng ký tự; từ chưa nói chưa gõ.
        const from = charCursor
        charCursor += [...word.text].length + 1
        if (!word.spoken || typed <= from) return
        text = [...word.text].slice(0, typed - from).join('')
      }
      const y =
        baseY +
        (t === 'wave' ? waveOffset(cap.lineSince, j) * px : 0) +
        (t === 'slideUp' ? (1 - slide) * px * 0.5 : 0)
      if (t === 'slideUp') ctx.globalAlpha = slide * (word.spoken ? 1 : 0.3)
      let fill: string | CanvasGradient = fillFor(word)
      if (t === 'gradient' && !word.active) {
        const g = ctx.createLinearGradient(left, 0, left + w, 0)
        g.addColorStop(0, word.keyword ? look.keywordColor : look.color)
        g.addColorStop(1, look.highlightColor)
        fill = g
      }
      const scale =
        (t === 'bounceWord' || t === 'popWord' || t === 'shadowPop' || t === 'comic') && word.active
          ? wordBounce(word.since)
          : 1
      if (t === 'tiktok' && word.active) {
        const pad = px * 0.14
        ctx.beginPath()
        ctx.roundRect(left - pad, y - px * 0.62, w + pad * 2, px * 1.24, px * 0.18)
        ctx.fillStyle = look.highlightColor
        ctx.fill()
      }
      if (t === 'underline' && word.active) {
        ctx.fillStyle = look.highlightColor
        ctx.fillRect(left, y + px * 0.5, w, Math.max(2, px * 0.12))
      }
      if (scale !== 1) {
        ctx.save()
        ctx.translate(left + w / 2, y)
        ctx.scale(scale, scale)
        paint(text, -w / 2, 0, fill)
        ctx.restore()
      } else paint(text, left, y, fill, t === 'neon')
      ctx.globalAlpha = 1
    })
  })

  // Emoji AI: cuối dòng cuối, nảy nhẹ khi dòng vừa hiện.
  if (cap.emoji && emojiW > 0) {
    const last = lines.length - 1
    const x0 = (width - widths[last]!) / 2
    const y = top + padY + lineH * (last + 0.5)
    const left = x0 + lineWidth(lines[last]!) + space * 0.5
    const scale = wordBounce(cap.lineSince)
    ctx.save()
    ctx.font = `${px}px ${EMOJI_FONT}`
    ctx.translate(left + emojiW / 2, y)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(cap.emoji, -emojiW / 2 + space * 0.25, 0)
    ctx.restore()
    ctx.font = `${weight} ${px}px ${family}`
  }

  if (sub.length > 0) {
    ctx.font = `600 ${subPx}px ${family}`
    const subTop = top + padY + lines.length * lineH + px * 0.15
    sub.forEach((text, i) => {
      const y = subTop + subH * (i + 0.5)
      const x = (width - subWidths[i]!) / 2
      if (t !== 'box') {
        ctx.lineWidth = subPx * 0.16
        ctx.strokeStyle = '#000000'
        ctx.strokeText(text, x, y)
      }
      ctx.fillStyle = t === 'box' ? '#e5e7eb' : look.color
      ctx.fillText(text, x, y)
    })
  }
  ctx.restore()
}
