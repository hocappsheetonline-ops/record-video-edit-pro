import type { Project, Segment, TrackKind } from '../project'

/**
 * "Thời gian nguồn" (ms): các đoạn quay được nối liền nhau theo thứ tự, bỏ qua lúc tạm dừng.
 * Đoạn i chiếm khoảng [offset_i, offset_i + thời lượng_i).
 */
export interface SourceSegment {
  segment: Segment
  /** Vị trí bắt đầu của đoạn trên thời gian nguồn. */
  offset: number
  duration: number
}

export function sourceSegments(segments: readonly Segment[]): SourceSegment[] {
  let offset = 0
  return segments.map((segment) => {
    const duration = Math.max(0, segment.endedAt - segment.startedAt)
    const item = { segment, offset, duration }
    offset += duration
    return item
  })
}

export function sourceDuration(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, s.endedAt - s.startedAt), 0)
}

/** Đoạn chứa thời điểm nguồn `s` (thời điểm cuối cùng thuộc đoạn cuối). */
export function segmentAt(list: readonly SourceSegment[], s: number): SourceSegment | null {
  if (list.length === 0) return null
  for (const item of list) {
    if (s < item.offset + item.duration) return s >= item.offset ? item : null
  }
  const last = list[list.length - 1]!
  return s <= last.offset + last.duration ? last : null
}

/**
 * Thời điểm (giây) trong file của một track ứng với thời điểm nguồn `s`.
 * Âm nghĩa là track chưa bắt đầu ghi ở thời điểm đó.
 */
export function mediaTime(item: SourceSegment, kind: TrackKind, s: number): number | null {
  const track = item.segment.tracks[kind]
  if (!track) return null
  const wall = item.segment.startedAt + (s - item.offset)
  return (wall - track.startedAt) / 1000
}

/** Đổi thời điểm thật (epoch ms, ví dụ của sự kiện chuột) sang thời gian nguồn. Null nếu rơi vào lúc tạm dừng. */
export function wallToSource(list: readonly SourceSegment[], wall: number): number | null {
  for (const item of list) {
    const { startedAt, endedAt } = item.segment
    if (wall >= startedAt && wall <= endedAt) return item.offset + (wall - startedAt)
  }
  return null
}

/** Một đoạn được giữ lại trên timeline, lấy từ [sourceStart, sourceEnd) của thời gian nguồn. */
export interface Clip {
  id: string
  sourceStart: number
  sourceEnd: number
  /** Tốc độ phát, ví dụ 2 = nhanh gấp đôi. */
  speed: number
}

export const MIN_CLIP_MS = 100
export const SPEEDS = [0.5, 1, 1.5, 2, 3, 4] as const

let clipCounter = 0
export function newClipId(): string {
  clipCounter += 1
  return `c${Date.now().toString(36)}${clipCounter.toString(36)}`
}

export function clipDuration(clip: Clip): number {
  return (clip.sourceEnd - clip.sourceStart) / clip.speed
}

export function outputDuration(clips: readonly Clip[]): number {
  return clips.reduce((sum, c) => sum + clipDuration(c), 0)
}

export interface ClipPosition {
  clip: Clip
  index: number
  /** Vị trí bắt đầu của clip trên video xuất ra. */
  outputStart: number
}

export function clipPositions(clips: readonly Clip[]): ClipPosition[] {
  let outputStart = 0
  return clips.map((clip, index) => {
    const pos = { clip, index, outputStart }
    outputStart += clipDuration(clip)
    return pos
  })
}

/** Thời điểm trên video xuất → clip và thời điểm nguồn tương ứng. */
export function outputToSource(
  clips: readonly Clip[],
  t: number,
): { position: ClipPosition; source: number } | null {
  const positions = clipPositions(clips)
  if (positions.length === 0) return null
  const clamped = Math.max(0, t)
  for (const position of positions) {
    const end = position.outputStart + clipDuration(position.clip)
    if (clamped < end) {
      const source =
        position.clip.sourceStart + (clamped - position.outputStart) * position.clip.speed
      return { position, source }
    }
  }
  const last = positions[positions.length - 1]!
  return { position: last, source: last.clip.sourceEnd }
}

/** Thời điểm nguồn → thời điểm trên video xuất, hoặc null nếu đoạn đó đã bị cắt bỏ. */
export function sourceToOutput(clips: readonly Clip[], s: number): number | null {
  for (const { clip, outputStart } of clipPositions(clips)) {
    if (s >= clip.sourceStart && s <= clip.sourceEnd) {
      return outputStart + (s - clip.sourceStart) / clip.speed
    }
  }
  return null
}

