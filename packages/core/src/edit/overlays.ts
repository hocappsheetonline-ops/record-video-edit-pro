import { dragRegion } from './effects'
import type { AudioClip } from './audio-clips'
import { isDefaultLook, parseLook, type Look } from './look'
import { SHAPES, type ShapeKind } from './shapes'
import { legacyTextStyle, parseTextStyle, type TextStyleProps } from './text-style'
import {
  animMotion,
  BLEND_MODES,
  parseAnim,
  parseKeyframes,
  parseMask,
  poseAt,
  shiftKeyframes,
  type BlendMode,
  type Keyframe,
  type OverlayAnim,
  type OverlayMask,
  type OverlayMotion,
  type Pose,
} from './overlay-fx'

/**
 * Lớp nổi trên video (kiểu CapCut "Văn bản" / "Nhãn dán" / "Lớp phủ"): chữ, emoji, ảnh/GIF và
 * video meme (có tiếng, xóa được phông xanh), và vùng che (`blur`: làm mờ / khảm ô phần video
 * phía dưới để giấu mật khẩu, email… — dời / đổi cỡ / keyframe như lớp khác).
 */
export const OVERLAY_KINDS = ['text', 'emoji', 'image', 'video', 'shape', 'blur'] as const
export type OverlayKind = (typeof OVERLAY_KINDS)[number]

export const TEXT_STYLES = ['meme', 'title', 'bubble', 'neon'] as const
export type TextStyle = (typeof TEXT_STYLES)[number]

export interface Overlay {
  id: string
  kind: OverlayKind
  /** Khoảng hiển thị trên video xuất (ms). */
  start: number
  end: number
  /** Tâm, tỉ lệ theo khung hình (0..1). */
  x: number
  y: number
  /** Cỡ: chiều cao chữ / emoji / ảnh / video, tỉ lệ theo chiều cao khung (0.03..4; >1 để phủ kín khung). */
  size: number
  /** Góc xoay (độ). */
  rotation: number
  /** Hoạt ảnh vào / ra / lặp. */
  anim: OverlayAnim
  /** Chữ (kind = text) hoặc emoji (kind = emoji). */
  text: string
  style: TextStyle
  color: string
  /** File ảnh / video trong thư mục dự án (kind = image | video). */
  file: string
  /** Tỉ lệ rộng/cao của ảnh / video (để vẽ đúng hình). */
  aspect: number
  /** Video: phát từ ms thứ mấy của file, độ dài file, có tiếng không và âm lượng (0..2). */
  mediaOffset: number
  sourceDuration: number
  hasAudio: boolean
  volume: number
  /** Xóa phông (chroma key): màu nền cần xóa ('' = không xóa) và độ mạnh 0..1. */
  keyColor: string
  keyStrength: number
  /** Bộ lọc màu / điều chỉnh của ảnh / video (không có = giữ nguyên). */
  look?: Look
  /** Độ mờ 0..1 (không có = 1). */
  opacity?: number
  /** Chế độ hòa trộn với video bên dưới (không có = bình thường). */
  blend?: BlendMode
  flipH?: boolean
  flipV?: boolean
  /** Mặt nạ hình (chỉ ảnh / video). */
  mask?: OverlayMask
  /** Keyframe vị trí / cỡ / góc / độ mờ (có thì ghi đè giá trị gốc). */
  keyframes?: Keyframe[]
  /** Xóa phông bằng AI tách người (ảnh / video không có phông xanh). */
  aiKey?: boolean
  /** Kiểu chữ nâng cao (chữ); không có thì theo `style` + `color` cũ. */
  textStyle?: TextStyleProps
  /** Hình vẽ sẵn (kind = shape), vẽ bằng màu `color`. */
  shape?: ShapeKind
  /** Độ dày nét của hình (0.02..0.3 theo cạnh nhỏ của lớp). */
  strokeWidth?: number
  /** Vùng che (kind = blur): làm mờ hay khảm ô, và độ mạnh 0..1. */
  blurMode?: BlurMode
  blurStrength?: number
}

export const BLUR_MODES = ['blur', 'pixelate'] as const
export type BlurMode = (typeof BLUR_MODES)[number]
export const DEFAULT_BLUR_STRENGTH = 0.5

/** Kiểu chữ đang dùng của lớp chữ (dự án cũ: suy ra từ `style` + `color`). */
export function overlayTextStyle(
  o: Pick<Overlay, 'style' | 'color' | 'textStyle'>,
): TextStyleProps {
  return o.textStyle ?? legacyTextStyle(o.style, o.color)
}

