/** Điểm đánh dấu trên timeline (thời gian trên video xuất). */
export interface Marker {
  id: string
  t: number
  label: string
  color: MarkerColor
}

export const MARKER_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7'] as const
export type MarkerColor = (typeof MARKER_COLORS)[number]

let seq = 0
export const newMarkerId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Đọc từ file: bỏ marker sai, kẹp trong thời lượng, sắp theo thời gian. */
export function parseMarkers(value: unknown, duration: number): Marker[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((m, i): Marker[] => {
      if (!isObj(m) || typeof m.t !== 'number' || !Number.isFinite(m.t)) return []
      return [
        {
          id: typeof m.id === 'string' && m.id ? m.id.slice(0, 40) : `m${i}`,
          t: Math.round(Math.min(Math.max(0, m.t), Math.max(0, duration))),
          label: typeof m.label === 'string' ? m.label.slice(0, 100) : '',
          color: (MARKER_COLORS as readonly unknown[]).includes(m.color)
            ? (m.color as MarkerColor)
            : MARKER_COLORS[0],
        },
      ]
    })
    .sort((a, b) => a.t - b.t)
}

/** Thêm marker tại `t` (không thêm trùng chỗ trong vòng 50ms); giữ thứ tự thời gian. */
export function addMarker(markers: readonly Marker[], t: number, label = ''): Marker[] {
  if (markers.some((m) => Math.abs(m.t - t) < 50)) return [...markers]
  const color = MARKER_COLORS[markers.length % MARKER_COLORS.length]!
  return [...markers, { id: newMarkerId(), t: Math.round(t), label, color }].sort(
    (a, b) => a.t - b.t,
  )
}

/** Marker kế tiếp (`dir` = 1) hoặc trước đó (`dir` = -1) so với `t`. */
export function markerNear(markers: readonly Marker[], t: number, dir: 1 | -1): Marker | null {
  const list = dir > 0 ? markers.filter((m) => m.t > t + 1) : markers.filter((m) => m.t < t - 1)
  if (list.length === 0) return null
  return dir > 0 ? list[0]! : list[list.length - 1]!
}

function stamp(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/**
 * Chương cho mô tả YouTube từ các marker: mỗi dòng "m:ss Tên". YouTube cần chương đầu ở 0:00,
 * nên thêm `intro` nếu marker đầu không ở 0. Marker không tên thì đặt "Phần n".
 */
export function chaptersText(
  markers: readonly Marker[],
  names: { intro: string; part: (n: number) => string },
): string {
  const list = [...markers].sort((a, b) => a.t - b.t)
  const lines: string[] = []
  if (list.length === 0 || list[0]!.t >= 1000) lines.push(`0:00 ${names.intro}`)
  list.forEach((m, i) => {
    const t = lines.length === 0 ? 0 : m.t
    lines.push(`${stamp(t)} ${m.label.trim() || names.part(i + 1)}`)
  })
  return lines.join('\n')
}
