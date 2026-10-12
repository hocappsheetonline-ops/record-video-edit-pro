import type { Segment } from '../project'
import { MIN_AUDIO_CLIP_MS, newAudioClipId, type AudioClip } from './audio-clips'
import { clipSegment } from './reverse'
import { clipGain, clipPositions, mediaTime, type Clip } from './timeline'
import type { EffectRegion } from './effects'
import type { Overlay } from './overlays'

/**
 * Hít dính: đưa `t` về ứng viên gần nhất nếu cách không quá `threshold` ms.
 * Trả về thời điểm mới và ứng viên đã hít (null nếu không hít).
 */
export function snapTime(
  t: number,
  candidates: readonly number[],
  threshold: number,
): { t: number; snapped: number | null } {
  let best: number | null = null
  let dist = threshold
  for (const c of candidates) {
    const d = Math.abs(c - t)
    if (d <= dist) {
      dist = d
      best = c
    }
  }
  return best === null ? { t, snapped: null } : { t: best, snapped: best }
}

/**
 * Hít dính cho một khối dài `length` đang được kéo: thử cả mép đầu và mép cuối,
 * lấy mép nào gần ứng viên hơn. Trả về thời điểm bắt đầu mới.
 */
export function snapBlock(
  start: number,
  length: number,
  candidates: readonly number[],
  threshold: number,
): { start: number; snapped: number | null } {
  const a = snapTime(start, candidates, threshold)
  const b = snapTime(start + length, candidates, threshold)
  const da = a.snapped === null ? Infinity : Math.abs(a.snapped - start)
  const db = b.snapped === null ? Infinity : Math.abs(b.snapped - (start + length))
  if (da === Infinity && db === Infinity) return { start, snapped: null }
  return da <= db ? { start: a.t, snapped: a.snapped } : { start: b.t - length, snapped: b.snapped }
}

interface Span {
  start: number
  end: number
}

/** Gộp các khoảng chồng nhau, sắp theo thời gian. */
function union(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const out: Span[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push({ ...s })
  }
  return out
}

/** Tổng thời lượng các khoảng đã xóa nằm trước (hoặc tới) thời điểm `t`. */
function removedBefore(holes: readonly Span[], t: number) {
  let sum = 0
  for (const h of holes) if (h.end <= t) sum += h.end - h.start
  return sum
}

/**
 * Xóa dồn: bỏ các mục `ids`, các mục còn lại phía sau dịch sang trái đúng bằng phần
 * thời gian đã xóa (giống CapCut Shift+Delete). Mục bắt đầu trước chỗ xóa giữ nguyên.
 */
export function rippleDelete<T extends { id: string; start: number; end: number }>(
  items: readonly T[],
  ids: ReadonlySet<string>,
): T[] {
  const holes = union(items.filter((i) => ids.has(i.id)))
  return items
    .filter((i) => !ids.has(i.id))
    .map((i) => {
      const shift = removedBefore(holes, i.start)
      return shift > 0 ? { ...i, start: i.start - shift, end: i.end - shift } : i
    })
}

/** Xóa dồn cho đoạn âm thanh (thời gian theo `start` + `duration`). */
export function rippleDeleteAudio(
  clips: readonly AudioClip[],
  ids: ReadonlySet<string>,
): AudioClip[] {
  const spans = clips.map((c) => ({ id: c.id, start: c.start, end: c.start + c.duration }))
  const moved = new Map(rippleDelete(spans, ids).map((s) => [s.id, s.start]))
  return clips
    .filter((c) => !ids.has(c.id))
    .map((c) => ({ ...c, start: moved.get(c.id) ?? c.start }))
}

/** Nội dung đã sao chép (lớp phủ, hiệu ứng, âm thanh), giữ nguyên thời gian gốc. */
export interface ClipboardData {
  overlays: Overlay[]
  effects: EffectRegion[]
  audioClips: AudioClip[]
}