/** Màu phông có sẵn để xóa: xanh lá (phổ biến nhất ở video meme), xanh dương, đen, trắng. */
export const KEY_COLORS = ['#00ff00', '#0000ff', '#000000', '#ffffff'] as const

export const DEFAULT_OVERLAY_MS = 3000

let counter = 0
export function newOverlayId(): string {
  counter += 1
  return `o${Date.now().toString(36)}${counter}`
}

export type { OverlayMotion }

/** Biến đổi do hoạt ảnh vào / ra / lặp tại thời điểm `t` (ms trên video xuất). */
export function overlayMotion(
  o: Pick<Overlay, 'anim' | 'start' | 'end'>,
  t: number,
): OverlayMotion {
  return animMotion(o, t)
}

/** Vị trí, cỡ, góc, độ mờ của lớp tại thời điểm `t` (theo keyframe nếu có). */
export function overlayPose(
  o: Pick<Overlay, 'x' | 'y' | 'size' | 'rotation' | 'opacity' | 'keyframes' | 'start'>,
  t: number,
): Pose {
  return poseAt(
    { x: o.x, y: o.y, size: o.size, rotation: o.rotation, opacity: o.opacity ?? 1 },
    o.keyframes,
    t - o.start,
  )
}

/** Lớp với tư thế tại thời điểm `t` (để vẽ, bấm chọn, kéo trên khung xem trước). */
export function posedOverlay(o: Overlay, t: number): Overlay {
  if (!o.keyframes?.length) return o
  const pose = overlayPose(o, t)
  return { ...o, ...pose }
}

/** Vị trí cần phát trong file video (ms) tại thời điểm xuất `t`; giữ khung cuối khi hết file. */
export function overlayMediaTime(
  o: Pick<Overlay, 'start' | 'mediaOffset' | 'sourceDuration'>,
  t: number,
): number {
  const raw = o.mediaOffset + Math.max(0, t - o.start)
  return Math.max(0, Math.min(raw, o.sourceDuration > 0 ? o.sourceDuration - 1 : raw))
}

/** Video meme dài nhất có thể đặt từ `mediaOffset` (ms). */
export function overlayMaxDuration(o: Pick<Overlay, 'kind' | 'mediaOffset' | 'sourceDuration'>) {
  return o.kind === 'video' ? Math.max(0, o.sourceDuration - o.mediaOffset) : Infinity
}

/**
 * Kéo lớp nổi trên timeline. Với video: cắt đầu thì bỏ bớt đầu file tương ứng, kéo dài không quá
 * phần còn lại của file.
 */
export function dragOverlay(
  origin: Overlay,
  mode: 'move' | 'start' | 'end',
  delta: number,
  total: number,
): Overlay {
  const next = dragMedia(origin, mode, delta, total)
  if (mode !== 'start' || !origin.keyframes) return next
  // Cắt / kéo dài phía trước: keyframe đứng yên trên video xuất.
  const keyframes = shiftKeyframes(
    overlayPose({ ...origin, keyframes: undefined }, origin.start),
    origin.keyframes,
    next.start - origin.start,
    next.end - next.start,
  )
  return { ...next, keyframes: keyframes?.length ? keyframes : undefined }
}

function dragMedia(
  origin: Overlay,
  mode: 'move' | 'start' | 'end',
  delta: number,
  total: number,
): Overlay {
  if (origin.kind !== 'video') return dragRegion(origin, mode, delta, total)
  if (mode === 'move') return dragRegion(origin, mode, delta, total)
  if (mode === 'start') {
    // Không lùi đầu quá điểm 0 của file.
    const d = Math.max(-origin.mediaOffset, delta)
    const next = dragRegion(origin, 'start', d, total)
    return { ...next, mediaOffset: origin.mediaOffset + (next.start - origin.start) }
  }
  const next = dragRegion(origin, 'end', delta, total)
  return { ...next, end: Math.min(next.end, origin.start + overlayMaxDuration(origin)) }
}

/** Tiếng của các video meme, dạng đoạn âm thanh để trộn khi xuất (giống nhạc / hiệu ứng). */
export function overlayAudioClips(overlays: readonly Overlay[]): AudioClip[] {
  return overlays.flatMap((o): AudioClip[] =>
    o.kind === 'video' && o.hasAudio && o.volume > 0 && o.sourceDuration > 0
      ? [
          {
            id: `ov-${o.id}`,
            file: o.file,
            name: o.text,
            kind: 'sfx',
            start: o.start,
            offset: o.mediaOffset,
            duration: Math.min(o.end - o.start, overlayMaxDuration(o)),
            sourceDuration: o.sourceDuration,
            volume: o.volume,
            fadeIn: 0,
            fadeOut: 0,
            loop: false,
          },
        ]
      : [],
  )
}

