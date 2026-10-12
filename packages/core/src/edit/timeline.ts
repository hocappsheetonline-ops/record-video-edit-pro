import type { Project, Segment, TrackKind } from '../project'
import type { Look } from './look'
import type { ClipTransform } from './orient'
import { curveAlongAt, curveOutputAt, curveSpeedAt, subCurve, type SpeedCurve } from './speed-curve'

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
  /** Âm lượng riêng của clip (nhân với mức chung của dự án); không có = giữ nguyên. */
  audio?: ClipAudio
  /** Bộ lọc màu / điều chỉnh riêng của clip; không có = dùng của cả video. */
  look?: Look
  /** Cắt / lật / xoay riêng của clip. */
  transform?: ClipTransform
  /**
   * Khung hình đứng yên (ms): clip giữ khung tại `sourceStart` trong chừng ấy thời gian, không có
   * tiếng. Clip đứng yên có `sourceEnd === sourceStart`.
   */
  freeze?: number
  /** Phát ngược (dùng file đảo ngược do main tạo). */
  reversed?: boolean
  /** Đường cong tốc độ (thay cho `speed` khi có). */
  speedCurve?: SpeedCurve
  /** Độ mờ của video màn hình trong clip (0..1, không có = 1): thấy nền phía sau. */
  opacity?: number
}

export interface ClipAudio {
  /** Hệ số âm lượng micro / âm thanh máy của riêng clip này (0..2). */
  mic: number
  system: number
  /** Tắt tiếng cả clip. */
  muted: boolean
}

export const DEFAULT_CLIP_AUDIO: ClipAudio = { mic: 1, system: 1, muted: false }

/** Hệ số âm lượng của một track trong clip (0 khi tắt tiếng). */
export function clipGain(clip: Pick<Clip, 'audio'>, kind: 'mic' | 'system'): number {
  if (!clip.audio) return 1
  return clip.audio.muted ? 0 : clip.audio[kind]
}

export function parseClipAudio(value: unknown): ClipAudio | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const gain = (x: unknown) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(2, Math.max(0, x)) : 1
  return { mic: gain(v.mic), system: gain(v.system), muted: v.muted === true }
}

export const MIN_CLIP_MS = 100
export const SPEEDS = [0.5, 1, 1.5, 2, 3, 4] as const

let clipCounter = 0
export function newClipId(): string {
  clipCounter += 1
  return `c${Date.now().toString(36)}${clipCounter.toString(36)}`
}

/** Độ dài nguồn của clip (ms). */
export const clipLength = (clip: Clip) => clip.sourceEnd - clip.sourceStart

/**
 * "Quãng đã phát" (ms nguồn tính từ đầu clip theo thứ tự phát) ↔ thời điểm nguồn. Clip phát ngược
 * đi từ `sourceEnd` lùi về.
 */
export function sourceAtAlong(clip: Clip, along: number): number {
  return clip.reversed ? clip.sourceEnd - along : clip.sourceStart + along
}
export function alongAtSource(clip: Clip, s: number): number {
  return clip.reversed ? clip.sourceEnd - s : s - clip.sourceStart
}

/** Quãng đã phát sau `offset` ms trên video xuất tính từ đầu clip. */
export function alongAtOffset(clip: Clip, offset: number): number {
  if (clip.freeze) return 0
  const len = clipLength(clip)
  if (clip.speedCurve) return curveAlongAt(clip.speedCurve, len, offset)
  return Math.min(len, Math.max(0, offset * clip.speed))
}

/** Thời gian xuất (ms từ đầu clip) để phát tới quãng `along`. */
export function offsetAtAlong(clip: Clip, along: number): number {
  if (clip.freeze) return 0
  if (clip.speedCurve) return curveOutputAt(clip.speedCurve, clipLength(clip), along)
  return along / clip.speed
}

/** Tốc độ phát tức thời tại `offset` ms từ đầu clip (cho thẻ video khi xem trước). */
export function clipSpeedAt(clip: Clip, offset: number): number {
  if (clip.freeze) return 0
  if (!clip.speedCurve) return clip.speed
  const len = clipLength(clip)
  return curveSpeedAt(clip.speedCurve, len > 0 ? alongAtOffset(clip, offset) / len : 0)
}

export function clipDuration(clip: Clip): number {
  if (clip.freeze) return clip.freeze
  return offsetAtAlong(clip, clipLength(clip))
}

/**
 * Phần của clip từ quãng `a` tới `b` (ms nguồn theo thứ tự phát) thành một clip mới (giữ chiều phát,
 * đường cong tốc độ được cắt đúng phần).
 */
export function clipPart(clip: Clip, a: number, b: number): Clip {
  const len = clipLength(clip)
  const lo = Math.max(0, Math.min(a, b))
  const hi = Math.min(len, Math.max(a, b))
  const range = clip.reversed
    ? { sourceStart: clip.sourceEnd - hi, sourceEnd: clip.sourceEnd - lo }
    : { sourceStart: clip.sourceStart + lo, sourceEnd: clip.sourceStart + hi }
  return {
    ...clip,
    ...range,
    ...(clip.speedCurve && len > 0
      ? { speedCurve: subCurve(clip.speedCurve, lo / len, hi / len) }
      : {}),
  }
}

