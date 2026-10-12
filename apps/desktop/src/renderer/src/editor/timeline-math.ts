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
