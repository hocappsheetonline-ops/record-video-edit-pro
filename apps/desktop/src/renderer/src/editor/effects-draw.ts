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
    case 'zoomPunch': {
      // Phóng nhanh vào rồi về dần trong 0.6 giây đầu, giữ nguyên sau đó.
      const k = Math.min(1, fx.local / 600)
      const scale = 1 + 0.25 * i * (1 - k) ** 2
      if (scale <= 1.001) break
      const copy = snapshot(ctx, w, h)
      ctx.translate(w / 2, h / 2)
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'bounce': {
      // Nhảy lên xuống theo nhịp 0.5 giây, có phóng nhẹ cho khung không hở mép.
      const beat = (fx.local % 500) / 500
      const dy = -Math.abs(Math.sin(beat * Math.PI)) * h * 0.04 * i
      const copy = snapshot(ctx, w, h)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const scale = 1 + 0.08 * i
      ctx.translate(w / 2, h / 2 + dy)
      ctx.scale(scale, scale)
      ctx.drawImage(copy, -w / 2, -h / 2)
      break
    }
    case 'mirror': {
      // Nửa trái giữ nguyên, nửa phải là ảnh gương của nửa trái; độ mạnh pha dần.
      const copy = snapshot(ctx, w, h)
      ctx.globalAlpha = Math.min(1, i * 1.4)
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(copy, 0, 0, w / 2, h, 0, 0, w / 2, h)
      break
    }
    case 'rgbSplit': {
      // Tách kênh màu: bản đỏ lệch trái, bản xanh lệch phải (sắc sai).
      const copy = snapshot(ctx, w, h)
      const off = (w / 120) * i
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.6 * i
      ctx.filter = 'sepia(1) saturate(8) hue-rotate(-50deg)'
      ctx.drawImage(copy, -off, 0)
      ctx.filter = 'sepia(1) saturate(8) hue-rotate(170deg)'
      ctx.drawImage(copy, off, 0)
      break
    }
    case 'pixelate': {
      const copy = snapshot(ctx, w, h)
      const block = Math.max(2, Math.round((w / 40) * i))
      const sw = Math.max(1, Math.round(w / block))
      const sh = Math.max(1, Math.round(h / block))
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(copy, 0, 0, w, h, 0, 0, sw, sh)
      ctx.drawImage(ctx.canvas, 0, 0, sw, sh, 0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      break
    }
    case 'grain': {
      // Hạt phim đổi theo từng khung; hạt nhỏ, nhiều.
      const rand = seeded(Math.floor(fx.local / 33) + 17)
      const count = Math.round(1500 * i)
      const size = Math.max(1, w / 640)
      for (let k = 0; k < count; k++) {
        ctx.globalAlpha = 0.12 + rand() * 0.2 * i
        ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000'
        ctx.fillRect(rand() * w, rand() * h, size, size)
      }
      break
    }
    case 'invert': {
      const copy = snapshot(ctx, w, h)
      ctx.filter = `invert(${i})`
      ctx.drawImage(copy, 0, 0)
      break
    }
    case 'duotone': {
      // Đen trắng rồi phủ hai màu: vùng tối tím, vùng sáng cam.
      const copy = snapshot(ctx, w, h)
      ctx.filter = `grayscale(1) contrast(${1 + 0.3 * i})`
      ctx.drawImage(copy, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 0.85 * i
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = '#f97316'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighten'
      ctx.fillStyle = '#4c1d95'
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'warm':
    case 'cool': {
      const copy = snapshot(ctx, w, h)
      ctx.filter =
        fx.kind === 'warm'
          ? `sepia(${0.35 * i}) saturate(${1 + 0.2 * i}) brightness(${1 + 0.05 * i})`
          : `saturate(${1 - 0.15 * i}) hue-rotate(${-12 * i}deg) brightness(${1 - 0.03 * i})`
      ctx.drawImage(copy, 0, 0)
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'soft-light'
      ctx.globalAlpha = 0.5 * i
      ctx.fillStyle = fx.kind === 'warm' ? '#f59e0b' : '#0ea5e9'
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'strobe': {
      // Nhấp nháy nhanh 6 lần / giây: sáng nửa đầu mỗi chu kỳ.
      const on = (fx.local % 166) / 166 < 0.4
      if (on) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * i})`
        ctx.fillRect(0, 0, w, h)
      }
      break
    }
    case 'glow': {
      // Bloom: bản nhòe sáng cộng lên khung gốc.
      const copy = snapshot(ctx, w, h)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.45 * i
      ctx.filter = `blur(${(w / 80) * i}px) brightness(1.2)`
      ctx.drawImage(copy, 0, 0)
      break
    }
    case 'lightLeak': {
      // Vệt sáng ấm trôi chậm từ góc trên phải, thở nhẹ theo thời gian.
      const drift = Math.sin(fx.local / 1400) * w * 0.15
      const cx = w * 0.85 + drift
      const cy = h * 0.15
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75)
      g.addColorStop(0, `rgba(255,170,60,${0.7 * i})`)
      g.addColorStop(0.45, `rgba(255,80,120,${0.3 * i})`)
      g.addColorStop(1, 'rgba(255,80,120,0)')
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'spotlight': {
      // Tối toàn khung trừ một vòng sáng ở giữa.
      const r = Math.min(w, h) * (0.5 - 0.2 * i)
      const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.6, w / 2, h / 2, r * 1.6)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, `rgba(0,0,0,${0.9 * i})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'letterbox': {
      // Dải đen điện ảnh trên dưới; độ mạnh 1 ≈ tỉ lệ 2.35:1.
      const target = w / 2.35
      const bar = Math.max(0, ((h - target) / 2) * i)
      if (bar <= 0) break
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, bar)
      ctx.fillRect(0, h - bar, w, bar)
      break
    }
    case 'sparkle': {
      // Lấp lánh: các ngôi sao nhỏ sáng lên rồi tắt ở vị trí cố định theo hạt giống.
      const rand = seeded(99)
      const count = Math.round(40 * i)
      const t = fx.local / 1000
      for (let k = 0; k < count; k++) {
        const x = rand() * w
        const y = rand() * h
        const phase = rand() * Math.PI * 2
        const speed = 2 + rand() * 3
        const size = (w / 160) * (0.5 + rand())
        const a = Math.max(0, Math.sin(t * speed + phase)) ** 3
        if (a < 0.05) continue
        ctx.globalAlpha = a
        ctx.fillStyle = '#fff'
        ctx.fillRect(x - size / 2, y - size / 8, size, size / 4)
        ctx.fillRect(x - size / 8, y - size / 2, size / 4, size)
      }
      break
    }
    case 'snow': {
      // Bông tuyết rơi chậm, lắc ngang; vị trí tính từ thời gian nên tua tới đâu cũng đúng.
      const rand = seeded(7)
      const count = Math.round(160 * i)
      const t = fx.local / 1000
      for (let k = 0; k < count; k++) {
        const x0 = rand() * w
        const speed = 0.08 + rand() * 0.12
        const r = (w / 400) * (0.5 + rand())
        const sway = rand() * Math.PI * 2
        const y = ((t * speed * h + rand() * h) % (h + r * 4)) - r * 2
        const x = x0 + Math.sin(t * 1.5 + sway) * w * 0.02
        ctx.globalAlpha = 0.6 + 0.4 * rand()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
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
