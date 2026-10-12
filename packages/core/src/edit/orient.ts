import type { Point, Rect, Size } from '../geometry'

/** Góc xoay theo bước 90° (theo chiều kim đồng hồ). */
export const ROTATIONS = [0, 90, 180, 270] as const
export type Rotation = (typeof ROTATIONS)[number]

/**
 * Biến đổi hình của một clip (kiểu CapCut: Cắt, Lật, Xoay). Thứ tự áp dụng: cắt vùng của video gốc
 * → lật → xoay. Khung hình của dự án tự đổi theo tỉ lệ của video sau biến đổi.
 */
export interface ClipTransform {
  flipH: boolean
  flipV: boolean
  rotate: Rotation
  /** Vùng giữ lại của video gốc (chuẩn hóa 0..1). */
  crop: Rect
}

export const FULL_CROP: Rect = { x: 0, y: 0, width: 1, height: 1 }
export const DEFAULT_TRANSFORM: ClipTransform = {
  flipH: false,
  flipV: false,
  rotate: 0,
  crop: { ...FULL_CROP },
}

/** Cạnh nhỏ nhất của vùng cắt (chuẩn hóa). */
export const MIN_CROP = 0.1

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function isFullCrop(crop: Rect): boolean {
  return crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1
}

export function isDefaultTransform(t: ClipTransform | undefined): boolean {
  return !t || (!t.flipH && !t.flipV && t.rotate === 0 && isFullCrop(t.crop))
}

/** Giữ vùng cắt nằm trong video và không nhỏ hơn MIN_CROP. */
export function normalizeCrop(crop: Partial<Rect>): Rect {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const width = clamp(num(crop.width, 1), MIN_CROP, 1)
  const height = clamp(num(crop.height, 1), MIN_CROP, 1)
  return {
    x: clamp(num(crop.x, 0), 0, 1 - width),
    y: clamp(num(crop.y, 0), 0, 1 - height),
    width,
    height,
  }
}

export function parseClipTransform(value: unknown): ClipTransform | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const t: ClipTransform = {
    flipH: v.flipH === true,
    flipV: v.flipV === true,
    rotate: ROTATIONS.includes(v.rotate as Rotation) ? (v.rotate as Rotation) : 0,
    crop: normalizeCrop(typeof v.crop === 'object' && v.crop !== null ? (v.crop as Rect) : {}),
  }
  return isDefaultTransform(t) ? undefined : t
}

/** Kích thước video sau khi cắt và xoay. */
export function orientedSize(video: Size, t: ClipTransform): Size {
  const w = video.width * t.crop.width
  const h = video.height * t.crop.height
  return t.rotate % 180 === 0 ? { width: w, height: h } : { width: h, height: w }
}

/** Điểm chuẩn hóa của video gốc → điểm chuẩn hóa trong khung đã cắt / lật / xoay. */
export function orientPoint(p: Point, t: ClipTransform): Point {
  let x = (p.x - t.crop.x) / t.crop.width
  let y = (p.y - t.crop.y) / t.crop.height
  if (t.flipH) x = 1 - x
  if (t.flipV) y = 1 - y
  switch (t.rotate) {
    case 90:
      return { x: 1 - y, y: x }
    case 180:
      return { x: 1 - x, y: 1 - y }
    case 270:
      return { x: y, y: 1 - x }
    default:
      return { x, y }
  }
}

/** Ngược lại với `orientPoint`. */
export function unorientPoint(p: Point, t: ClipTransform): Point {
  let x: number
  let y: number
  switch (t.rotate) {
    case 90:
      x = p.y
      y = 1 - p.x
      break
    case 180:
      x = 1 - p.x
      y = 1 - p.y
      break
    case 270:
      x = 1 - p.y
      y = p.x
      break
    default:
      x = p.x
      y = p.y
  }
  if (t.flipH) x = 1 - x
  if (t.flipV) y = 1 - y
  return { x: t.crop.x + x * t.crop.width, y: t.crop.y + y * t.crop.height }
}

/** Vùng chữ nhật trong khung đã biến đổi → vùng tương ứng của video gốc (để lấy điểm ảnh vẽ). */
export function unorientRect(r: Rect, t: ClipTransform): Rect {
  const a = unorientPoint({ x: r.x, y: r.y }, t)
  const b = unorientPoint({ x: r.x + r.width, y: r.y + r.height }, t)
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}
