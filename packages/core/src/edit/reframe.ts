import type { Rect, Size } from '../geometry'
import { contentRect } from './layout'
import type { CameraStyle, FrameStyle } from './edit-state'
import type { Camera } from './zoom'

export interface FrameLayout {
  /** Vùng đặt video màn hình (đã trừ lề hoặc dải webcam). */
  content: Rect
  /** Dải webcam khi bố cục `stack`; null khi webcam là bong bóng hoặc không có. */
  strip: Rect | null
}

/**
 * Bố cục khung hình: dải webcam (nếu chọn `stack`) chiếm trọn chiều ngang ở trên hoặc dưới,
 * phần còn lại dành cho video màn hình — phủ kín khi `fill`, hoặc đặt vừa trong lề như cũ.
 */
export function frameLayout(
  output: Size,
  video: Size,
  frame: Pick<FrameStyle, 'padding' | 'fill'>,
  camera: Pick<CameraStyle, 'visible' | 'layout' | 'split' | 'position'> | null,
): FrameLayout {
  let area: Rect = { x: 0, y: 0, width: output.width, height: output.height }
  let strip: Rect | null = null
  if (camera?.visible && camera.layout === 'stack') {
    const h = Math.round(output.height * Math.max(0.2, Math.min(0.6, camera.split)))
    const top = camera.position.startsWith('top')
    strip = { x: 0, y: top ? 0 : output.height - h, width: output.width, height: h }
    area = { x: 0, y: top ? h : 0, width: output.width, height: output.height - h }
  }
  if (frame.fill) return { content: area, strip }
  const inner = contentRect({ width: area.width, height: area.height }, video, frame.padding)
  return { content: { ...inner, x: inner.x + area.x, y: inner.y + area.y }, strip }
}

/** Kích thước khung nhìn (chuẩn hóa) khi chưa zoom để lấp đầy vùng có tỉ lệ `content`. */
export function fillBaseView(video: Size, content: Size): Size {
  const ratio = content.width / content.height / (video.width / video.height)
  return ratio <= 1 ? { width: ratio, height: 1 } : { width: 1, height: 1 / ratio }
}

/**
 * Phần video màn hình được hiện (chuẩn hóa 0..1) khi lấp đầy một vùng có tỉ lệ khác video:
 * khung nhìn có đúng tỉ lệ của vùng, thu nhỏ theo mức zoom, tâm theo camera ảo và không vượt
 * ra ngoài video.
 */
export function fillViewRect(camera: Camera, video: Size, content: Size): Rect {
  const base = fillBaseView(video, content)
  const width = base.width / camera.scale
  const height = base.height / camera.scale
  const x = Math.min(1 - width / 2, Math.max(width / 2, camera.x)) - width / 2
  const y = Math.min(1 - height / 2, Math.max(height / 2, camera.y)) - height / 2
  return { x, y, width, height }
}

/** Cắt giữa một khung hình nguồn cho vừa tỉ lệ đích (kiểu `object-fit: cover`), đơn vị pixel nguồn. */
export function coverSource(source: Size, target: Size): Rect {
  const ratio = target.width / target.height
  if (source.width / source.height > ratio) {
    const width = source.height * ratio
    return { x: (source.width - width) / 2, y: 0, width, height: source.height }
  }
  const height = source.width / ratio
  return { x: 0, y: (source.height - height) / 2, width: source.width, height }
}
