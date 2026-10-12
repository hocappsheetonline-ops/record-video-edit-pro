import type { Rect } from './geometry'

export const PROJECT_FILE = 'project.json'
export const EVENTS_FILE = 'events.jsonl'
export const THUMBNAIL_FILE = 'thumbnail.jpg'
export const PROJECT_FOLDER_SUFFIX = '.lumora'
export const PROJECT_VERSION = 1

export const TRACK_KINDS = ['screen', 'camera', 'mic', 'system'] as const
export type TrackKind = (typeof TRACK_KINDS)[number]

export interface TrackFile {
  /** Tên file nằm trong thư mục dự án. */
  file: string
  /** Thời điểm khung hình/mẫu âm thanh đầu tiên (ms, Unix epoch), để căn đồng bộ các track. */
  startedAt: number
}

/** Một đoạn quay liên tục. Mỗi lần tạm dừng rồi quay tiếp sẽ tạo đoạn mới. */
export interface Segment {
  index: number
  startedAt: number
  endedAt: number
  tracks: Partial<Record<TrackKind, TrackFile>>
}

export interface ProjectSource {
  kind: 'display' | 'region' | 'window'
  name: string
  /**
   * Vùng màn hình mà video `screen` thể hiện, tính bằng pixel vật lý trên toàn màn hình ảo.
   * Dùng để đổi tọa độ chuột sang tọa độ trong video. `null` khi quay cửa sổ (cửa sổ có thể di chuyển).
   */
  captureRect: Rect | null
  /** Hệ số phóng to (DPI scaling) của màn hình, ví dụ 1.25 cho 125%. */
  scaleFactor: number
}

export interface Project {
  version: typeof PROJECT_VERSION
  id: string
  name: string
  createdAt: string
  source: ProjectSource
  engine: 'ffmpeg' | 'browser'
  encoder: string | null
  fps: number
  /** true khi con trỏ hệ thống không bị quay vào video (sẽ vẽ lại con trỏ mượt hơn khi chỉnh sửa). */
  cursorHidden: boolean
  segments: Segment[]
  hasEvents: boolean
  /**
   * Cách ghi chuột/bàn phím: `hook` có đủ click, cuộn và phím tắt; `poll` chỉ có vị trí chuột
   * (khi không cài được hook toàn hệ thống). `null` nếu không ghi.
   */
  inputMode: 'hook' | 'poll' | null
  durationMs: number
}

export function segmentDuration(segment: Segment): number {
  return Math.max(0, segment.endedAt - segment.startedAt)
}

export function projectDuration(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + segmentDuration(s), 0)
}

/** Tên thư mục dự án theo thời gian quay, ví dụ "2026-10-12 09.30.15.lumora". */
export function projectFolderName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
  const time = `${p(date.getHours())}.${p(date.getMinutes())}.${p(date.getSeconds())}`
  return `${day} ${time}${PROJECT_FOLDER_SUFFIX}`
}

/** Tên file của một track trong một đoạn, ví dụ "seg0-screen.mkv". */
export function trackFileName(segmentIndex: number, kind: TrackKind, ext: string): string {
  return `seg${segmentIndex}-${kind}.${ext}`
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function parseRect(v: unknown): Rect | null {
  if (!isObject(v)) return null
  const { x, y, width, height } = v
  return isNum(x) && isNum(y) && isNum(width) && isNum(height) ? { x, y, width, height } : null
}

/** Tên file phải nằm ngay trong thư mục dự án, không được trỏ ra ngoài. */
function isSafeFileName(name: string): boolean {
  return /^[\w.-]+$/.test(name) && !name.startsWith('.')
}

function parseSegment(v: unknown): Segment | null {
  if (!isObject(v) || !isNum(v.index) || !isNum(v.startedAt) || !isNum(v.endedAt)) return null
  const tracks: Segment['tracks'] = {}
  if (isObject(v.tracks)) {
    for (const kind of TRACK_KINDS) {
      const t = v.tracks[kind]
      if (isObject(t) && isStr(t.file) && isSafeFileName(t.file) && isNum(t.startedAt)) {
        tracks[kind] = { file: t.file, startedAt: t.startedAt }
      }
    }
  }
  return { index: v.index, startedAt: v.startedAt, endedAt: v.endedAt, tracks }
}

/** Đọc và kiểm tra project.json. Trả về `null` nếu file không phải dự án Lumora hợp lệ. */
export function parseProject(input: unknown): Project | null {
  if (!isObject(input) || input.version !== PROJECT_VERSION) return null
  if (!isStr(input.id) || !isStr(input.name) || !isStr(input.createdAt)) return null
  const src = input.source
  if (!isObject(src) || !['display', 'region', 'window'].includes(src.kind as string)) return null
  if (input.engine !== 'ffmpeg' && input.engine !== 'browser') return null
  if (!Array.isArray(input.segments)) return null
  const segments = input.segments.map(parseSegment)
  if (segments.some((s) => s === null)) return null
  const validSegments = segments as Segment[]
  return {
    version: PROJECT_VERSION,
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    source: {
      kind: src.kind as ProjectSource['kind'],
      name: isStr(src.name) ? src.name : '',
      captureRect: parseRect(src.captureRect),
      scaleFactor: isNum(src.scaleFactor) && src.scaleFactor > 0 ? src.scaleFactor : 1,
    },
    engine: input.engine,
    encoder: isStr(input.encoder) ? input.encoder : null,
    fps: isNum(input.fps) ? input.fps : 30,
    cursorHidden: input.cursorHidden === true,
    segments: validSegments,
    hasEvents: input.hasEvents === true,
    inputMode: input.inputMode === 'hook' || input.inputMode === 'poll' ? input.inputMode : null,
    durationMs: projectDuration(validSegments),
  }
}
