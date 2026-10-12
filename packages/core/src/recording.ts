import type { Rect } from './geometry'

export const FRAME_RATES = [30, 60] as const
export type FrameRate = (typeof FRAME_RATES)[number]

export const COUNTDOWNS = [0, 3, 5] as const
export type Countdown = (typeof COUNTDOWNS)[number]

/** Nguồn quay: cả màn hình, một vùng trên màn hình, hoặc một cửa sổ. */
export type CaptureSource =
  | { kind: 'display'; displayId: string }
  /** `region`: tọa độ logic (DIP) tính từ góc trên-trái của màn hình `displayId`. */
  | { kind: 'region'; displayId: string; region: Rect }
  | { kind: 'window'; sourceId: string; name: string }

export interface RecordingOptions {
  source: CaptureSource
  fps: FrameRate
  countdown: Countdown
  /** deviceId của webcam, hoặc null nếu không quay webcam. */
  cameraId: string | null
  /** deviceId của micro, hoặc null nếu không thu micro. */
  micId: string | null
  systemAudio: boolean
}

export const DEFAULT_RECORDING_OPTIONS: Omit<RecordingOptions, 'source'> = {
  fps: 60,
  countdown: 3,
  cameraId: null,
  micId: null,
  systemAudio: false,
}

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every(
    (k) => typeof r[k] === 'number' && Number.isFinite(r[k]),
  )
}

function parseSource(value: unknown): CaptureSource | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Record<string, unknown>
  if (s.kind === 'display' && typeof s.displayId === 'string') {
    return { kind: 'display', displayId: s.displayId }
  }
  if (s.kind === 'region' && typeof s.displayId === 'string' && isRect(s.region)) {
    const { x, y, width, height } = s.region
    if (width < 16 || height < 16) return null
    return { kind: 'region', displayId: s.displayId, region: { x, y, width, height } }
  }
  if (s.kind === 'window' && typeof s.sourceId === 'string') {
    return { kind: 'window', sourceId: s.sourceId, name: typeof s.name === 'string' ? s.name : '' }
  }
  return null
}

const optionalId = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null

/** Kiểm tra tùy chọn quay gửi từ giao diện. Trả về `null` nếu nguồn quay không hợp lệ. */
export function parseRecordingOptions(input: unknown): RecordingOptions | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Record<string, unknown>
  const source = parseSource(raw.source)
  if (!source) return null
  return {
    source,
    fps: FRAME_RATES.includes(raw.fps as FrameRate)
      ? (raw.fps as FrameRate)
      : DEFAULT_RECORDING_OPTIONS.fps,
    countdown: COUNTDOWNS.includes(raw.countdown as Countdown)
      ? (raw.countdown as Countdown)
      : DEFAULT_RECORDING_OPTIONS.countdown,
    cameraId: optionalId(raw.cameraId),
    micId: optionalId(raw.micId),
    systemAudio: raw.systemAudio === true,
  }
}

/** Định dạng thời lượng ms thành "m:ss" hoặc "h:mm:ss". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
