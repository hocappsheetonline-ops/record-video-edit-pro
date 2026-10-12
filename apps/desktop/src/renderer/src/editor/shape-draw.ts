import type { ShapeKind } from '@lumora/core'
import type { Ctx } from './draw'

/**
 * Vẽ hình nhãn dán (gốc toạ độ ở tâm, khung w×h). `line` là độ dày nét (px). Màu chính là `color`;
 * con trỏ, bong bóng thoại có viền / nền trắng cho nổi trên mọi nền.
 */
export function drawShape(
  ctx: Ctx,
  shape: ShapeKind,
  color: string,
  w: number,
  h: number,
  line: number,
) {
  const hw = w / 2
  const hh = h / 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = line
  ctx.strokeStyle = color
  ctx.fillStyle = color
  switch (shape) {
    case 'arrow': {
      const head = Math.min(h * 0.9, w * 0.35)
      ctx.beginPath()
      ctx.moveTo(-hw + line, 0)
      ctx.lineTo(hw - line * 1.5, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(hw - line, 0)
      ctx.lineTo(hw - head, -head / 2)
      ctx.lineTo(hw - head, head / 2)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'circle':
      ctx.beginPath()
      ctx.ellipse(0, 0, hw - line, hh - line, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'underline':
      ctx.beginPath()
      ctx.moveTo(-hw + line, hh * 0.2)
      ctx.quadraticCurveTo(0, -hh * 0.4, hw - line, hh * 0.1)
      ctx.stroke()
      break
    case 'box':
      ctx.beginPath()
      ctx.roundRect(-hw + line / 2, -hh + line / 2, w - line, h - line, Math.min(w, h) * 0.12)
      ctx.stroke()
      break
    case 'cursor': {
      // Mũi tên con trỏ chuột, tô màu, viền trắng.
      const s = Math.min(w / 15.4, h / 23.6)
      ctx.save()
      ctx.translate(-7.7 * s, -11.8 * s)
      ctx.scale(s, s)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, 21)
      ctx.lineTo(5.2, 16.2)
      ctx.lineTo(8.6, 23.6)
      ctx.lineTo(12, 22.1)
      ctx.lineTo(8.7, 14.9)
      ctx.lineTo(15.4, 14.9)
      ctx.closePath()
      ctx.fill()
      ctx.lineWidth = 1.6
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'check':
      ctx.beginPath()
      ctx.moveTo(-hw + line, 0)
      ctx.lineTo(-hw * 0.25, hh - line)
      ctx.lineTo(hw - line, -hh + line)
      ctx.stroke()
      break
    case 'cross':
      ctx.beginPath()
      ctx.moveTo(-hw + line, -hh + line)
      ctx.lineTo(hw - line, hh - line)
      ctx.moveTo(hw - line, -hh + line)
      ctx.lineTo(-hw + line, hh - line)
      ctx.stroke()
      break
    case 'bubble': {
      // Bong bóng thoại trống: nền trắng, viền màu, đuôi ở góc dưới trái.
      const bh = h * 0.78
      ctx.beginPath()
      ctx.roundRect(-hw + line / 2, -hh + line / 2, w - line, bh - line, bh * 0.35)
      ctx.moveTo(-hw * 0.5, -hh + bh - line / 2)
      ctx.lineTo(-hw * 0.65, hh - line / 2)
      ctx.lineTo(-hw * 0.2, -hh + bh - line / 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'highlight':
      // Bút dạ quang: dải màu trong suốt.
      ctx.save()
      ctx.globalAlpha *= 0.45
      ctx.beginPath()
      ctx.roundRect(-hw, -hh, w, h, h * 0.2)
      ctx.fill()
      ctx.restore()
      break
    case 'star': {
      const r = Math.min(hw, hh)
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2
        const rr = i % 2 === 0 ? r : r * 0.45
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
      break
    }
  }
}
