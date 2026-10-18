import {
  cutPoints,
  DEFAULT_ANIM,
  DEFAULT_EFFECT_MS,
  DEFAULT_LOOK,
  DEFAULT_OVERLAY_MS,
  DEFAULT_TRANSITION_MS,
  NO_ANIM,
  newOverlayId,
  outputDuration,
  type EditState,
  type EffectKind,
  type FilterPreset,
  type Look,
  type Overlay,
  type TransitionKind,
} from '@lumora/core'

/** Bộ lọc / điều chỉnh sẽ áp dụng cho đâu (bản sao của `LookTarget` trong store, để không import vòng). */
export type PreviewLookTarget = { kind: 'all' } | { kind: 'clip' | 'overlay'; id: string }

/**
 * Xem thử (như CapCut): rê chuột lên hiệu ứng / bộ lọc / chuyển cảnh / meme / nhãn dán / chữ
 * để thấy ngay trên khung xem trước mà chưa thêm vào dự án; nhạc thì nghe thử. Bỏ chuột ra là
 * mọi thứ trở lại như cũ; bấm thì mới thêm thật.
 */
export type TryPreview =
  | { kind: 'effect'; effect: EffectKind }
  | { kind: 'filter'; filter: FilterPreset; target: PreviewLookTarget }
  | { kind: 'transition'; transition: TransitionKind; afterClip: string }
  | { kind: 'overlay'; overlay: Partial<Overlay> & Pick<Overlay, 'kind'> }
  | { kind: 'music'; url: string; name: string }

/** Id của mục xem thử (không bao giờ được lưu vào dự án). */
export const PREVIEW_ID = '__preview'

/** Phát thử bao lâu rồi lặp lại (ms). */
const PREVIEW_PLAY_MS = 2500
/** Phát thử chuyển cảnh: lấy thêm mỗi bên chỗ nối chừng này (ms). */
const TRANSITION_PAD_MS = 450

export interface PreviewWindow {
  start: number
  end: number
}

/**
 * Lớp mới tại `time` với các giá trị mặc định (dùng chung cho thêm thật và xem thử): video meme
 * dài bằng phần còn lại của file, lớp khác dài `DEFAULT_OVERLAY_MS`; cỡ tùy loại.
 */
export function buildOverlay(
  init: Partial<Overlay> & Pick<Overlay, 'kind'>,
  time: number,
  total: number,
): Overlay {
  const start = Math.min(time, Math.max(0, total - 200))
  const video = init.kind === 'video'
  const length = video
    ? Math.max(200, (init.sourceDuration ?? 0) - (init.mediaOffset ?? 0))
    : DEFAULT_OVERLAY_MS
  return {
    id: newOverlayId(),
    start,
    end: Math.min(total, start + length),
    x: 0.5,
    y: init.kind === 'text' ? 0.15 : 0.5,
    size: video
      ? (init.aspect ?? 1) < 1
        ? 0.7
        : 0.45
      : init.kind === 'image'
        ? 0.35
        : init.kind === 'emoji'
          ? 0.18
          : init.kind === 'shape'
            ? 0.14
            : init.kind === 'blur'
              ? 0.3
              : 0.09,
    rotation: 0,
    // Video meme và vùng che hiện ngay, không "bật ra".
    anim: video || init.kind === 'blur' ? { ...NO_ANIM } : { ...DEFAULT_ANIM },
    text: '',
    style: 'meme',
    color: '#ffffff',
    file: '',
    aspect: init.kind === 'blur' ? 1.6 : 1,
    mediaOffset: 0,
    sourceDuration: 0,
    hasAudio: false,
    volume: 1,
    keyColor: '',
    keyStrength: 0.4,
    ...init,
  }
}

