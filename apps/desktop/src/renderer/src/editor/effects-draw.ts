import type { ActiveEffect } from '@lumora/core'
import { drawGlitch, seeded, snapshot, type Ctx } from './draw'
import type { FrameScene } from './scene'

const CONFETTI_COLORS = [
  '#f43f5e',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#facc15',
  '#ffffff',
]

/** Vẽ một hiệu ứng lên khung hình đã ghép xong. Mọi chuyển động tính từ thời gian nên xem trước = xuất. */
function drawEffect(ctx: Ctx, fx: ActiveEffect, w: number, h: number) {
  const i = fx.intensity
  ctx.save()
  switch (fx.kind) {
    case 'bw': {
      const copy = snapshot(ctx, w, h)
      ctx.filter = `grayscale(${i}) contrast(${1 + 0.15 * i})`
      ctx.drawImage(copy, 0, 0)
      break
    }
    case 'vintage': {
      const copy = snapshot(ctx, w, h)
      ctx.filter = `sepia(${0.7 * i}) contrast(${1 + 0.1 * i}) saturate(${1 - 0.25 * i})`
      ctx.drawImage(copy, 0, 0)
      vignette(ctx, w, h, 0.55 * i)
      break
    }
    case 'vignette':
      vignette(ctx, w, h, 0.85 * i)
      break
    case 'blur': {
      const copy = snapshot(ctx, w, h)
      ctx.filter = `blur(${(i * w) / 120}px)`
      ctx.drawImage(copy, 0, 0)
      break
    }
    case 'shake': {
      const copy = snapshot(ctx, w, h)
      // Đổi vị trí ~25 lần/giây, biên độ tới 3% khung.
      const rand = seeded(Math.floor(fx.local / 40) + 7)
      const dx = (rand() - 0.5) * w * 0.06 * i
      const dy = (rand() - 0.5) * h * 0.06 * i
      const rot = (rand() - 0.5) * 0.03 * i
      const scale = 1 + 0.07 * i
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.translate(w / 2 + dx, h / 2 + dy)
      ctx.rotate(rot)
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'glitch': {
      // Nhấp nháy: lúc mạnh lúc nhẹ như glitch thật.
      const slot = Math.floor(fx.local / 120)
      const burst = seeded(slot + 3)() > 0.45 ? 1 : 0.25
      drawGlitch(ctx, snapshot(ctx, w, h), w, h, i * burst, slot + 11)
      break
    }
    case 'vhs': {
      const copy = snapshot(ctx, w, h)
      ctx.filter = `blur(${(w / 1600) * i}px) saturate(${1 + 0.3 * i})`
      ctx.drawImage(copy, 0, 0)
      ctx.filter = 'none'
      // Lệch màu nhẹ.
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.25 * i
      ctx.drawImage(copy, (w / 300) * i, 0)
      ctx.globalCompositeOperation = 'source-over'
      // Đường quét ngang.
      ctx.globalAlpha = 0.18 * i
      ctx.fillStyle = '#000'
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.5)
      // Hạt nhiễu thay đổi theo khung.
      const rand = seeded(Math.floor(fx.local / 33) + 5)
      ctx.globalAlpha = 0.35 * i
      for (let k = 0; k < 600; k++) {
        ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000'
        ctx.fillRect(rand() * w, rand() * h, 2, 2)
      }
      // Dải nhiễu chạy dọc màn hình.
      const bandY = ((fx.local / 2500) % 1) * h
      ctx.globalAlpha = 0.12 * i
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, bandY, w, h * 0.04)
      break
    }
    case 'flash': {
      // Lóe sáng theo nhịp: mỗi 0.5 giây một lần, tắt dần.
      const beat = (fx.local % 500) / 500
      ctx.fillStyle = `rgba(255,255,255,${0.8 * i * (1 - beat) ** 3})`
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'pulse': {
      // Nhún theo nhịp: phóng to nhanh rồi về dần, mỗi 0.5 giây.
      const beat = (fx.local % 500) / 500
      const scale = 1 + 0.12 * i * (1 - beat) ** 2
      const copy = snapshot(ctx, w, h)
      ctx.translate(w / 2, h / 2)
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'confetti': {
      // Pháo giấy rơi: vị trí từng mảnh tính từ thời gian nên tua tới đâu cũng đúng.
      const rand = seeded(42)
      const count = Math.round(140 * i)
      const t = fx.local / 1000
      const size = Math.max(4, w / 120)
      for (let k = 0; k < count; k++) {
        const x0 = rand() * w
        const speed = 0.25 + rand() * 0.35
        const delay = rand() * 1.2
        const sway = rand() * Math.PI * 2
        const color = CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)]!
        const life = t - delay
        if (life < 0) continue
        const y = -size * 2 + ((life * speed * h) % (h + size * 4))
        const x = x0 + Math.sin(life * 3 + sway) * w * 0.02
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(life * 4 + sway)
        ctx.fillStyle = color
        ctx.fillRect(-size / 2, -size / 4, size, size / 2)
        ctx.restore()
      }
      break
    }
  }
  ctx.restore()
}

function vignette(ctx: Ctx, w: number, h: number, strength: number) {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Áp mọi hiệu ứng đang chạy (theo thứ tự thêm vào). */
export function applyEffects(ctx: Ctx, scene: FrameScene) {
  for (const fx of scene.effects) drawEffect(ctx, fx, scene.width, scene.height)
}
