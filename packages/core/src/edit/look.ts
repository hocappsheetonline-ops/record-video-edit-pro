/** Bộ lọc màu và điều chỉnh hình (kiểu CapCut: Bộ lọc + Điều chỉnh). */

export const FILTER_PRESETS = [
  'none',
  'cinematic',
  'vintage',
  'cold',
  'warm',
  'bw',
  'fade',
  'vivid',
  'noir',
  'pastel',
  'tealOrange',
  'sunset',
] as const
export type FilterPreset = (typeof FILTER_PRESETS)[number]

export const ADJUST_KEYS = [
  'exposure',
  'brightness',
  'contrast',
  'saturation',
  'temperature',
  'tint',
  'highlights',
  'shadows',
  'sharpen',
  'vignette',
  'grain',
] as const
export type AdjustKey = (typeof ADJUST_KEYS)[number]
/** Các giá trị -1..1, riêng sharpen / vignette / grain 0..1. */
export type Adjust = Record<AdjustKey, number>

/** Điều chỉnh chỉ có chiều dương (0..1). */
export const POSITIVE_ADJUST: readonly AdjustKey[] = ['sharpen', 'vignette', 'grain']

export interface Look {
  filter: FilterPreset
  /** Độ mạnh của bộ lọc 0..1. */
  intensity: number
  adjust: Adjust
}

export const DEFAULT_ADJUST: Adjust = Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0])) as Adjust
export const DEFAULT_LOOK: Look = { filter: 'none', intensity: 1, adjust: { ...DEFAULT_ADJUST } }

interface Preset extends Partial<Adjust> {
  sepia?: number
  hue?: number
}

/** Công thức từng bộ lọc (cộng vào điều chỉnh, nhân theo độ mạnh). */
export const PRESETS: Record<FilterPreset, Preset> = {
  none: {},
  cinematic: {
    contrast: 0.25,
    saturation: -0.15,
    temperature: -0.12,
    shadows: -0.1,
    vignette: 0.4,
  },
  vintage: {
    sepia: 0.35,
    contrast: -0.1,
    saturation: -0.25,
    temperature: 0.25,
    grain: 0.35,
    vignette: 0.3,
  },
  cold: { temperature: -0.5, saturation: -0.1, brightness: 0.05 },
  warm: { temperature: 0.5, saturation: 0.1 },
  bw: { saturation: -1, contrast: 0.15 },
  fade: { contrast: -0.3, brightness: 0.08, saturation: -0.2, shadows: 0.3 },
  vivid: { saturation: 0.5, contrast: 0.15 },
  noir: { saturation: -1, contrast: 0.5, vignette: 0.6, brightness: -0.05 },
  pastel: { saturation: -0.3, brightness: 0.12, contrast: -0.2, tint: 0.1 },
  tealOrange: { temperature: 0.15, tint: -0.1, contrast: 0.2, saturation: 0.2, hue: -8 },
  sunset: { temperature: 0.6, tint: 0.2, saturation: 0.15, vignette: 0.25 },
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function isDefaultLook(look: Look | undefined): boolean {
  return (
    !look ||
    ((look.filter === 'none' || look.intensity <= 0) &&
      ADJUST_KEYS.every((k) => look.adjust[k] === 0))
  )
}

export function parseLook(value: unknown): Look {
  if (typeof value !== 'object' || value === null)
    return { ...DEFAULT_LOOK, adjust: { ...DEFAULT_ADJUST } }
  const v = value as Record<string, unknown>
  const a =
    typeof v.adjust === 'object' && v.adjust !== null ? (v.adjust as Record<string, unknown>) : {}
  const num = (x: unknown, fallback: number, min: number, max: number) =>
    typeof x === 'number' && Number.isFinite(x) ? clamp(x, min, max) : fallback
  return {
    filter: FILTER_PRESETS.includes(v.filter as FilterPreset) ? (v.filter as FilterPreset) : 'none',
    intensity: num(v.intensity, 1, 0, 1),
    adjust: Object.fromEntries(
      ADJUST_KEYS.map((k) => [k, num(a[k], 0, POSITIVE_ADJUST.includes(k) ? 0 : -1, 1)]),
    ) as Adjust,
  }
}

/** Thông số cuối cùng sau khi cộng bộ lọc (theo độ mạnh) với điều chỉnh của người dùng. */
export function effectiveAdjust(look: Look): Adjust & { sepia: number; hue: number } {
  const p = PRESETS[look.filter]
  const k = look.filter === 'none' ? 0 : look.intensity
  const out = { sepia: (p.sepia ?? 0) * k, hue: (p.hue ?? 0) * k } as Adjust & {
    sepia: number
    hue: number
  }
  for (const key of ADJUST_KEYS) {
    const min = POSITIVE_ADJUST.includes(key) ? 0 : -1
    out[key] = clamp((p[key] ?? 0) * k + look.adjust[key], min, 1)
  }
  return out
}

/** Cách vẽ một "look": bộ lọc CSS cho canvas và các lớp phủ màu / viền tối / hạt nhiễu. */
export interface LookLayers {
  /** Chuỗi `ctx.filter` ('none' nếu không cần). */
  css: string
  /** Nhiệt độ màu -1 (lạnh) .. 1 (ấm): phủ màu cam / xanh kiểu soft-light. */
  temperature: number
  /** Sắc độ -1 (xanh lá) .. 1 (hồng tím). */
  tint: number
  /** Nâng (dương) / dìm (âm) vùng sáng và vùng tối. */
  highlights: number
  shadows: number
  vignette: number
  grain: number
  sharpen: number
}

const fmt = (v: number) => Number(v.toFixed(3))

export function lookLayers(look: Look | undefined): LookLayers | null {
  if (!look || isDefaultLook(look)) return null
  const e = effectiveAdjust(look)
  const brightness = fmt(Math.max(0, 1 + 0.5 * e.brightness + 0.6 * e.exposure))
  const contrast = fmt(Math.max(0, 1 + 0.6 * e.contrast))
  const saturate = fmt(Math.max(0, 1 + e.saturation))
  const parts = [
    brightness !== 1 ? `brightness(${brightness})` : '',
    contrast !== 1 ? `contrast(${contrast})` : '',
    saturate !== 1 ? `saturate(${saturate})` : '',
    e.sepia > 0 ? `sepia(${fmt(e.sepia)})` : '',
    e.hue !== 0 ? `hue-rotate(${fmt(e.hue)}deg)` : '',
  ].filter(Boolean)
  return {
    css: parts.length ? parts.join(' ') : 'none',
    temperature: e.temperature,
    tint: e.tint,
    highlights: e.highlights,
    shadows: e.shadows,
    vignette: e.vignette,
    grain: e.grain,
    sharpen: e.sharpen,
  }
}