/** Các lớp nổi đang hiện tại thời điểm `t`, theo thứ tự thêm (lớp sau đè lớp trước). */
export function overlaysAt(overlays: readonly Overlay[], t: number): Overlay[] {
  return overlays.filter((o) => t >= o.start && t < o.end)
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

export function parseOverlays(value: unknown): Overlay[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v): Overlay[] => {
    if (typeof v !== 'object' || v === null) return []
    const o = v as Record<string, unknown>
    if (typeof o.id !== 'string' || !OVERLAY_KINDS.includes(o.kind as OverlayKind)) return []
    const start = num(o.start, NaN, 0, 24 * 3600_000)
    const end = num(o.end, NaN, 0, 24 * 3600_000)
    if (!(end - start >= 100)) return []
    const kind = o.kind as OverlayKind
    const file = typeof o.file === 'string' && /^[\w.-]+$/.test(o.file) ? o.file : ''
    if ((kind === 'image' || kind === 'video') && !file) return []
    if (kind === 'shape' && !SHAPES.includes(o.shape as ShapeKind)) return []
    const sourceDuration = num(o.sourceDuration, 0, 0, 24 * 3600_000)
    if (kind === 'video' && sourceDuration <= 0) return []
    const media = kind === 'image' || kind === 'video'
    const look = media && o.look !== undefined ? parseLook(o.look) : undefined
    const mask = media ? parseMask(o.mask) : undefined
    const keyframes = parseKeyframes(o.keyframes)
    return [
      {
        id: o.id,
        kind,
        start,
        end,
        x: num(o.x, 0.5, 0, 1),
        y: num(o.y, 0.5, 0, 1),
        size: num(o.size, 0.12, 0.03, 4),
        rotation: num(o.rotation, 0, -180, 180),
        anim: parseAnim(o.anim, o.animation),
        text: typeof o.text === 'string' ? o.text.slice(0, 200) : '',
        style: TEXT_STYLES.includes(o.style as TextStyle) ? (o.style as TextStyle) : 'meme',
        color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#ffffff',
        file,
        aspect: num(o.aspect, 1, 0.05, 20),
        mediaOffset: num(o.mediaOffset, 0, 0, Math.max(0, sourceDuration - 100)),
        sourceDuration,
        hasAudio: o.hasAudio === true,
        volume: num(o.volume, 1, 0, 2),
        keyColor:
          typeof o.keyColor === 'string' && /^#[0-9a-f]{6}$/i.test(o.keyColor)
            ? o.keyColor.toLowerCase()
            : '',
        keyStrength: num(o.keyStrength, 0.4, 0, 1),
        ...(look && !isDefaultLook(look) ? { look } : {}),
        ...(typeof o.opacity === 'number' && o.opacity < 1
          ? { opacity: num(o.opacity, 1, 0, 1) }
          : {}),
        ...(BLEND_MODES.includes(o.blend as BlendMode) && o.blend !== 'normal'
          ? { blend: o.blend as BlendMode }
          : {}),
        ...(o.flipH === true ? { flipH: true } : {}),
        ...(o.flipV === true ? { flipV: true } : {}),
        ...(mask ? { mask } : {}),
        ...(media && o.aiKey === true ? { aiKey: true } : {}),
        ...(kind === 'text' && parseTextStyle(o.textStyle)
          ? { textStyle: parseTextStyle(o.textStyle) }
          : {}),
        ...(kind === 'shape'
          ? { shape: o.shape as ShapeKind, strokeWidth: num(o.strokeWidth, 0.08, 0.02, 0.3) }
          : {}),
        ...(kind === 'blur'
          ? {
              blurMode: BLUR_MODES.includes(o.blurMode as BlurMode)
                ? (o.blurMode as BlurMode)
                : 'blur',
              blurStrength: num(o.blurStrength, DEFAULT_BLUR_STRENGTH, 0.05, 1),
            }
          : {}),
        ...(keyframes ? { keyframes } : {}),
      },
    ]
  })
}

/** Emoji sticker có sẵn (vẽ bằng font emoji của hệ điều hành). */
export const EMOJI_STICKERS = [
  '😂',
  '🤣',
  '😭',
  '😱',
  '🤯',
  '😎',
  '🥲',
  '😤',
  '🤡',
  '💀',
  '👀',
  '🔥',
  '💯',
  '✨',
  '🎉',
  '❤️',
  '👍',
  '👏',
  '🙏',
  '🤔',
  '😍',
  '🥳',
  '😴',
  '🤦',
  '🚀',
  '⚡',
  '💥',
  '❗',
  '❓',
  '✅',
] as const
