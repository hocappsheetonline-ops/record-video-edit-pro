/**
 * Kiểu chữ nâng cao (kiểu CapCut "Văn bản"): phông, độ đậm, nghiêng, căn lề, khoảng cách, viền,
 * bóng, nền, chuyển màu, hoạt ảnh chữ, cùng các mẫu chữ có sẵn.
 */

/** Phông đi kèm app (giấy phép OFL, đều có dấu tiếng Việt). */
export const FONTS = [
  { id: 'beVietnamPro', family: 'Be Vietnam Pro' },
  { id: 'inter', family: 'Inter' },
  { id: 'montserrat', family: 'Montserrat' },
  { id: 'oswald', family: 'Oswald' },
  { id: 'anton', family: 'Anton' },
  { id: 'bangers', family: 'Bangers' },
  { id: 'lobster', family: 'Lobster' },
  { id: 'pacifico', family: 'Pacifico' },
  { id: 'robotoMono', family: 'Roboto Mono' },
  { id: 'playfair', family: 'Playfair Display' },
] as const
export type FontId = (typeof FONTS)[number]['id']
export const FONT_IDS = FONTS.map((f) => f.id) as FontId[]

/** Tên phông CSS kèm phông dự phòng của hệ điều hành. */
export function fontFamily(id: FontId): string {
  const family = FONTS.find((f) => f.id === id)?.family ?? 'Be Vietnam Pro'
  return `"${family}", "Segoe UI", system-ui, sans-serif`
}

export const TEXT_ANIMS = ['none', 'typewriter', 'wordPop', 'wave', 'glitch', 'slideWords'] as const
export type TextAnim = (typeof TEXT_ANIMS)[number]

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const
export type TextAlign = (typeof TEXT_ALIGNS)[number]

export interface TextStroke {
  /** Độ dày viền theo cỡ chữ (0..0.3, 0 = không viền). */
  width: number
  color: string
}
export interface TextShadow {
  /** Độ nhòe theo cỡ chữ (0..1, 0 = không bóng). */
  blur: number
  color: string
  /** Lệch bóng theo cỡ chữ (-0.5..0.5). */
  dx: number
  dy: number
}
export interface TextBackground {
  color: string
  /** 0 = không có nền. */
  opacity: number
  /** Bo góc theo nửa chiều cao hộp (0..1). */
  radius: number
  /** Lề trong theo cỡ chữ (0..1). */
  padding: number
}
export interface TextGradient {
  from: string
  to: string
  /** Góc chuyển màu (độ). */
  angle: number
}

export interface TextStyleProps {
  font: FontId
  weight: 400 | 700 | 900
  italic: boolean
  uppercase: boolean
  align: TextAlign
  /** Chiều cao dòng theo cỡ chữ (0.8..2). */
  lineHeight: number
  /** Giãn chữ theo cỡ chữ (-0.1..0.5). */
  letterSpacing: number
  color: string
  stroke: TextStroke
  shadow: TextShadow
  background: TextBackground
  gradient?: TextGradient
  anim: TextAnim
}

export const DEFAULT_TEXT_STYLE: TextStyleProps = {
  font: 'beVietnamPro',
  weight: 700,
  italic: false,
  uppercase: false,
  align: 'center',
  lineHeight: 1.2,
  letterSpacing: 0,
  color: '#ffffff',
  stroke: { width: 0, color: '#000000' },
  shadow: { blur: 0, color: '#000000', dx: 0, dy: 0 },
  background: { color: '#000000', opacity: 0, radius: 0.3, padding: 0.3 },
  anim: 'none',
}

type StylePatch = Partial<Omit<TextStyleProps, 'stroke' | 'shadow' | 'background'>> & {
  stroke?: Partial<TextStroke>
  shadow?: Partial<TextShadow>
  background?: Partial<TextBackground>
}

export function withTextStyle(base: TextStyleProps, patch: StylePatch): TextStyleProps {
  return {
    ...base,
    ...patch,
    stroke: { ...base.stroke, ...patch.stroke },
    shadow: { ...base.shadow, ...patch.shadow },
    background: { ...base.background, ...patch.background },
  }
}

const T = (id: string, patch: StylePatch) => ({
  id,
  style: withTextStyle(DEFAULT_TEXT_STYLE, patch),
})

