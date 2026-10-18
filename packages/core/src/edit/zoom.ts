import type { CursorTrack } from './cursor'
import { cursorAt, springPath } from './cursor'

export interface ZoomRegion {
  id: string
  /** Thời gian nguồn (ms). */
  start: number
  end: number
  /** Mức phóng to, ví dụ 2 = gấp đôi. */
  scale: number
  /** `follow`: khung nhìn đi theo con trỏ; `fixed`: cố định tại (x, y). */
  mode: 'follow' | 'fixed'
  /** Tâm khung nhìn (0..1) khi `fixed`. */
  x: number
  y: number
}

export interface Camera {
  scale: number
  /** Tâm khung nhìn trong video, chuẩn hóa 0..1. */
  x: number
  y: number
}

export const ZOOM_TRANSITION_MS = 700
export const MIN_ZOOM_MS = 1500
export const DEFAULT_ZOOM_SCALE = 2

let zoomCounter = 0
export function newZoomId(): string {
  zoomCounter += 1
  return `z${Date.now().toString(36)}${zoomCounter.toString(36)}`
}

/** Đường cong chuyển động mượt (nhanh ở giữa, chậm ở hai đầu). */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export interface AutoZoomOptions {
  scale?: number
  /** Hai hoạt động cách nhau ít hơn khoảng này thì gộp chung một lần zoom (ms). */
  clusterGapMs?: number
  /** Zoom bắt đầu trước hoạt động đầu tiên (ms). */
  leadMs?: number
  /** Giữ zoom sau hoạt động cuối cùng (ms). */
  holdMs?: number
  /** Số lần gõ phím tối thiểu trong 2 giây để tính là "đang gõ". */
  typingBurst?: number
}

/**
 * Tự tạo các đoạn zoom: gom các click (và lúc gõ phím liên tục) gần nhau thành cụm,
 * mỗi cụm zoom vào và đi theo con trỏ.
 */
export function generateAutoZooms(
  track: CursorTrack,
  durationMs: number,
  options: AutoZoomOptions = {},
): ZoomRegion[] {
  const scale = options.scale ?? DEFAULT_ZOOM_SCALE
  const gap = options.clusterGapMs ?? 3000
  const lead = options.leadMs ?? 500
  const hold = options.holdMs ?? 1500
  const burst = options.typingBurst ?? 4

  const activity: number[] = track.clicks.map((c) => c.s)
  const keys = [...track.keys].sort((a, b) => a - b)
  for (let i = 0; i + burst - 1 < keys.length; i++) {
    if (keys[i + burst - 1]! - keys[i]! <= 2000) activity.push(keys[i]!, keys[i + burst - 1]!)
  }
  activity.sort((a, b) => a - b)

  const clusters: { start: number; end: number }[] = []
  for (const s of activity) {
    const current = clusters[clusters.length - 1]
    if (current && s - current.end <= gap) current.end = s
    else clusters.push({ start: s, end: s })
  }

  const regions: { start: number; end: number }[] = []
  for (const c of clusters) {
    let start = Math.max(0, c.start - lead)
    let end = Math.min(durationMs, c.end + hold)
    if (end - start < MIN_ZOOM_MS) {
      end = Math.min(durationMs, start + MIN_ZOOM_MS)
      start = Math.max(0, end - MIN_ZOOM_MS)
    }
    const prev = regions[regions.length - 1]
    // Hai lần zoom quá sát nhau thì nối liền, tránh zoom ra rồi vào ngay.
    if (prev && start - prev.end < ZOOM_TRANSITION_MS * 2) prev.end = Math.max(prev.end, end)
    else if (end > start) regions.push({ start, end })
  }

  return regions.map((r) => {
    const p = cursorAt(track, (r.start + r.end) / 2) ?? { x: 0.5, y: 0.5 }
    return {
      id: newZoomId(),
      start: r.start,
      end: r.end,
      scale,
      mode: 'follow' as const,
      x: p.x,
      y: p.y,
    }
  })
}

/**
 * Đường đi rất mượt của con trỏ, dùng cho khung nhìn khi zoom theo con trỏ
 * (khung nhìn di chuyển êm hơn con trỏ thật để người xem không bị chóng mặt).
 */
export function cameraFollowTrack(track: CursorTrack, speed = 0.85): CursorTrack {
  return { ...track, samples: springPath(track.samples, track.stepMs, cameraOmega(speed)) }
}

/** Tốc độ khung nhìn 0..1 → tần số lò xo 2..12 rad/s (0 = lướt rất chậm, 1 = bám sát con trỏ). */
export function cameraOmega(speed: number): number {
  return 2 + Math.min(1, Math.max(0, speed)) * 10
}

/** Giữ tâm khung nhìn để khung không vượt ra ngoài video. */
export function clampCenter(value: number, scale: number, base = 1): number {
  const half = (0.5 * base) / scale
  return Math.min(1 - half, Math.max(half, value))
}

/** Mức độ zoom 0..1 của một đoạn tại thời điểm `s` (có chuyển cảnh vào/ra). */
export function zoomProgress(
  region: ZoomRegion,
  s: number,
  transitionMs = ZOOM_TRANSITION_MS,
): number {
  if (s < region.start || s > region.end) return 0
  const length = region.end - region.start
  const transition = Math.min(transitionMs, length / 2)
  if (transition <= 0) return 1
  return Math.min(
    easeInOut((s - region.start) / transition),
    easeInOut((region.end - s) / transition),
  )
}