export const isClipboardEmpty = (c: ClipboardData | null) =>
  !c || c.overlays.length + c.effects.length + c.audioClips.length === 0

/** Thời điểm sớm nhất trong nội dung đã sao chép. */
function clipboardOrigin(c: ClipboardData): number {
  const starts = [
    ...c.overlays.map((o) => o.start),
    ...c.effects.map((e) => e.start),
    ...c.audioClips.map((a) => a.start),
  ]
  return starts.length > 0 ? Math.min(...starts) : 0
}

/**
 * Dán tại `at`: giữ khoảng cách tương đối giữa các mục (mục sớm nhất bắt đầu tại `at`),
 * cắt bớt phần vượt quá cuối video `total`, bỏ mục nằm hẳn ngoài video. `newId` tạo id mới.
 */
export function pasteClipboard(
  c: ClipboardData,
  at: number,
  total: number,
  newId: (kind: 'overlay' | 'effect' | 'audio') => string,
): ClipboardData {
  const shift = at - clipboardOrigin(c)
  const span = <T extends { start: number; end: number }>(x: T): T | null => {
    const start = x.start + shift
    if (start >= total - 100) return null
    return { ...x, start, end: Math.min(total, x.end + shift) }
  }
  return {
    overlays: c.overlays.flatMap((o) => {
      const r = span(o)
      return r ? [{ ...r, id: newId('overlay') }] : []
    }),
    effects: c.effects.flatMap((e) => {
      const r = span(e)
      return r ? [{ ...r, id: newId('effect') }] : []
    }),
    audioClips: c.audioClips.flatMap((a) => {
      const start = a.start + shift
      if (start >= total - 100) return []
      return [{ ...a, id: newId('audio'), start, duration: Math.min(a.duration, total - start) }]
    }),
  }
}

/**
 * Tách tiếng của clip chính thành các đoạn âm thanh riêng (micro, âm thanh máy) đặt đúng chỗ
 * trên timeline, để cắt / chỉnh / thêm hiệu ứng như nhạc. Chỉ làm được với clip tốc độ thường
 * (không đường cong, không phát ngược, không đóng băng) nằm trong một đoạn quay.
 * Trả về null nếu không tách được.
 */
export function detachClipAudio(
  segments: readonly Segment[],
  clips: readonly Clip[],
  clipId: string,
  mix: { mic: number; system: number },
  names: { mic: string; system: string },
): AudioClip[] | null {
  const pos = clipPositions(clips).find((p) => p.clip.id === clipId)
  if (!pos) return null
  const { clip, outputStart } = pos
  if (clip.freeze || clip.reversed || clip.speedCurve || clip.speed !== 1) return null
  const item = clipSegment(segments, clip)
  if (!item) return null
  const length = clip.sourceEnd - clip.sourceStart
  const out: AudioClip[] = []
  for (const kind of ['mic', 'system'] as const) {
    const at = mediaTime(item, kind, clip.sourceStart)
    if (at === null) continue
    // Track bắt đầu ghi muộn hơn đầu clip: đoạn âm thanh bắt đầu muộn tương ứng.
    const lead = Math.max(0, -at * 1000)
    const duration = length - lead
    if (duration < MIN_AUDIO_CLIP_MS) continue
    const volume = mix[kind] * clipGain(clip, kind)
    if (volume <= 0) continue
    const offset = Math.max(0, at * 1000)
    out.push({
      id: newAudioClipId(),
      file: item.segment.tracks[kind]!.file,
      name: names[kind],
      kind: kind === 'mic' ? 'voice' : 'sfx',
      start: Math.round(outputStart + lead),
      offset: Math.round(offset),
      duration: Math.round(duration),
      sourceDuration: Math.round(offset + duration),
      volume: Math.min(2, volume),
      fadeIn: 0,
      fadeOut: 0,
      loop: false,
    })
  }
  return out.length > 0 ? out : null
}