/** Thời lượng khung hình đứng yên mặc định và giới hạn (ms). */
export const FREEZE_DEFAULT_MS = 2000
export const FREEZE_MAX_MS = 60_000

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
      const clip = position.clip
      const source = clip.freeze
        ? clip.sourceStart
        : sourceAtAlong(clip, alongAtOffset(clip, clamped - position.outputStart))
      return { position, source }
    }
  }
  const last = positions[positions.length - 1]!
  return {
    position: last,
    source: last.clip.freeze
      ? last.clip.sourceStart
      : sourceAtAlong(last.clip, clipLength(last.clip)),
  }
}

/** Thời điểm nguồn → thời điểm trên video xuất, hoặc null nếu đoạn đó đã bị cắt bỏ. */
export function sourceToOutput(clips: readonly Clip[], s: number): number | null {
  for (const { clip, outputStart } of clipPositions(clips)) {
    if (clip.freeze) continue
    if (s >= clip.sourceStart && s <= clip.sourceEnd) {
      return outputStart + offsetAtAlong(clip, alongAtSource(clip, s))
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
  if (clip.freeze) {
    const local = Math.round(t - hit.position.outputStart)
    if (local < MIN_CLIP_MS || clip.freeze - local < MIN_CLIP_MS) return [...clips]
    const left: Clip = { ...clip, freeze: local }
    const right: Clip = { ...clip, id: newClipId(), freeze: clip.freeze - local }
    return [...clips.slice(0, index), left, right, ...clips.slice(index + 1)]
  }
  const a = Math.round(alongAtSource(clip, hit.source))
  const len = clipLength(clip)
  if (a < MIN_CLIP_MS || len - a < MIN_CLIP_MS) return [...clips]
  const left: Clip = clipPart(clip, 0, a)
  const right: Clip = { ...clipPart(clip, a, len), id: newClipId() }
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
  const a = Math.round(alongAtSource(clip, hit.source))
  const local = Math.round(t - outputStart)
  const keep: Clip = clip.freeze
    ? { ...clip, freeze: side === 'left' ? clip.freeze - local : local }
    : side === 'left'
      ? clipPart(clip, a, clipLength(clip))
      : clipPart(clip, 0, a)
  const tooShort = clip.freeze
    ? (keep.freeze ?? 0) < MIN_CLIP_MS
    : keep.sourceEnd - keep.sourceStart < MIN_CLIP_MS
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
  return clips.map((c) => {
    if (c.id !== id || c.freeze) return c
    // Tốc độ cố định thay cho đường cong.
    const next: Clip = { ...c, speed: safe }
    delete next.speedCurve
    return next
  })
}

/**
 * Chèn khung hình đứng yên tại đầu phát `t` (kiểu CapCut "Đóng băng"): tách clip ở đó và chèn một
 * clip đứng yên giữ đúng khung đang xem (cùng bộ lọc / biến đổi của clip gốc).
 */
export function insertFreeze(
  clips: readonly Clip[],
  t: number,
  durationMs = FREEZE_DEFAULT_MS,
): { clips: Clip[]; id: string } | null {
  const hit = outputToSource(clips, t)
  if (!hit) return null
  const { clip } = hit.position
  const s = clip.freeze ? clip.sourceStart : Math.round(hit.source)
  const frozen: Clip = {
    id: newClipId(),
    sourceStart: s,
    sourceEnd: s,
    speed: 1,
    freeze: Math.min(FREEZE_MAX_MS, Math.max(MIN_CLIP_MS, Math.round(durationMs))),
    ...(clip.look ? { look: clip.look } : {}),
    ...(clip.transform ? { transform: clip.transform } : {}),
  }
  const split = splitAt(clips, t)
  // Đã tách được: chèn sau nửa trái. Không tách được (sát mép): chèn trước / sau cả clip.
  const local = t - hit.position.outputStart
  let at: number
  if (split.length > clips.length) at = hit.position.index + 1
  else at = local < clipDuration(clip) / 2 ? hit.position.index : hit.position.index + 1
  return { clips: [...split.slice(0, at), frozen, ...split.slice(at)], id: frozen.id }
}

/** Đổi thời lượng của clip đứng yên. */
export function setFreezeDuration(clips: readonly Clip[], id: string, ms: number): Clip[] {
  const safe = Math.min(FREEZE_MAX_MS, Math.max(MIN_CLIP_MS, Math.round(ms)))
  return clips.map((c) => (c.id === id && c.freeze ? { ...c, freeze: safe } : c))
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
    if (clip.freeze) {
      result.push(clip)
      continue
    }
    // Phần giữ lại tính theo quãng phát (đúng cả clip phát ngược, đường cong tốc độ).
    const len = clipLength(clip)
    let kept: [number, number][] = [[0, len]]
    for (const range of sorted) {
      const a = alongAtSource(
        clip,
        Math.max(clip.sourceStart, Math.min(clip.sourceEnd, range.start)),
      )
      const b = alongAtSource(clip, Math.max(clip.sourceStart, Math.min(clip.sourceEnd, range.end)))
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      if (hi <= lo) continue
      kept = kept.flatMap(([x, y]): [number, number][] => {
        if (hi <= x || lo >= y) return [[x, y]]
        const out: [number, number][] = []
        if (lo > x) out.push([x, lo])
        if (hi < y) out.push([hi, y])
        return out
      })
    }
    kept
      .filter(([x, y]) => y - x >= MIN_CLIP_MS)
      .forEach(([x, y], i) => {
        const part = clipPart(clip, x, y)
        result.push(i === 0 ? part : { ...part, id: newClipId() })
      })
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