/** 24 mẫu chữ. Bốn mẫu đầu ứng với kiểu chữ cũ (meme / tiêu đề / bong bóng / neon). */
export const TEXT_TEMPLATES = [
  T('meme', {
    font: 'anton',
    weight: 400,
    uppercase: true,
    stroke: { width: 0.14, color: '#000000' },
  }),
  T('title', {
    font: 'beVietnamPro',
    weight: 900,
    shadow: { blur: 0.25, color: '#000000', dy: 0.06 },
  }),
  T('bubble', {
    font: 'beVietnamPro',
    color: '#111111',
    background: { color: '#ffffff', opacity: 1, radius: 1, padding: 0.5 },
  }),
  T('neon', {
    font: 'montserrat',
    shadow: { blur: 0.6, color: '#22d3ee' },
    stroke: { width: 0.05, color: '#22d3ee' },
  }),
  T('subtitle', {
    font: 'inter',
    weight: 700,
    background: { color: '#000000', opacity: 0.65, radius: 0.3, padding: 0.35 },
  }),
  T('news', {
    font: 'oswald',
    weight: 700,
    uppercase: true,
    background: { color: '#dc2626', opacity: 1, radius: 0, padding: 0.4 },
  }),
  T('comic', {
    font: 'bangers',
    weight: 400,
    color: '#facc15',
    stroke: { width: 0.12, color: '#000000' },
    shadow: { blur: 0, color: '#000000', dx: 0.06, dy: 0.06 },
  }),
  T('handwritten', { font: 'pacifico', weight: 400, shadow: { blur: 0.2, color: '#000000' } }),
  T('retro', {
    font: 'lobster',
    weight: 400,
    color: '#fde68a',
    stroke: { width: 0.06, color: '#7c2d12' },
  }),
  T('elegant', { font: 'playfair', weight: 700, italic: true, letterSpacing: 0.05 }),
  T('code', {
    font: 'robotoMono',
    weight: 700,
    color: '#22c55e',
    background: { color: '#0f172a', opacity: 0.9, radius: 0.2, padding: 0.35 },
  }),
  T('sunset', {
    font: 'montserrat',
    weight: 900,
    gradient: { from: '#f59e0b', to: '#db2777', angle: 90 },
    stroke: { width: 0.04, color: '#ffffff' },
  }),
  T('ocean', {
    font: 'montserrat',
    weight: 900,
    gradient: { from: '#22d3ee', to: '#2563eb', angle: 90 },
  }),
  T('gold', {
    font: 'oswald',
    weight: 700,
    uppercase: true,
    letterSpacing: 0.08,
    gradient: { from: '#fde68a', to: '#b45309', angle: 180 },
    shadow: { blur: 0.2, color: '#000000', dy: 0.04 },
  }),
  T('label', {
    font: 'inter',
    weight: 700,
    color: '#ffffff',
    background: { color: '#2563eb', opacity: 1, radius: 1, padding: 0.45 },
  }),
  T('warning', {
    font: 'oswald',
    weight: 700,
    uppercase: true,
    color: '#111111',
    background: { color: '#facc15', opacity: 1, radius: 0.15, padding: 0.4 },
  }),
  T('outline', {
    font: 'anton',
    weight: 400,
    uppercase: true,
    color: '#000000',
    stroke: { width: 0.08, color: '#ffffff' },
  }),
  T('shadowPop', {
    font: 'beVietnamPro',
    weight: 900,
    color: '#ffffff',
    shadow: { blur: 0, color: '#db2777', dx: 0.08, dy: 0.08 },
  }),
  T('karaoke', {
    font: 'beVietnamPro',
    weight: 900,
    color: '#facc15',
    stroke: { width: 0.1, color: '#000000' },
    anim: 'wordPop',
  }),
  T('typewriter', {
    font: 'robotoMono',
    weight: 400,
    color: '#ffffff',
    anim: 'typewriter',
    background: { color: '#000000', opacity: 0.5, radius: 0.1, padding: 0.3 },
  }),
  T('wave', {
    font: 'bangers',
    weight: 400,
    color: '#a3e635',
    stroke: { width: 0.08, color: '#14532d' },
    anim: 'wave',
  }),
  T('glitch', {
    font: 'oswald',
    weight: 700,
    uppercase: true,
    color: '#ffffff',
    shadow: { blur: 0, color: '#06b6d4', dx: -0.04, dy: 0 },
    anim: 'glitch',
  }),
  T('minimal', { font: 'inter', weight: 400, letterSpacing: 0.12, uppercase: true }),
  T('tiktok', {
    font: 'beVietnamPro',
    weight: 900,
    color: '#ffffff',
    stroke: { width: 0.09, color: '#000000' },
    anim: 'slideWords',
  }),
] as const
export type TextTemplateId = (typeof TEXT_TEMPLATES)[number]['id']

export function templateStyle(id: string): TextStyleProps {
  return (TEXT_TEMPLATES.find((t) => t.id === id) ?? TEXT_TEMPLATES[0]).style
}

