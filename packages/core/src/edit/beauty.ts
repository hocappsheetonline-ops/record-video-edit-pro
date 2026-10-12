/** Làm đẹp webcam kiểu CapCut: mịn da, làm sáng, tông ấm. Mỗi giá trị 0..1 (0 = tắt). */
export interface BeautyStyle {
  smooth: number
  brighten: number
  warmth: number
}

export const NO_BEAUTY: BeautyStyle = { smooth: 0, brighten: 0, warmth: 0 }
export const BEAUTY_PRESET: BeautyStyle = { smooth: 0.6, brighten: 0.5, warmth: 0.3 }

const clamp01 = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0

export function parseBeauty(value: unknown): BeautyStyle {
  const b = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return { smooth: clamp01(b.smooth), brighten: clamp01(b.brighten), warmth: clamp01(b.warmth) }
}

/**
 * Cách vẽ webcam đã làm đẹp bằng canvas 2D (`ctx.filter`):
 * - `base`: bộ lọc màu cho lớp ảnh gốc (sáng hơn, giảm tương phản nhẹ để da mịn, ấm hơn);
 * - `soft`: lớp ảnh làm mờ phủ lên với độ trong suốt — làm mịn da mà vẫn giữ nét chính.
 * `width` là chiều rộng ô hiển thị (px) để độ mờ tương xứng ở mọi kích thước.
 */
export function beautyLayers(
  beauty: BeautyStyle,
  width: number,
): { base: string; soft: { filter: string; alpha: number } | null } {
  const parts: string[] = []
  if (beauty.brighten > 0) {
    parts.push(`brightness(${(1 + 0.3 * beauty.brighten).toFixed(3)})`)
    parts.push(`contrast(${(1 - 0.08 * beauty.brighten).toFixed(3)})`)
  }
  if (beauty.warmth > 0) {
    parts.push(`sepia(${(0.22 * beauty.warmth).toFixed(3)})`)
    parts.push(`saturate(${(1 + 0.15 * beauty.warmth).toFixed(3)})`)
  }
  const base = parts.length > 0 ? parts.join(' ') : 'none'
  if (beauty.smooth <= 0) return { base, soft: null }
  const radius = Math.max(1, width * 0.012 * beauty.smooth)
  return {
    base,
    soft: {
      filter: `${base === 'none' ? '' : `${base} `}blur(${radius.toFixed(2)}px)`,
      alpha: 0.6 * beauty.smooth,
    },
  }
}
