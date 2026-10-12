import { describe, expect, it } from 'vitest'
import { filmstripInterval, parseFilmstrip, sheetGrid, thumbAt, type Filmstrip } from './filmstrip'

const strip: Filmstrip = {
  version: 1,
  intervalMs: 1000,
  thumb: { width: 128, height: 72 },
  sheets: [
    // Đoạn 1: 0–5s nguồn, video màn hình bắt đầu trễ 200ms.
    {
      segment: 0,
      file: 'filmstrip-0.jpg',
      count: 5,
      columns: 5,
      rows: 1,
      startMs: 0,
      endMs: 5000,
      offsetMs: 200,
    },
    // Đoạn 2: 5–50s, 45 ảnh → 40 cột × 2 hàng.
    {
      segment: 1,
      file: 'filmstrip-1.jpg',
      count: 45,
      columns: 40,
      rows: 2,
      startMs: 5000,
      endMs: 50_000,
      offsetMs: 5000,
    },
  ],
}

describe('filmstrip', () => {
  it('khoảng cách ảnh theo độ dài bản quay', () => {
    expect(filmstripInterval(10_000)).toBe(1000)
    expect(filmstripInterval(5 * 60_000)).toBe(2000)
    expect(filmstripInterval(3 * 3600_000)).toBe(10_000)
  })

  it('bố cục tấm ghép tối đa 40 cột', () => {
    expect(sheetGrid(5)).toEqual({ columns: 5, rows: 1 })
    expect(sheetGrid(85)).toEqual({ columns: 40, rows: 3 })
    expect(sheetGrid(0)).toEqual({ columns: 1, rows: 1 })
  })

  it('tìm đúng ảnh, đúng ô theo thời gian nguồn (kể cả lệch đầu video và nhiều hàng)', () => {
    expect(thumbAt(strip, 0)).toMatchObject({ index: 0, column: 0, row: 0 })
    expect(thumbAt(strip, 2300)).toMatchObject({ index: 2 })
    expect(thumbAt(strip, 4999)).toMatchObject({ index: 4 })
    const later = thumbAt(strip, 5000 + 42_000)!
    expect(later.sheet.segment).toBe(1)
    expect(later).toMatchObject({ index: 42, column: 2, row: 1 })
    // Sau cuối bản quay: dùng ảnh cuối.
    expect(thumbAt(strip, 60_000)).toMatchObject({ index: 44 })
    expect(thumbAt({ ...strip, sheets: [] }, 0)).toBeNull()
  })

  it('đọc lại file đã lưu, bỏ file hỏng', () => {
    expect(parseFilmstrip(JSON.parse(JSON.stringify(strip)))).toEqual(strip)
    expect(parseFilmstrip({ ...strip, version: 2 })).toBeNull()
    expect(parseFilmstrip({ ...strip, sheets: [{ file: 'x' }] })).toBeNull()
    expect(parseFilmstrip(null)).toBeNull()
  })
})
