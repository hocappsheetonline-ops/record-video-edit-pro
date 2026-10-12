import type { EditState } from './edit-state'

/** Phần của bản chỉnh sửa, theo thứ tự ưu tiên khi nhiều phần cùng đổi. */
export const HISTORY_AREAS = [
  'clips',
  'overlays',
  'effects',
  'audioClips',
  'transitions',
  'zooms',
  'captions',
  'markers',
  'tracks',
  'camera',
  'frame',
  'cursor',
  'motion',
  'audio',
  'look',
  'export',
] as const
export type HistoryArea = (typeof HISTORY_AREAS)[number]
export type HistoryOp = 'add' | 'remove' | 'edit'

export interface HistoryLabel {
  area: HistoryArea
  op: HistoryOp
}

/**
 * Mô tả một bước chỉnh sửa (để hiện "Hoàn tác: Thêm lớp phủ" và danh sách Lịch sử): phần nào
 * đổi và là thêm / xóa / sửa. Null nếu hai bản giống nhau.
 */
export function describeChange(prev: EditState, next: EditState): HistoryLabel | null {
  for (const area of HISTORY_AREAS) {
    const a = prev[area] as unknown
    const b = next[area] as unknown
    if (a === b) continue
    if (Array.isArray(a) && Array.isArray(b)) {
      if (b.length > a.length) return { area, op: 'add' }
      if (b.length < a.length) return { area, op: 'remove' }
      if (JSON.stringify(a) !== JSON.stringify(b)) return { area, op: 'edit' }
      continue
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) return { area, op: 'edit' }
  }
  return null
}
