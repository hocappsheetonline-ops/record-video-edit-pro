import type { Rect, Size } from '../geometry'

export const ASPECTS = ['16:9', '9:16', '1:1', '4:3', 'source'] as const
export type Aspect = (typeof ASPECTS)[number]

export const RESOLUTIONS = [720, 1080, 1440, 2160] as const
export type Resolution = (typeof RESOLUTIONS)[number]

export const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const
export type Corner = (typeof CORNERS)[number]

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Tỉ lệ khung hình (rộng/cao). `source` lấy theo video gốc. */
export function aspectRatio(aspect: Aspect, source: Size): number {
  switch (aspect) {
    case '16:9':
      return 16 / 9
    case '9:16':
      return 9 / 16
    case '1:1':
      return 1
    case '4:3':
      return 4 / 3
    case 'source':
      return source.width / source.height
  }
}

/** Kích thước video xuất: `resolution` là cạnh ngắn (1080 → 1920×1080 khi ngang, 1080×1920 khi dọc). */
export function outputSize(aspect: Aspect, resolution: number, source: Size): Size {
  const ratio = aspectRatio(aspect, source)
  return ratio >= 1
    ? { width: even(resolution * ratio), height: even(resolution) }
    : { width: even(resolution), height: even(resolution / ratio) }
}

/** Vùng đặt video màn hình bên trong khung, chừa lề `padding` (tỉ lệ theo cạnh ngắn), giữ đúng tỉ lệ video. */
export function contentRect(output: Size, video: Size, padding: number): Rect {
  const margin = Math.max(0, Math.min(0.45, padding)) * Math.min(output.width, output.height)
  const boxW = output.width - margin * 2
  const boxH = output.height - margin * 2
  const ratio = video.width / video.height
  const width = Math.min(boxW, boxH * ratio)
  const height = width / ratio
  return { x: (output.width - width) / 2, y: (output.height - height) / 2, width, height }
}

/**
 * Vị trí bong bóng webcam trong khung: `x`, `y` từ 0 (sát trái / trên) tới 1 (sát phải / dưới),
 * luôn chừa một lề nhỏ nên bong bóng không bao giờ ra ngoài khung dù đổi tỉ lệ hay cỡ.
 */
export interface CameraPlacement {
  x: number
  y: number
}

export function cornerPlacement(corner: Corner): CameraPlacement {
  return { x: corner.endsWith('left') ? 0 : 1, y: corner.startsWith('top') ? 0 : 1 }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function bubbleBox(output: Size, size: number) {
  const short = Math.min(output.width, output.height)
  const side = Math.max(0.05, Math.min(0.6, size)) * short
  const margin = short * 0.035
  return {
    side,
    margin,
    freeW: Math.max(0, output.width - side - margin * 2),
    freeH: Math.max(0, output.height - side - margin * 2),
  }
}

/** Ô bong bóng webcam: hình vuông cạnh `size` × cạnh ngắn, đặt ở góc hoặc vị trí tự do. */
export function cameraRect(output: Size, size: number, place: Corner | CameraPlacement): Rect {
  const p = typeof place === 'string' ? cornerPlacement(place) : place
  const { side, margin, freeW, freeH } = bubbleBox(output, size)
  return {
    x: margin + clamp01(p.x) * freeW,
    y: margin + clamp01(p.y) * freeH,
    width: side,
    height: side,
  }
}

/**
 * Vị trí ứng với tâm bong bóng tại điểm `center` (pixel khung) — dùng khi kéo webcam trên khung
 * xem trước. Gần góc / giữa cạnh thì hít vào cho dễ đặt thẳng hàng.
 */
export function placementAt(output: Size, size: number, center: { x: number; y: number }) {
  const { side, margin, freeW, freeH } = bubbleBox(output, size)
  const snap = (v: number) => {
    for (const target of [0, 0.5, 1]) if (Math.abs(v - target) < 0.03) return target
    return v
  }
  return {
    x: snap(freeW > 0 ? clamp01((center.x - side / 2 - margin) / freeW) : 0.5),
    y: snap(freeH > 0 ? clamp01((center.y - side / 2 - margin) / freeH) : 0.5),
  }
}

/** Góc ứng với vị trí (để tô sáng nút góc đang chọn); null nếu webcam không nằm ở góc. */
export function placementCorner(p: CameraPlacement): Corner | null {
  const h = p.x === 0 ? 'left' : p.x === 1 ? 'right' : null
  const v = p.y === 0 ? 'top' : p.y === 1 ? 'bottom' : null
  return h && v ? (`${v}-${h}` as Corner) : null
}
