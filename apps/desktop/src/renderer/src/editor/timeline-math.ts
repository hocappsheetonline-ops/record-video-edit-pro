import { clipPositions, type Clip, type ZoomRegion } from '@lumora/core'

/** Các khoảng (ms trên video xuất) mà một đoạn zoom còn hiện sau khi cắt clip. */
export function zoomOutputIntervals(
  zoom: Pick<ZoomRegion, 'start' | 'end'>,
  clips: readonly Clip[],
): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = []
  for (const { clip, outputStart } of clipPositions(clips)) {
    const from = Math.max(zoom.start, clip.sourceStart)
    const to = Math.min(zoom.end, clip.sourceEnd)
    if (to <= from) continue
    result.push({
      start: outputStart + (from - clip.sourceStart) / clip.speed,
      end: outputStart + (to - clip.sourceStart) / clip.speed,
    })
  }
  return result
}

/** Khoảng cách vạch chia thước thời gian sao cho các nhãn không chồng nhau. */
export function tickInterval(durationMs: number, widthPx: number, minGapPx = 70): number {
  const steps = [500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000]
  const pxPerMs = widthPx / Math.max(1, durationMs)
  return steps.find((s) => s * pxPerMs >= minGapPx) ?? steps[steps.length - 1]!
}

/** Định dạng thời gian có phần mười giây, ví dụ "1:05.3". */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * Xếp các khối trùng thời gian vào nhiều hàng con (giống CapCut): mỗi khối vào hàng con đầu tiên
 * còn trống tại thời điểm bắt đầu của nó. Trả về số hàng con của từng khối (theo thứ tự đầu vào).
 */
export function assignLanes(items: readonly { start: number; end: number }[]): number[] {
  const laneEnds: number[] = []
  const lanes: number[] = items.map(() => 0)
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.start - items[b]!.start || a - b)
  for (const i of order) {
    const item = items[i]!
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = item.end
    lanes[i] = lane
  }
  return lanes
}

/** Số hàng con cần để hiện hết các khối (ít nhất 1). */
export function laneCount(items: readonly { start: number; end: number }[]): number {
  return items.length === 0 ? 1 : Math.max(...assignLanes(items)) + 1
}