/** Hai mục xem thử có giống nhau không (để rê chuột qua lại không phát lại từ đầu). */
export function samePreview(a: TryPreview | null, b: TryPreview | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Khoảng cần phát để thấy mục xem thử, tính từ đầu phát hiện tại (`time`). Nhạc nghe thử
 * không cần chạy timeline → null.
 */
export function previewWindow(
  edit: EditState,
  preview: TryPreview,
  time: number,
): PreviewWindow | null {
  const total = outputDuration(edit.clips)
  if (total <= 0) return null
  const clamp = (w: PreviewWindow): PreviewWindow => ({
    start: Math.max(0, Math.min(w.start, total)),
    end: Math.max(0, Math.min(w.end, total)),
  })
  switch (preview.kind) {
    case 'music':
      return null
    case 'transition': {
      const cut = cutPoints(edit.clips).find((c) => c.afterClip === preview.afterClip)
      if (!cut) return null
      const half = DEFAULT_TRANSITION_MS / 2 + TRANSITION_PAD_MS
      return clamp({ start: cut.at - half, end: cut.at + half })
    }
    case 'overlay': {
      const o = buildOverlay(preview.overlay, time, total)
      return clamp({ start: o.start, end: Math.min(o.end, o.start + PREVIEW_PLAY_MS) })
    }
    default: {
      // Hiệu ứng / bộ lọc: phát từ đầu phát; gần cuối video thì lùi lại để còn chỗ xem.
      const start = Math.max(0, Math.min(time, total - Math.min(total, PREVIEW_PLAY_MS)))
      return clamp({ start, end: start + PREVIEW_PLAY_MS })
    }
  }
}

function withLook(edit: EditState, target: PreviewLookTarget, patch: (look: Look) => Look) {
  if (target.kind === 'clip')
    return {
      ...edit,
      clips: edit.clips.map((c) =>
        c.id === target.id ? { ...c, look: patch(c.look ?? edit.look ?? DEFAULT_LOOK) } : c,
      ),
    }
  if (target.kind === 'overlay')
    return {
      ...edit,
      overlays: edit.overlays.map((o) =>
        o.id === target.id ? { ...o, look: patch(o.look ?? DEFAULT_LOOK) } : o,
      ),
    }
  return { ...edit, look: patch(edit.look ?? DEFAULT_LOOK) }
}

/**
 * Bản chỉnh sửa có thêm mục xem thử (không lưu, không hoàn tác): hiệu ứng tại `start`, bộ lọc
 * thay tạm, chuyển cảnh tại chỗ nối, lớp (meme / nhãn dán / chữ) tại `start`. Nhạc không đổi gì.
 */
export function withPreview(edit: EditState, preview: TryPreview | null, start: number): EditState {
  if (!preview) return edit
  const total = outputDuration(edit.clips)
  switch (preview.kind) {
    case 'effect': {
      const at = Math.max(0, Math.min(start, total - 200))
      return {
        ...edit,
        effects: [
          ...edit.effects.filter((e) => e.id !== PREVIEW_ID),
          {
            id: PREVIEW_ID,
            kind: preview.effect,
            start: at,
            end: Math.min(total, at + DEFAULT_EFFECT_MS),
            intensity: 0.7,
          },
        ],
      }
    }
    case 'filter':
      return withLook(edit, preview.target, (look) => ({
        ...look,
        filter: preview.filter,
        intensity: look.filter === preview.filter ? look.intensity : 1,
      }))
    case 'transition':
      return {
        ...edit,
        transitions: [
          ...edit.transitions.filter((t) => t.afterClip !== preview.afterClip),
          {
            afterClip: preview.afterClip,
            kind: preview.transition,
            durationMs: DEFAULT_TRANSITION_MS,
          },
        ],
      }
    case 'overlay':
      return {
        ...edit,
        overlays: [
          ...edit.overlays.filter((o) => o.id !== PREVIEW_ID),
          { ...buildOverlay(preview.overlay, start, total), id: PREVIEW_ID },
        ],
      }
    case 'music':
      return edit
  }
}