/** Kiểu chữ cũ (`style` + `color`) → kiểu chữ mới (để vẽ dự án cũ y như trước). */
export function legacyTextStyle(style: string, color: string): TextStyleProps {
  const base = templateStyle(style)
  switch (style) {
    case 'bubble':
      // Bong bóng cũ: màu đã chọn là màu nền, chữ đen / trắng tùy độ sáng nền.
      return withTextStyle(base, {
        color: readableOn(color),
        background: { color, opacity: 1 },
      })
    case 'neon':
      return withTextStyle(base, {
        color: '#ffffff',
        shadow: { color },
        stroke: { color },
      })
    default:
      return { ...base, color }
  }
}

/** Chữ đen hoặc trắng cho dễ đọc trên nền `hex`. */
export function readableOn(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(n)) return '#ffffff'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff'
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d
const hex = (v: unknown, d: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

export function parseTextStyle(value: unknown): TextStyleProps | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const d = DEFAULT_TEXT_STYLE
  const stroke = obj(v.stroke)
  const shadow = obj(v.shadow)
  const bg = obj(v.background)
  const gradient = obj(v.gradient)
  return {
    font: FONT_IDS.includes(v.font as FontId) ? (v.font as FontId) : d.font,
    weight: v.weight === 400 || v.weight === 900 ? v.weight : 700,
    italic: v.italic === true,
    uppercase: v.uppercase === true,
    align: TEXT_ALIGNS.includes(v.align as TextAlign) ? (v.align as TextAlign) : 'center',
    lineHeight: num(v.lineHeight, d.lineHeight, 0.8, 2),
    letterSpacing: num(v.letterSpacing, 0, -0.1, 0.5),
    color: hex(v.color, d.color),
    stroke: { width: num(stroke.width, 0, 0, 0.3), color: hex(stroke.color, '#000000') },
    shadow: {
      blur: num(shadow.blur, 0, 0, 1),
      color: hex(shadow.color, '#000000'),
      dx: num(shadow.dx, 0, -0.5, 0.5),
      dy: num(shadow.dy, 0, -0.5, 0.5),
    },
    background: {
      color: hex(bg.color, '#000000'),
      opacity: num(bg.opacity, 0, 0, 1),
      radius: num(bg.radius, d.background.radius, 0, 1),
      padding: num(bg.padding, d.background.padding, 0, 1),
    },
    ...(typeof v.gradient === 'object' && v.gradient !== null
      ? {
          gradient: {
            from: hex(gradient.from, '#ffffff'),
            to: hex(gradient.to, '#000000'),
            angle: num(gradient.angle, 90, 0, 360),
          },
        }
      : {}),
    anim: TEXT_ANIMS.includes(v.anim as TextAnim) ? (v.anim as TextAnim) : 'none',
  }
}

/** Chữ hiện được (máy đánh chữ) và biến đổi của từng từ tại `local` ms từ lúc lớp hiện. */
export interface WordMotion {
  /** Từ thứ mấy (trong toàn đoạn chữ). */
  index: number
  /** Độ hiện 0..1, cỡ, dịch dọc (theo cỡ chữ), dịch ngang (theo cỡ chữ). */
  opacity: number
  scale: number
  dy: number
  dx: number
}

/** Mỗi từ xuất hiện sau từ trước chừng này ms (wordPop, slideWords). */
export const WORD_STEP_MS = 180

/** Số ký tự đang hiện của hiệu ứng máy đánh chữ (khoảng 18 ký tự / giây, xong trước 80% lớp). */
export function typewriterChars(total: number, local: number, duration: number): number {
  if (total <= 0) return 0
  const perChar = Math.min(55, (duration * 0.8) / total)
  return Math.max(0, Math.min(total, Math.floor(local / Math.max(1, perChar)) + 1))
}

/** Biến đổi của từ thứ `index` theo hiệu ứng chữ. */
export function wordMotion(anim: TextAnim, index: number, local: number): WordMotion {
  const base: WordMotion = { index, opacity: 1, scale: 1, dy: 0, dx: 0 }
  const t = local - index * WORD_STEP_MS
  switch (anim) {
    case 'wordPop': {
      if (t < 0) return { ...base, opacity: 0, scale: 0 }
      const p = Math.min(1, t / 200)
      // Bật lên hơi quá cỡ rồi về đúng cỡ.
      return { ...base, scale: p < 1 ? 0.4 + 0.9 * p - 0.3 * p * p : 1 }
    }
    case 'slideWords': {
      if (t < 0) return { ...base, opacity: 0 }
      const p = Math.min(1, t / 250)
      return { ...base, opacity: p, dy: (1 - p) * 0.6 }
    }
    case 'wave':
      return { ...base, dy: Math.sin(local / 180 - index * 0.8) * 0.12 }
    default:
      return base
  }
}
