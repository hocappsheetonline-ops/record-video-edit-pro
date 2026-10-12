import type { Size } from '../geometry'

/** Một tấm ảnh ghép (sprite) chứa các ảnh thu nhỏ của một đoạn quay. */
export interface FilmstripSheet {
  /** Số thứ tự đoạn quay. */
  segment: number
  /** Tên file ảnh ghép trong thư mục dự án. */
  file: string
  /** Số ảnh thu nhỏ thật trong tấm. */
  count: number
  columns: number
  rows: number
  /** Khoảng thời gian nguồn của đoạn quay [startMs, endMs). */
  startMs: number
  endMs: number
  /** Thời gian nguồn ứng với ảnh thu nhỏ đầu tiên (đầu file video màn hình). */
  offsetMs: number
}

/** Ảnh thu nhỏ của video màn hình để vẽ dải phim trên timeline (giống CapCut). */
export interface Filmstrip {
  version: 1
  /** Mỗi ảnh cách nhau bao nhiêu ms. */
  intervalMs: number
  /** Kích thước mỗi ảnh thu nhỏ trong tấm ghép (px). */
  thumb: Size
  sheets: FilmstripSheet[]
}

export const FILMSTRIP_FILE = 'filmstrip.json'
export const FILMSTRIP_HEIGHT = 72
export const FILMSTRIP_MAX_COLUMNS = 40

/** Khoảng cách giữa các ảnh: khoảng 150 ảnh cho cả bản quay, tối thiểu 1 giây, tối đa 10 giây. */
export function filmstripInterval(durationMs: number): number {
  const raw = durationMs / 150
  return Math.min(10_000, Math.max(1000, Math.round(raw / 500) * 500))
}

/** Bố cục tấm ghép cho `count` ảnh. */
export function sheetGrid(count: number): { columns: number; rows: number } {
  const columns = Math.max(1, Math.min(count, FILMSTRIP_MAX_COLUMNS))
  return { columns, rows: Math.max(1, Math.ceil(count / columns)) }
}

/** Ảnh thu nhỏ gần nhất cho thời điểm nguồn `s`: tấm nào, ô thứ mấy (cột, hàng). */
export function thumbAt(
  strip: Filmstrip,
  s: number,
): { sheet: FilmstripSheet; index: number; column: number; row: number } | null {
  const sheet =
    strip.sheets.find((x) => s >= x.startMs && s < x.endMs) ??
    (s >= (strip.sheets.at(-1)?.endMs ?? Infinity) ? strip.sheets.at(-1) : undefined)
  if (!sheet || sheet.count === 0) return null
  const raw = Math.round((s - sheet.offsetMs) / strip.intervalMs)
  const index = Math.max(0, Math.min(sheet.count - 1, raw))
  return { sheet, index, column: index % sheet.columns, row: Math.floor(index / sheet.columns) }
}

export function parseFilmstrip(value: unknown): Filmstrip | null {
  if (typeof value !== 'object' || value === null) return null
  const f = value as Record<string, unknown>
  const thumb = f.thumb as Record<string, unknown> | undefined
  if (
    f.version !== 1 ||
    typeof f.intervalMs !== 'number' ||
    f.intervalMs <= 0 ||
    typeof thumb?.width !== 'number' ||
    typeof thumb.height !== 'number' ||
    !Array.isArray(f.sheets)
  )
    return null
  const keys = ['segment', 'count', 'columns', 'rows', 'startMs', 'endMs', 'offsetMs'] as const
  const sheets = f.sheets.filter(
    (x): x is FilmstripSheet =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as FilmstripSheet).file === 'string' &&
      keys.every((k) => typeof (x as Record<string, unknown>)[k] === 'number'),
  )
  if (sheets.length !== f.sheets.length) return null
  return {
    version: 1,
    intervalMs: f.intervalMs,
    thumb: { width: thumb.width, height: thumb.height },
    sheets,
  }
}
