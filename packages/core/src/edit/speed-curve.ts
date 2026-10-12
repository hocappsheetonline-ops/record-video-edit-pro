/**
 * Đường cong tốc độ (kiểu CapCut "Curve"): tốc độ thay đổi dần trong clip. Tốc độ là hàm tuyến
 * tính từng đoạn của vị trí phát `u` (0 = đầu clip, 1 = cuối clip, tính theo thời gian nguồn).
 * Thời gian xuất của một đoạn nguồn là tích phân ds / v(s) — có công thức đóng cho đoạn tuyến tính.
 */

export const SPEED_CURVE_PRESETS = [
  'montage',
  'hero',
  'bullet',
  'jumpCut',
  'flashIn',
  'flashOut',
] as const
export type SpeedCurvePreset = (typeof SPEED_CURVE_PRESETS)[number] | 'custom'

export interface CurvePoint {
  /** Vị trí phát 0..1. */
  u: number
  /** Tốc độ tại đó (0.1..10). */
  v: number
}

export interface SpeedCurve {
  preset: SpeedCurvePreset
  points: CurvePoint[]
}

export const MIN_CURVE_SPEED = 0.1
export const MAX_CURVE_SPEED = 10

const P = (u: number, v: number): CurvePoint => ({ u, v })

/** Các mẫu có sẵn (gần giống CapCut). */
export const CURVE_PRESETS: Record<(typeof SPEED_CURVE_PRESETS)[number], CurvePoint[]> = {
  montage: [P(0, 1), P(0.3, 3), P(0.5, 0.5), P(0.7, 3), P(1, 1)],
  hero: [P(0, 2), P(0.4, 2), P(0.5, 0.3), P(0.6, 2), P(1, 2)],
  bullet: [P(0, 3), P(0.35, 3), P(0.5, 0.25), P(0.65, 3), P(1, 3)],
  jumpCut: [P(0, 1), P(0.45, 1), P(0.5, 8), P(0.55, 1), P(1, 1)],
  flashIn: [P(0, 6), P(0.3, 3), P(0.6, 1), P(1, 1)],
  flashOut: [P(0, 1), P(0.4, 1), P(0.7, 3), P(1, 6)],
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

export function presetCurve(preset: (typeof SPEED_CURVE_PRESETS)[number]): SpeedCurve {
  return { preset, points: CURVE_PRESETS[preset].map((p) => ({ ...p })) }
}

/** Giữ điểm trong khung, sắp theo u, điểm đầu ở 0 và điểm cuối ở 1. */
export function normalizeCurve(curve: SpeedCurve): SpeedCurve {
  const pts = curve.points
    .filter((p) => Number.isFinite(p.u) && Number.isFinite(p.v))
    .map((p) => ({ u: clamp(p.u, 0, 1), v: clamp(p.v, MIN_CURVE_SPEED, MAX_CURVE_SPEED) }))
    .sort((a, b) => a.u - b.u)
  if (pts.length === 0) return { preset: curve.preset, points: [P(0, 1), P(1, 1)] }
  if (pts[0]!.u > 0) pts.unshift({ u: 0, v: pts[0]!.v })
  else pts[0]!.u = 0
  if (pts[pts.length - 1]!.u < 1) pts.push({ u: 1, v: pts[pts.length - 1]!.v })
  else pts[pts.length - 1]!.u = 1
  return { preset: curve.preset, points: pts }
}

export function parseSpeedCurve(value: unknown): SpeedCurve | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.points) || v.points.length < 2) return undefined
  const preset = (SPEED_CURVE_PRESETS as readonly string[]).includes(v.preset as string)
    ? (v.preset as SpeedCurvePreset)
    : 'custom'
  const points = v.points.flatMap((p): CurvePoint[] =>
    typeof p === 'object' && p !== null && typeof (p as CurvePoint).u === 'number'
      ? [{ u: (p as CurvePoint).u, v: Number((p as CurvePoint).v) }]
      : [],
  )
  if (points.length < 2) return undefined
  return normalizeCurve({ preset, points })
}

/** Tốc độ tại vị trí phát `u`. */
export function curveSpeedAt(curve: SpeedCurve, u: number): number {
  const pts = curve.points
  const x = clamp(u, 0, 1)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (x <= b.u) return b.u > a.u ? a.v + ((b.v - a.v) * (x - a.u)) / (b.u - a.u) : b.v
  }
  return pts[pts.length - 1]!.v
}

/** Thời gian xuất (ms) để phát từ u0 tới u1 trong một đoạn tuyến tính, với clip dài `len` ms nguồn. */
function segmentTime(a: CurvePoint, b: CurvePoint, u0: number, u1: number, len: number): number {
  const du = b.u - a.u
  const k = du > 0 ? (b.v - a.v) / du : 0
  const v0 = a.v + k * (u0 - a.u)
  const v1 = a.v + k * (u1 - a.u)
  if (Math.abs(k) < 1e-9) return ((u1 - u0) * len) / v0
  return (len * Math.log(v1 / v0)) / k
}

/** Thời gian xuất (ms) từ đầu clip tới vị trí phát `along` (ms nguồn) — clip dài `len` ms nguồn. */
export function curveOutputAt(curve: SpeedCurve, len: number, along: number): number {
  if (len <= 0) return 0
  const target = clamp(along / len, 0, 1)
  const pts = curve.points
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (target <= a.u) break
    total += segmentTime(a, b, a.u, Math.min(target, b.u), len)
  }
  return total
}

export function curveDuration(curve: SpeedCurve, len: number): number {
  return curveOutputAt(curve, len, len)
}

/** Ngược lại: vị trí phát (ms nguồn) sau `offset` ms trên video xuất tính từ đầu clip. */
export function curveAlongAt(curve: SpeedCurve, len: number, offset: number): number {
  if (len <= 0 || offset <= 0) return 0
  const pts = curve.points
  let left = offset
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const span = segmentTime(a, b, a.u, b.u, len)
    if (left > span) {
      left -= span
      continue
    }
    const du = b.u - a.u
    const k = du > 0 ? (b.v - a.v) / du : 0
    const u =
      Math.abs(k) < 1e-9
        ? a.u + (left * a.v) / len
        : a.u + (a.v * Math.exp((k * left) / len) - a.v) / k
    return clamp(u, 0, 1) * len
  }
  return len
}

/** Phần đường cong từ u = `from` tới `to`, kéo giãn lại thành 0..1 (khi tách / cắt clip). */
export function subCurve(curve: SpeedCurve, from: number, to: number): SpeedCurve {
  const a = clamp(Math.min(from, to), 0, 1)
  const b = clamp(Math.max(from, to), 0, 1)
  const span = Math.max(1e-6, b - a)
  const inner = curve.points.filter((p) => p.u > a && p.u < b)
  const points = [
    { u: 0, v: curveSpeedAt(curve, a) },
    ...inner.map((p) => ({ u: (p.u - a) / span, v: p.v })),
    { u: 1, v: curveSpeedAt(curve, b) },
  ]
  return { preset: 'custom', points }
}
