import type { EditState } from './edit-state'

/** Các hàng trên timeline có nút ẩn / tắt tiếng / khóa. */
export const TIMELINE_ROWS = ['effects', 'overlays', 'captions', 'clips', 'audio'] as const
export type TimelineRow = (typeof TIMELINE_ROWS)[number]

export interface TrackState {
  /** Ẩn: không vẽ khi xem trước và khi xuất. */
  hidden: boolean
  /** Tắt tiếng: không phát, không trộn khi xuất. */
  muted: boolean
  /** Khóa: không chọn, không kéo được trên timeline. */
  locked: boolean
}

export type Tracks = Record<TimelineRow, TrackState>

/** Hàng nào có nút nào (hàng hình có Ẩn, hàng tiếng có Tắt tiếng; hàng nào cũng khóa được). */
export const TRACK_CONTROLS: Record<TimelineRow, readonly ('hidden' | 'muted' | 'locked')[]> = {
  effects: ['hidden', 'locked'],
  overlays: ['hidden', 'muted', 'locked'],
  captions: ['hidden', 'locked'],
  clips: ['muted', 'locked'],
  audio: ['muted', 'locked'],
}

const OFF: TrackState = { hidden: false, muted: false, locked: false }

export const DEFAULT_TRACKS: Tracks = {
  effects: OFF,
  overlays: OFF,
  captions: OFF,
  clips: OFF,
  audio: OFF,
}

export function parseTracks(value: unknown): Tracks {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const out = { ...DEFAULT_TRACKS }
  for (const kind of TIMELINE_ROWS) {
    const t = v[kind]
    if (typeof t !== 'object' || t === null) continue
    const r = t as Record<string, unknown>
    out[kind] = {
      hidden: TRACK_CONTROLS[kind].includes('hidden') && r.hidden === true,
      muted: TRACK_CONTROLS[kind].includes('muted') && r.muted === true,
      locked: r.locked === true,
    }
  }
  return out
}

/** Có hàng nào đang ẩn hoặc tắt tiếng không (để bỏ qua bước áp dụng khi không cần). */
const anyOff = (t: Tracks) => TIMELINE_ROWS.some((k) => t[k].hidden || t[k].muted)

/**
 * Bản chỉnh sửa sau khi áp dụng ẩn / tắt tiếng của các hàng: dùng cho xem trước và xuất,
 * để hai bên luôn giống nhau. Không đổi gì nếu không có hàng nào bị ẩn / tắt tiếng.
 */
export function applyTrackState(edit: EditState): EditState {
  const t = edit.tracks
  if (!t || !anyOff(t)) return edit
  return {
    ...edit,
    effects: t.effects.hidden ? [] : edit.effects,
    overlays: t.overlays.hidden
      ? []
      : t.overlays.muted
        ? edit.overlays.map((o) => (o.kind === 'video' ? { ...o, volume: 0 } : o))
        : edit.overlays,
    captions: t.captions.hidden ? { ...edit.captions, enabled: false } : edit.captions,
    audio: t.clips.muted ? { ...edit.audio, mic: 0, system: 0 } : edit.audio,
    audioClips: t.audio.muted ? [] : edit.audioClips,
  }
}