/** Khung nhìn (camera ảo) tại thời điểm nguồn `s`. */
export function cameraAt(
  regions: readonly ZoomRegion[],
  s: number,
  follow: CursorTrack | null,
  /** Tâm khung nhìn khi không zoom (mặc định giữa video; chế độ lấp đầy dùng vị trí con trỏ). */
  rest: { x: number; y: number } = { x: 0.5, y: 0.5 },
  /** Kích thước khung nhìn khi chưa zoom (chuẩn hóa); khung dọc hẹp hơn nên đi sát mép được hơn. */
  base: { width: number; height: number } = { width: 1, height: 1 },
  /** Thời gian zoom vào/ra (ms). */
  transitionMs = ZOOM_TRANSITION_MS,
): Camera {
  const region = regions.find((r) => s >= r.start && s <= r.end)
  if (!region) return { scale: 1, x: rest.x, y: rest.y }
  const p = zoomProgress(region, s, transitionMs)
  const scale = 1 + (region.scale - 1) * p
  const target =
    region.mode === 'follow' && follow
      ? (cursorAt(follow, s) ?? { x: region.x, y: region.y })
      : { x: region.x, y: region.y }
  const tx = clampCenter(target.x, region.scale, base.width)
  const ty = clampCenter(target.y, region.scale, base.height)
  return {
    scale,
    x: clampCenter(rest.x + (tx - rest.x) * p, scale, base.width),
    y: clampCenter(rest.y + (ty - rest.y) * p, scale, base.height),
  }
}

/** Vùng của video đang được nhìn thấy (chuẩn hóa 0..1). */
export function viewRect(camera: Camera): { x: number; y: number; width: number; height: number } {
  const size = 1 / camera.scale
  return { x: camera.x - size / 2, y: camera.y - size / 2, width: size, height: size }
}

/** Sửa lại danh sách zoom: sắp xếp, cắt trong thời lượng, bỏ đoạn chồng lên nhau. */
export function normalizeZooms(regions: readonly ZoomRegion[], durationMs: number): ZoomRegion[] {
  const sorted = [...regions]
    .map((r) => ({ ...r, start: Math.max(0, r.start), end: Math.min(durationMs, r.end) }))
    .filter((r) => r.end - r.start >= 200)
    .sort((a, b) => a.start - b.start)
  const result: ZoomRegion[] = []
  for (const r of sorted) {
    const prev = result[result.length - 1]
    if (prev && r.start < prev.end) {
      const trimmed = { ...r, start: prev.end }
      if (trimmed.end - trimmed.start >= 200) result.push(trimmed)
    } else result.push(r)
  }
  return result
}

export const MIN_ZOOM_SCALE = 1.2
export const MAX_ZOOM_SCALE = 4

/** Kẹp mức zoom trong khoảng cho phép (1.2×–4×), làm tròn 0.1. */
export function clampZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_ZOOM_SCALE
  return Math.round(Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, scale)) * 10) / 10
}

/**
 * Đổi cùng một thuộc tính cho mọi đoạn zoom (ví dụ đặt tất cả về 2.5× hoặc đổi hết sang
 * "Cố định"). Mức zoom được kẹp trong giới hạn; `scale` không đổi thì trả về đúng mảng cũ.
 */
export function updateAllZooms(
  regions: readonly ZoomRegion[],
  patch: Partial<Pick<ZoomRegion, 'scale' | 'mode' | 'x' | 'y'>>,
): ZoomRegion[] {
  const clean: typeof patch = { ...patch }
  if (clean.scale !== undefined) clean.scale = clampZoomScale(clean.scale)
  if (
    regions.every((r) => Object.entries(clean).every(([k, v]) => r[k as keyof typeof clean] === v))
  )
    return [...regions]
  return regions.map((r) => ({ ...r, ...clean }))
}

/** Mức zoom chung nếu mọi đoạn cùng một mức, không thì null (để bảng "Tất cả zoom" hiện giá trị). */
export function commonZoomScale(regions: readonly ZoomRegion[]): number | null {
  const first = regions[0]
  if (!first) return null
  return regions.every((r) => Math.abs(r.scale - first.scale) < 1e-6) ? first.scale : null
}

/** Đoạn zoom do Claude đề xuất (thời gian tính bằng giây để dễ đọc / viết). */
export interface ZoomProposal {
  /** id đoạn hiện có để giữ lại (đã sửa), rỗng nếu là đoạn mới. */
  id: string
  start_seconds: number
  end_seconds: number
  scale: number
  mode: 'follow' | 'fixed'
  x: number
  y: number
}

/**
 * Biến danh sách Claude trả về thành các đoạn zoom hợp lệ: kẹp mức zoom và tâm, giữ id cũ nếu
 * có, bỏ đoạn quá ngắn / chồng nhau (`normalizeZooms`). Dữ liệu sai kiểu thì bỏ qua.
 */
export function zoomsFromProposals(
  proposals: readonly unknown[],
  existing: readonly ZoomRegion[],
  durationMs: number,
): ZoomRegion[] {
  const known = new Set(existing.map((z) => z.id))
  const used = new Set<string>()
  const regions: ZoomRegion[] = []
  for (const raw of proposals) {
    if (typeof raw !== 'object' || raw === null) continue
    const p = raw as Record<string, unknown>
    const start = Number(p.start_seconds)
    const end = Number(p.end_seconds)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const id = typeof p.id === 'string' && known.has(p.id) && !used.has(p.id) ? p.id : newZoomId()
    used.add(id)
    const mode = p.mode === 'fixed' ? 'fixed' : 'follow'
    const clamp01 = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback
    const old = existing.find((z) => z.id === id)
    regions.push({
      id,
      start: Math.round(start * 1000),
      end: Math.round(end * 1000),
      scale: clampZoomScale(Number(p.scale ?? old?.scale ?? DEFAULT_ZOOM_SCALE)),
      mode,
      x: clamp01(p.x, old?.x ?? 0.5),
      y: clamp01(p.y, old?.y ?? 0.5),
    })
  }
  return normalizeZooms(regions, durationMs)
}
