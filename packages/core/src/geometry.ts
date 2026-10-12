export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

/** Đổi vùng tọa độ logic (DIP) sang pixel vật lý theo hệ số phóng to của màn hình. */
export function scaleRect(rect: Rect, scale: number): Rect {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  }
}

/** Phần giao của hai vùng, hoặc `null` nếu không chồng lên nhau. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Bộ mã hóa H.264 (yuv420p) yêu cầu chiều rộng và cao là số chẵn.
 * Làm tròn xuống số chẵn gần nhất, tối thiểu 2 pixel.
 */
export function evenRect(rect: Rect): Rect {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: even(rect.width),
    height: even(rect.height),
  }
}

/** Chuẩn hóa vùng kéo chuột (có thể kéo ngược) thành vùng có chiều dương. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}
