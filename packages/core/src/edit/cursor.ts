import type { InputEvent, MouseButton } from '../events'
import type { Rect } from '../geometry'
import type { Segment } from '../project'
import { sourceDuration, sourceSegments, wallToSource } from './timeline'

/** Vị trí chuột trong video, chuẩn hóa 0..1 theo vùng quay; `s` là thời gian nguồn (ms). */
export interface CursorPoint {
  s: number
  x: number
  y: number
}

export interface ClickMark extends CursorPoint {
  button: MouseButton
}

export interface CursorTrack {
  /** Bước lấy mẫu đều (ms). */
  stepMs: number
  /** Vị trí đã làm mượt, lấy mẫu đều từ 0 tới hết thời gian nguồn. */
  samples: CursorPoint[]
  clicks: ClickMark[]
  /** Thời điểm nguồn của các lần gõ phím (để zoom khi đang gõ). */
  keys: number[]
  /** Thời điểm chuột di chuyển (để ẩn con trỏ khi đứng yên). */
  moves: number[]
}

export const CURSOR_STEP_MS = 1000 / 60

/**
 * Hệ số lò xo theo độ mượt 0..1: càng mượt thì lò xo càng mềm (con trỏ trôi chậm hơn).
 * Giảm chấn tới hạn (critically damped) nên con trỏ không bị nảy quá đích.
 */
export function springOmega(smoothing: number): number {
  const s = Math.min(1, Math.max(0, smoothing))
  return 40 - s * 32
}

/** Làm mượt chuỗi vị trí bằng lò xo giảm chấn tới hạn (tính sẵn, nên tua tới đâu cũng ra cùng kết quả). */
export function smoothPath(
  raw: readonly CursorPoint[],
  stepMs: number,
  smoothing: number,
): CursorPoint[] {
  if (raw.length === 0 || smoothing <= 0) return raw.map((p) => ({ ...p }))
  const omega = springOmega(smoothing)
  const dt = stepMs / 1000
  // Chia nhỏ bước tính để ổn định với lò xo cứng.
  const substeps = Math.max(1, Math.ceil(omega * dt * 4))
  const h = dt / substeps
  let x = raw[0]!.x
  let y = raw[0]!.y
  let vx = 0
  let vy = 0
  return raw.map((target) => {
    for (let i = 0; i < substeps; i++) {
      vx += (omega * omega * (target.x - x) - 2 * omega * vx) * h
      vy += (omega * omega * (target.y - y) - 2 * omega * vy) * h
      x += vx * h
      y += vy * h
    }
    return { s: target.s, x, y }
  })
}

function interpolate(points: readonly CursorPoint[], s: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0.5, y: 0.5 }
  if (s <= points[0]!.s) return { x: points[0]!.x, y: points[0]!.y }
  const last = points[points.length - 1]!
  if (s >= last.s) return { x: last.x, y: last.y }
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.s <= s) lo = mid
    else hi = mid
  }
  const a = points[lo]!
  const b = points[hi]!
  const k = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

/**
 * Dựng đường đi của con trỏ trong video từ events.jsonl: đổi sang thời gian nguồn,
 * chuẩn hóa theo vùng quay, lấy mẫu đều 60 lần/giây rồi làm mượt.
 */
export function buildCursorTrack(
  events: readonly InputEvent[],
  segments: readonly Segment[],
  captureRect: Rect | null,
  smoothing: number,
): CursorTrack {
  const stepMs = CURSOR_STEP_MS
  const empty: CursorTrack = { stepMs, samples: [], clicks: [], keys: [], moves: [] }
  if (!captureRect || captureRect.width <= 0 || captureRect.height <= 0) return empty
  const list = sourceSegments(segments)
  const norm = (x: number, y: number) => ({
    x: (x - captureRect.x) / captureRect.width,
    y: (y - captureRect.y) / captureRect.height,
  })
  const raw: CursorPoint[] = []
  const clicks: ClickMark[] = []
  const keys: number[] = []
  const moves: number[] = []
  for (const event of [...events].sort((a, b) => a.t - b.t)) {
    const s = wallToSource(list, event.t)
    if (s === null) continue
    if (event.type === 'key') {
      keys.push(s)
      continue
    }
    const p = { s, ...norm(event.x, event.y) }
    raw.push(p)
    if (event.type === 'move') moves.push(s)
    if (event.type === 'down') clicks.push({ ...p, button: event.button })
  }
  if (raw.length === 0) return { ...empty, keys }
  const duration = sourceDuration(segments)
  const uniform: CursorPoint[] = []
  for (let s = 0; s <= duration; s += stepMs) uniform.push({ s, ...interpolate(raw, s) })
  return { stepMs, samples: smoothPath(uniform, stepMs, smoothing), clicks, keys, moves }
}

export function cursorAt(track: CursorTrack, s: number): { x: number; y: number } | null {
  if (track.samples.length === 0) return null
  return interpolate(track.samples, s)
}

/** Hiệu ứng click: tiến độ 0..1 của lần click gần nhất trong `durationMs`, hoặc null. */
export function clickAt(
  track: CursorTrack,
  s: number,
  durationMs = 450,
): { click: ClickMark; progress: number } | null {
  for (let i = track.clicks.length - 1; i >= 0; i--) {
    const click = track.clicks[i]!
    if (click.s > s) continue
    const age = s - click.s
    return age <= durationMs ? { click, progress: age / durationMs } : null
  }
  return null
}

/** Độ hiện của con trỏ 0..1: mờ dần khi chuột đứng yên quá lâu, hiện lại khi di chuyển hoặc click. */
export function cursorOpacity(track: CursorTrack, s: number, idleMs = 2500, fadeMs = 300): number {
  let last = -Infinity
  for (const list of [track.moves, track.clicks.map((c) => c.s)]) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]! <= s) {
        last = Math.max(last, list[i]!)
        break
      }
    }
  }
  if (last === -Infinity) return track.samples.length > 0 ? 1 : 0
  const idle = s - last
  if (idle <= idleMs) return 1
  return Math.max(0, 1 - (idle - idleMs) / fadeMs)
}
