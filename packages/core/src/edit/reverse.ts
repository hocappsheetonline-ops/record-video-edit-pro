import type { Segment, TrackKind } from '../project'
import { segmentAt, sourceSegments, type Clip, type SourceSegment } from './timeline'

/** Clip phát ngược dài tối đa (ms): file đảo ngược được tạo ở nền, giới hạn để không quá lâu. */
export const REVERSE_MAX_MS = 120_000

/** Đoạn quay chứa trọn clip (null nếu clip trải qua nhiều đoạn — không phát ngược được). */
export function clipSegment(
  segments: readonly Segment[],
  clip: Pick<Clip, 'sourceStart' | 'sourceEnd'>,
): SourceSegment | null {
  const item = segmentAt(sourceSegments(segments), clip.sourceStart)
  if (!item || clip.sourceEnd > item.offset + item.duration + 1) return null
  return item
}

export function canReverse(
  segments: readonly Segment[],
  clip: Pick<Clip, 'sourceStart' | 'sourceEnd' | 'freeze'>,
): boolean {
  return (
    !clip.freeze &&
    clip.sourceEnd - clip.sourceStart <= REVERSE_MAX_MS &&
    clipSegment(segments, clip) !== null
  )
}

/**
 * Tên file đảo ngược của một track trong khoảng nguồn của clip. Thời điểm 0 của file ứng với
 * `sourceEnd` của clip (lùi dần về `sourceStart`). Tên cố định nên renderer và main tự tính được.
 */
export function reversedFileName(
  segmentIndex: number,
  clip: Pick<Clip, 'sourceStart' | 'sourceEnd'>,
  kind: TrackKind,
): string {
  const ext = kind === 'screen' || kind === 'camera' ? 'mp4' : 'm4a'
  return `rev-s${segmentIndex}-${Math.round(clip.sourceStart)}-${Math.round(clip.sourceEnd)}-${kind}.${ext}`
}
