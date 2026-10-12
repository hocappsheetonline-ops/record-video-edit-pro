/** Chữ, sticker (emoji) và ảnh meme nổi trên video (kiểu CapCut "Văn bản" / "Nhãn dán"). */
export const OVERLAY_KINDS = ['text', 'emoji', 'image'] as const
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
  /** Cỡ: chiều cao chữ / emoji / ảnh, tỉ lệ theo chiều cao khung (0.03..1). */
  size: number
  /** Góc xoay (độ). */
  rotation: number
  animation: OverlayAnimation
  /** Chữ (kind = text) hoặc emoji (kind = emoji). */
  text: string
  style: TextStyle
  color: string
  /** File ảnh trong thư mục dự án (kind = image). */
  file: string
  /** Tỉ lệ rộng/cao của ảnh (để vẽ đúng hình). */
  aspect: number
}

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
    if (kind === 'image' && !file) return []
    return [
      {
        id: o.id,
        kind,
        start,
        end,
        x: num(o.x, 0.5, 0, 1),
        y: num(o.y, 0.5, 0, 1),
        size: num(o.size, 0.12, 0.03, 1),
        rotation: num(o.rotation, 0, -180, 180),
        animation: OVERLAY_ANIMATIONS.includes(o.animation as OverlayAnimation)
          ? (o.animation as OverlayAnimation)
          : 'pop',
        text: typeof o.text === 'string' ? o.text.slice(0, 200) : '',
        style: TEXT_STYLES.includes(o.style as TextStyle) ? (o.style as TextStyle) : 'meme',
        color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#ffffff',
        file,
        aspect: num(o.aspect, 1, 0.05, 20),
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

/** Câu meme / chữ nổi bật hay dùng (chỉ là chữ, không vướng bản quyền). */
export const MEME_PHRASES = [
  'Ủa alo?',
  'Hết cứu',
  'Đỉnh nóc kịch trần',
  'Ối dồi ôi',
  'Chấm hết',
  'Khoan đã…',
  'Plot twist',
  'Bruh',
  'Wait for it…',
  'Mind blown',
  'Easy peasy',
  'POV:',
] as const
