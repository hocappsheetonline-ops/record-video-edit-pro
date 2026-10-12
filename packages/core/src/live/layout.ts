import type { Rect, Size } from '../geometry'

export const STUDIO_LAYOUTS = ['solo', 'grid', 'screen', 'pip'] as const
export type StudioLayout = (typeof STUDIO_LAYOUTS)[number]

export interface StudioSlots {
  /** Ô hiển thị màn hình chia sẻ (nếu có). */
  screen: Rect | null
  /** Ô cho từng người trên sóng, theo thứ tự. */
  people: Rect[]
}

function gridRects(area: Rect, count: number, gap: number, aspect = 16 / 9): Rect[] {
  if (count <= 0) return []
  // Chọn số cột cho ô to nhất có thể.
  let best = { cols: 1, size: 0 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const w = (area.width - gap * (cols - 1)) / cols
    const h = (area.height - gap * (rows - 1)) / rows
    const cell = Math.min(w, h * aspect)
    if (cell > best.size) best = { cols, size: cell }
  }
  const cols = best.cols
  const rows = Math.ceil(count / cols)
  const w = best.size
  const h = w / aspect
  const totalH = rows * h + (rows - 1) * gap
  const rects: Rect[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const inRow = row === rows - 1 ? count - row * cols : cols
    const rowW = inRow * w + (inRow - 1) * gap
    const col = i - row * cols
    rects.push({
      x: area.x + (area.width - rowW) / 2 + col * (w + gap),
      y: area.y + (area.height - totalH) / 2 + row * (h + gap),
      width: w,
      height: h,
    })
  }
  return rects
}

/**
 * Bố trí khung hình phát trực tiếp:
 * - `solo`: chỉ người đầu tiên, toàn khung.
 * - `grid`: mọi người chia đều.
 * - `screen`: màn hình chia sẻ to bên trái, người xếp dọc bên phải.
 * - `pip`: màn hình toàn khung, người đầu tiên trong ô nhỏ góc dưới phải.
 * Không có màn hình chia sẻ thì `screen`/`pip` hiển thị như `grid`.
 */
export function studioSlots(
  layout: StudioLayout,
  size: Size,
  peopleCount: number,
  hasScreen: boolean,
): StudioSlots {
  const margin = Math.round(size.height * 0.04)
  const gap = Math.round(size.height * 0.02)
  const area: Rect = {
    x: margin,
    y: margin,
    width: size.width - margin * 2,
    height: size.height - margin * 2,
  }

  if ((layout === 'screen' || layout === 'pip') && !hasScreen) layout = 'grid'
  if (layout === 'solo')
    return { screen: null, people: gridRects(area, Math.min(1, peopleCount), gap) }
  if (layout === 'grid') return { screen: null, people: gridRects(area, peopleCount, gap) }
  if (layout === 'pip') {
    const w = size.width * 0.24
    const h = (w * 9) / 16
    return {
      screen: area,
      people:
        peopleCount > 0
          ? [
              {
                x: area.x + area.width - w - gap,
                y: area.y + area.height - h - gap,
                width: w,
                height: h,
              },
            ]
          : [],
    }
  }
  if (peopleCount === 0) return { screen: area, people: [] }
  const sideW = Math.round(area.width * 0.24)
  const screen: Rect = {
    x: area.x,
    y: area.y,
    width: area.width - sideW - gap,
    height: area.height,
  }
  const side: Rect = {
    x: area.x + screen.width + gap,
    y: area.y,
    width: sideW,
    height: area.height,
  }
  return { screen, people: gridRects(side, peopleCount, gap).slice(0, peopleCount) }
}

/** Vùng cắt (cover) để nguồn hình lấp đầy ô mà không méo. */
export function coverCrop(source: Size, target: Size): Rect {
  const scale = Math.max(target.width / source.width, target.height / source.height)
  const w = target.width / scale
  const h = target.height / scale
  return { x: (source.width - w) / 2, y: (source.height - h) / 2, width: w, height: h }
}

/** Vùng vẽ (contain) để nguồn hình nằm trọn trong ô, giữ tỉ lệ. */
export function containRect(source: Size, target: Rect): Rect {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const w = source.width * scale
  const h = source.height * scale
  return {
    x: target.x + (target.width - w) / 2,
    y: target.y + (target.height - h) / 2,
    width: w,
    height: h,
  }
}
