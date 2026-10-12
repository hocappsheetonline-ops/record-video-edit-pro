/** Hiệu ứng hình áp lên một khoảng thời gian của video xuất (kiểu CapCut "Hiệu ứng"). */
export const EFFECT_KINDS = [
  'shake',
  'glitch',
  'vhs',
  'bw',
  'vintage',
  'vignette',
  'blur',
  'flash',
  'pulse',
  'confetti',
] as const
export type EffectKind = (typeof EFFECT_KINDS)[number]

export interface EffectRegion {
  id: string
  kind: EffectKind
  /** Khoảng trên video xuất (ms). */
  start: number
  end: number
  /** Độ mạnh 0..1. */
  intensity: number
}

export interface ActiveEffect {
  kind: EffectKind
  intensity: number
  /** Thời gian đã chạy kể từ đầu hiệu ứng (ms) — cho chuyển động theo thời gian. */
  local: number
  /** Tiến trình 0..1 qua cả hiệu ứng. */
  progress: number
}

export const DEFAULT_EFFECT_MS = 2000
export const MIN_REGION_MS = 200

let counter = 0
export function newEffectId(): string {
  counter += 1
  return `e${Date.now().toString(36)}${counter}`
}

/** Các hiệu ứng đang chạy tại thời điểm xuất `t`, theo thứ tự thêm vào. */
export function effectsAt(effects: readonly EffectRegion[], t: number): ActiveEffect[] {
  return effects
    .filter((e) => t >= e.start && t < e.end && e.intensity > 0)
    .map((e) => ({
      kind: e.kind,
      intensity: e.intensity,
      local: t - e.start,
      progress: (t - e.start) / (e.end - e.start),
    }))
}

/** Kéo một khoảng thời gian trên timeline (di chuyển hoặc kéo mép), luôn nằm trong video. */
export function dragRegion<T extends { start: number; end: number }>(
  origin: T,
  mode: 'move' | 'start' | 'end',
  delta: number,
  total: number,
  min = MIN_REGION_MS,
): T {
  if (mode === 'move') {
    const shift = Math.min(Math.max(delta, -origin.start), total - origin.end)
    return { ...origin, start: origin.start + shift, end: origin.end + shift }
  }
  if (mode === 'start')
    return { ...origin, start: Math.min(origin.end - min, Math.max(0, origin.start + delta)) }
  return { ...origin, end: Math.max(origin.start + min, Math.min(total, origin.end + delta)) }
}

export function parseEffects(value: unknown): EffectRegion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v): EffectRegion[] => {
    if (typeof v !== 'object' || v === null) return []
    const e = v as Record<string, unknown>
    if (typeof e.id !== 'string' || !EFFECT_KINDS.includes(e.kind as EffectKind)) return []
    const start = typeof e.start === 'number' && e.start >= 0 ? e.start : NaN
    const end = typeof e.end === 'number' ? e.end : NaN
    if (!(end - start >= MIN_REGION_MS)) return []
    const intensity =
      typeof e.intensity === 'number' && Number.isFinite(e.intensity)
        ? Math.min(1, Math.max(0, e.intensity))
        : 0.7
    return [{ id: e.id, kind: e.kind as EffectKind, start, end, intensity }]
  })
}
