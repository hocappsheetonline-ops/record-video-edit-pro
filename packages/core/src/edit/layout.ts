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

/** Vị trí bong bóng webcam: hình vuông cạnh `size` × cạnh ngắn, đặt ở góc với lề nhỏ. */
export function cameraRect(output: Size, size: number, corner: Corner): Rect {
  const short = Math.min(output.width, output.height)
  const side = Math.max(0.05, Math.min(0.6, size)) * short
  const margin = short * 0.035
  const left = corner.endsWith('left')
  const top = corner.startsWith('top')
  return {
    x: left ? margin : output.width - side - margin,
    y: top ? margin : output.height - side - margin,
    width: side,
    height: side,
  }
}
