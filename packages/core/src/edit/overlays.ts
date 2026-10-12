import { dragRegion } from './effects'
import type { AudioClip } from './audio-clips'
import { isDefaultLook, parseLook, type Look } from './look'

/**
 * Lớp nổi trên video (kiểu CapCut "Văn bản" / "Nhãn dán" / "Lớp phủ"): chữ, emoji, ảnh/GIF và
 * video meme (có tiếng, xóa được phông xanh).
 */
export const OVERLAY_KINDS = ['text', 'emoji', 'image', 'video'] as const
export type OverlayKind = (typeof OVERLAY_KINDS)[number]

export const TEXT_STYLES = ['meme', 'title', 'bubble', 'neon'] as const
export type TextStyle = (typeof TEXT_STYLES)[number]

export const OVERLAY_ANIMATIONS = ['none', 'pop', 'bounce', 'shake', 'fade', 'slide'] as const
export type OverlayAnimation = (typeof OVERLAY_ANIMATIONS)[number]

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
  animation: OverlayAnimation
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
}

/** Màu phông có sẵn để xóa: xanh lá (phổ biến nhất ở video meme), xanh dương, đen, trắng. */
export const KEY_COLORS = ['#00ff00', '#0000ff', '#000000', '#ffffff'] as const

export const DEFAULT_OVERLAY_MS = 3000

let counter = 0
export function newOverlayId(): string {
  counter += 1
  return `o${Date.now().toString(36)}${counter}`
}

/** Biến đổi do hiệu ứng xuất hiện / chuyển động tại thời điểm `local` (ms từ lúc hiện). */
export interface OverlayMotion {
  scale: number
  opacity: number
  /** Dịch chuyển, tỉ lệ theo chiều cao khung. */
  dx: number
  dy: number
  /** Góc xoay thêm (độ). */
  rotate: number
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

export function overlayMotion(
  o: Pick<Overlay, 'animation' | 'start' | 'end'>,
  t: number,
): OverlayMotion {
  const local = t - o.start
  const remaining = o.end - t
  const base: OverlayMotion = { scale: 1, opacity: 1, dx: 0, dy: 0, rotate: 0 }
  switch (o.animation) {
    case 'pop': {
      const p = Math.min(1, local / 350)
      return { ...base, scale: Math.max(0, easeOutBack(p)) }
    }
    case 'bounce':
      return { ...base, dy: -Math.abs(Math.sin((local / 1000) * Math.PI * 2)) * 0.03 }
    case 'shake':
      return { ...base, rotate: Math.sin((local / 1000) * Math.PI * 14) * 6 }
    case 'fade':
      return { ...base, opacity: Math.max(0, Math.min(1, local / 300, remaining / 300)) }
    case 'slide': {
      const p = Math.min(1, local / 400)
      return { ...base, dx: -(1 - easeOutBack(p)) * 0.6, opacity: Math.min(1, p * 2) }
    }
    default:
      return base
  }
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
    const sourceDuration = num(o.sourceDuration, 0, 0, 24 * 3600_000)
    if (kind === 'video' && sourceDuration <= 0) return []
    const look =
      (kind === 'image' || kind === 'video') && o.look !== undefined ? parseLook(o.look) : undefined
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
        animation: OVERLAY_ANIMATIONS.includes(o.animation as OverlayAnimation)
          ? (o.animation as OverlayAnimation)
          : 'pop',
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