/** Mặc định: mỗi đoạn quay là một clip. */
export function initialClips(project: Pick<Project, 'segments'>): Clip[] {
  return sourceSegments(project.segments)
    .filter((s) => s.duration > 0)
    .map((s) => ({
      id: newClipId(),
      sourceStart: s.offset,
      sourceEnd: s.offset + s.duration,
      speed: 1,
    }))
}

/** Tách clip tại thời điểm xuất `t`. Không tách nếu quá sát mép clip. */
export function splitAt(clips: readonly Clip[], t: number): Clip[] {
  const hit = outputToSource(clips, t)
  if (!hit) return [...clips]
  const { clip, index } = hit.position
  const s = Math.round(hit.source)
  if (s - clip.sourceStart < MIN_CLIP_MS || clip.sourceEnd - s < MIN_CLIP_MS) return [...clips]
  const left: Clip = { ...clip, sourceEnd: s }
  const right: Clip = { ...clip, id: newClipId(), sourceStart: s }
  return [...clips.slice(0, index), left, right, ...clips.slice(index + 1)]
}

/**
 * Xóa nhanh kiểu CapCut tại đầu phát `t`: `left` bỏ phần clip từ đầu clip tới đầu phát,
 * `right` bỏ phần từ đầu phát tới cuối clip. Các clip phía sau tự dồn lên. Trả về danh sách clip
 * mới và vị trí đầu phát mới (để vẫn đứng ở đúng khung hình đang xem).
 */
export function trimAtPlayhead(
  clips: readonly Clip[],
  t: number,
  side: 'left' | 'right',
): { clips: Clip[]; time: number } {
  const hit = outputToSource(clips, t)
  if (!hit) return { clips: [...clips], time: t }
  const { clip, index, outputStart } = hit.position
  const s = Math.round(hit.source)
  const keep: Clip = side === 'left' ? { ...clip, sourceStart: s } : { ...clip, sourceEnd: s }
  const tooShort = keep.sourceEnd - keep.sourceStart < MIN_CLIP_MS
  if (tooShort && clips.length === 1) return { clips: [...clips], time: t }
  const next = tooShort
    ? [...clips.slice(0, index), ...clips.slice(index + 1)]
    : [...clips.slice(0, index), keep, ...clips.slice(index + 1)]
  return { clips: next, time: side === 'left' ? outputStart : Math.min(t, outputDuration(next)) }
}

export function removeClip(clips: readonly Clip[], id: string): Clip[] {
  return clips.filter((c) => c.id !== id)
}

export function setClipSpeed(clips: readonly Clip[], id: string, speed: number): Clip[] {
  const safe = Math.min(16, Math.max(0.25, speed))
  return clips.map((c) => (c.id === id ? { ...c, speed: safe } : c))
}

export interface SourceRange {
  start: number
  end: number
}

/**
 * Bỏ các khoảng thời gian nguồn khỏi timeline (dùng cho AI cắt từ thừa, khoảng lặng).
 * Clip bị chia nhỏ khi khoảng cần bỏ nằm giữa clip; mảnh quá ngắn bị loại.
 */
export function removeSourceRanges(clips: readonly Clip[], ranges: readonly SourceRange[]): Clip[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const result: Clip[] = []
  for (const clip of clips) {
    let pieces: Clip[] = [clip]
    for (const range of sorted) {
      pieces = pieces.flatMap((piece) => {
        if (range.end <= piece.sourceStart || range.start >= piece.sourceEnd) return [piece]
        const out: Clip[] = []
        if (range.start > piece.sourceStart) out.push({ ...piece, sourceEnd: range.start })
        if (range.end < piece.sourceEnd)
          out.push({ ...piece, id: newClipId(), sourceStart: range.end })
        return out
      })
    }
    result.push(...pieces.filter((p) => p.sourceEnd - p.sourceStart >= MIN_CLIP_MS))
  }
  // Mảnh đầu tiên của mỗi clip giữ id cũ; nếu id bị trùng do tách thì đặt id mới.
  const seen = new Set<string>()
  return result.map((c) => {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      return c
    }
    const fresh = { ...c, id: newClipId() }
    seen.add(fresh.id)
    return fresh
  })
}
