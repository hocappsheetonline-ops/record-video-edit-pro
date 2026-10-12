import type { LookLayers, Rect } from '@lumora/core'
import { seeded, type AnyCanvas, type Ctx } from './draw'

const scratchByCanvas = new WeakMap<object, Map<string, AnyCanvas>>()

/** Canvas nháp riêng theo canvas đích (canvas xem trước "tainted" không được dùng chung với xuất). */
function scratch(owner: object, key: string, width: number, height: number): AnyCanvas {
  let map = scratchByCanvas.get(owner)
  if (!map) {
    map = new Map()
    scratchByCanvas.set(owner, map)
  }
  let c = map.get(key)
  if (!c || c.width !== width || c.height !== height) {
    c =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height })
    map.set(key, c)
  }
  return c
}

const GRAIN_SIZE = 256
let grainTile: AnyCanvas | null = null

/** Ô hạt nhiễu xám quanh 50% (trung tính khi trộn kiểu overlay); tạo một lần, cố định. */
function grain(): AnyCanvas | null {
  if (grainTile) return grainTile
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(GRAIN_SIZE, GRAIN_SIZE)
      : Object.assign(document.createElement('canvas'), { width: GRAIN_SIZE, height: GRAIN_SIZE })
  const g = c.getContext('2d') as Ctx | null
  if (!g) return null
  const img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE)
  const rand = seeded(7)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rand() - 0.5) * 200
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  grainTile = c
  return c
}

/** Ghép bộ lọc CSS (làm đẹp, look…) thành một chuỗi `ctx.filter`. */
export function joinFilters(...filters: (string | undefined)[]): string {
  const parts = filters.filter((f): f is string => !!f && f !== 'none')
  return parts.length ? parts.join(' ') : 'none'
}

/**
 * Các lớp của "look" mà bộ lọc CSS không làm được: cân bằng trắng (nhiệt độ / sắc độ), vùng sáng /
 * tối, độ nét,
 * viền tối, hạt nhiễu. Vẽ đè lên vùng `rect` đã có hình (ngữ cảnh đang bị cắt theo vùng đó).
 * `frame` đổi hạt nhiễu theo từng khung (xem trước và xuất giống hệt nhau).
 */
export function applyLookLayers(ctx: Ctx, look: LookLayers, rect: Rect, frame: number) {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  ctx.save()

  if (look.sharpen > 0 || look.highlights !== 0 || look.shadows !== 0) {
    const copy = scratch(ctx.canvas, 'look-copy', w, h)
    const c = copy.getContext('2d') as Ctx
    c.globalCompositeOperation = 'copy'
    c.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h)
    c.globalCompositeOperation = 'source-over'
    if (look.sharpen > 0) {
      // Lọc thông cao: 50% ảnh + 50% ảnh mờ đảo màu → xám ở vùng phẳng, sáng/tối ở cạnh; trộn
      // kiểu overlay để làm rõ cạnh (tương tự Unsharp Mask).
      const hp = scratch(ctx.canvas, 'look-hp', w, h)
      const g = hp.getContext('2d') as Ctx
      g.globalCompositeOperation = 'copy'
      g.filter = 'none'
      g.globalAlpha = 1
      g.drawImage(copy, 0, 0)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 0.5
      g.filter = `blur(${Math.max(1, w / 500)}px) invert(1)`
      g.drawImage(copy, 0, 0)
      g.filter = 'none'
      g.globalAlpha = 1
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = Math.min(1, look.sharpen * 1.5)
      ctx.drawImage(hp, x, y)
    }
    if (look.shadows !== 0) {
      // Nâng vùng tối: trộn screen với chính nó (vùng tối sáng lên nhiều hơn vùng sáng). Dìm: multiply.
      ctx.globalCompositeOperation = look.shadows > 0 ? 'screen' : 'multiply'
      ctx.globalAlpha = Math.abs(look.shadows) * 0.6
      ctx.drawImage(copy, x, y)
    }
    if (look.highlights > 0) {
      ctx.globalCompositeOperation = 'color-dodge'
      ctx.globalAlpha = look.highlights * 0.3
      ctx.drawImage(copy, x, y)
    } else if (look.highlights < 0) {
      // Dìm vùng sáng: nhân với ảnh đảo màu (điểm sáng nhân hệ số nhỏ, điểm tối gần như giữ nguyên).
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = -look.highlights * 0.5
      ctx.filter = 'invert(1)'
      ctx.drawImage(copy, x, y)
      ctx.filter = 'none'
    }
    ctx.globalAlpha = 1
  }

  if (look.temperature !== 0 || look.tint !== 0) {
    // Cân bằng trắng kiểu máy ảnh: nhân từng kênh màu. Ấm = tăng đỏ, giảm xanh dương; sắc độ
    // dương (hồng) = giảm xanh lá, âm = tăng xanh lá.
    const t = look.temperature
    const n = look.tint
    const gains = [1 + 0.35 * t, 1 + 0.04 * t - 0.3 * n, 1 - 0.35 * t].map((v) =>
      Math.min(2, Math.max(0, v)),
    ) as [number, number, number]
    const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
    const up = gains.map((v) => Math.max(0, v - 1))
    if (up.some((v) => v > 0)) {
      // Kênh cần tăng: cộng thêm (ảnh × màu chỉ có phần tăng) bằng phép cộng 'lighter'.
      const extra = scratch(ctx.canvas, 'look-gain', w, h)
      const g = extra.getContext('2d') as Ctx
      g.globalCompositeOperation = 'copy'
      g.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h)
      g.globalCompositeOperation = 'multiply'
      g.fillStyle = `rgb(${up.map(byte).join(',')})`
      g.fillRect(0, 0, w, h)
      g.globalCompositeOperation = 'source-over'
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 1
      ctx.drawImage(extra, x, y)
    }
    const down = gains.map((v) => Math.min(1, v))
    if (down.some((v) => v < 1)) {
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = 1
      ctx.fillStyle = `rgb(${down.map(byte).join(',')})`
      ctx.fillRect(x, y, w, h)
    }
  }
  if (look.vignette > 0) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.hypot(w, h) / 2
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, look.vignette * 0.9)})`)
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, w, h)
  }
  const tile = look.grain > 0 ? grain() : null
  if (tile) {
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) {
      const rand = seeded(frame + 1)
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = look.grain * 0.55
      ctx.translate(x - Math.floor(rand() * GRAIN_SIZE), y - Math.floor(rand() * GRAIN_SIZE))
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, w + GRAIN_SIZE, h + GRAIN_SIZE)
    }
  }
  ctx.restore()
}
