/**
 * Nhãn dán hình vẽ sẵn (vector, không bản quyền) cho video hướng dẫn: mũi tên, vòng tròn, gạch
 * chân, khung nhấn mạnh, con trỏ, dấu tích / dấu x, bong bóng thoại, bút dạ quang.
 */
export const SHAPES = [
  'arrow',
  'circle',
  'underline',
  'box',
  'cursor',
  'check',
  'cross',
  'bubble',
  'highlight',
  'star',
] as const
export type ShapeKind = (typeof SHAPES)[number]

/** Tỉ lệ rộng / cao của từng hình (khung của lớp). */
export const SHAPE_ASPECT: Record<ShapeKind, number> = {
  arrow: 2,
  circle: 1.4,
  underline: 5,
  box: 1.6,
  cursor: 0.75,
  check: 1.2,
  cross: 1,
  bubble: 1.5,
  highlight: 4,
  star: 1,
}

/** Màu hay dùng cho hình (đỏ nổi bật là mặc định). */
export const SHAPE_COLORS = [
  '#ef4444',
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#ffffff',
  '#111111',
] as const
