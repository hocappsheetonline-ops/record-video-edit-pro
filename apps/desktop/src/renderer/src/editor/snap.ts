import { cutPoints, outputDuration, snapBlock, snapTime } from '@lumora/core'
import { useEditorStore } from './store'

/** Khoảng cách hít dính trên màn hình (px). */
export const SNAP_PX = 8

/** Các mốc để hít: đầu / cuối video, đầu phát, chỗ nối clip, mép các khối khác, marker. */
export function snapCandidates(excludeId: string): number[] {
  const { edit, time } = useEditorStore.getState()
  if (!edit) return []
  const out = [0, outputDuration(edit.clips), time, ...cutPoints(edit.clips).map((c) => c.at)]
  for (const o of edit.overlays) if (o.id !== excludeId) out.push(o.start, o.end)
  for (const x of edit.effects) if (x.id !== excludeId) out.push(x.start, x.end)
  for (const a of edit.audioClips) if (a.id !== excludeId) out.push(a.start, a.start + a.duration)
  for (const m of edit.markers) out.push(m.t)
  return out
}

/**
 * Độ dời đã hít dính cho một khối đang kéo (`mode`: dời cả khối, kéo mép đầu, kéo mép cuối).
 * Giữ Alt để tạm tắt hít dính. Hiện / ẩn vạch hít dính trên timeline.
 */
export function snapDelta(
  origin: { start: number; end: number },
  mode: 'move' | 'start' | 'end',
  delta: number,
  pxPerMs: number,
  excludeId: string,
  altKey = false,
): number {
  const store = useEditorStore.getState()
  if (!store.snapping || altKey || pxPerMs <= 0) {
    store.setSnapLine(null)
    return delta
  }
  const candidates = snapCandidates(excludeId)
  const threshold = SNAP_PX / pxPerMs
  if (mode === 'move') {
    const r = snapBlock(origin.start + delta, origin.end - origin.start, candidates, threshold)
    store.setSnapLine(r.snapped)
    return r.start - origin.start
  }
  const edge = mode === 'start' ? origin.start : origin.end
  const r = snapTime(edge + delta, candidates, threshold)
  store.setSnapLine(r.snapped)
  return r.t - edge
}
