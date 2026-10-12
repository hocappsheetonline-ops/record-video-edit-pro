import type { Project } from '../project'
import {
  DEFAULT_CAPTIONS,
  type CaptionLine,
  type CaptionsState,
  type TranscriptWord,
} from './captions'
import { parseAudioClips, type AudioClip } from './audio-clips'
import { NO_BEAUTY, parseBeauty, type BeautyStyle } from './beauty'
import { parseTransitions, pruneTransitions, type Transition } from './transitions'
import { ASPECTS, CORNERS, RESOLUTIONS, type Aspect, type Corner, type Resolution } from './layout'
import { initialClips, MIN_CLIP_MS, sourceDuration, type Clip } from './timeline'
import { normalizeZooms, type ZoomRegion } from './zoom'

export const EDIT_FILE = 'edit.json'
export const EDIT_VERSION = 1

export interface Background {
  kind: 'solid' | 'gradient'
  color: string
  color2: string
  /** Góc chuyển màu (độ). */
  angle: number
}

export interface FrameStyle {
  aspect: Aspect
  /** Lề quanh video, tỉ lệ theo cạnh ngắn (0..0.45). */
  padding: number
  /** Bo góc, tỉ lệ theo cạnh ngắn của video (0..0.2). */
  radius: number
  /** Độ đậm của bóng đổ 0..1. */
  shadow: number
  background: Background
  /**
   * Lấp đầy khung: video màn hình phủ kín khung (không lề, không nền), phần thừa được cắt bớt
   * và khung nhìn tự đi theo con trỏ. Dùng cho video dọc 9:16 (TikTok, Shorts, Reels).
   */
  fill: boolean
}

export interface CursorStyle {
  visible: boolean
  /** Hệ số phóng to con trỏ (1 = cỡ gốc). */
  size: number
  /** Độ mượt 0..1. */
  smoothing: number
  clickEffect: boolean
  hideIdle: boolean
}

export interface CameraStyle {
  visible: boolean
  shape: 'circle' | 'rounded' | 'square'
  /** Cạnh bong bóng, tỉ lệ theo cạnh ngắn của khung (0.05..0.6). */
  size: number
  position: Corner
  /** `bubble`: bong bóng nổi trên video. `stack`: dải webcam chiếm trọn chiều ngang ở trên/dưới. */
  layout: CameraLayout
  /** Chiều cao dải webcam khi `stack`, tỉ lệ theo chiều cao khung (0.2..0.6). */
  split: number
  /** Làm đẹp mặt (mịn da, làm sáng, tông ấm). */
  beauty: BeautyStyle
}

export const CAMERA_LAYOUTS = ['bubble', 'stack'] as const
export type CameraLayout = (typeof CAMERA_LAYOUTS)[number]

/** Tốc độ chuyển động của khung nhìn (camera ảo). */
export interface MotionStyle {
  /** Tốc độ khung nhìn đi theo con trỏ (khi zoom / video dọc): 0 = lướt chậm, 1 = bám sát. */
  cameraSpeed: number
  /** Thời gian zoom vào/ra (ms): nhỏ = zoom nhanh, lớn = zoom chậm (250..1500). */
  zoomTransitionMs: number
}

export interface AudioMix {
  /** Âm lượng 0..2 (1 = giữ nguyên). */
  mic: number
  system: number
}

export interface ExportSettings {
  resolution: Resolution
  fps: 30 | 60
  format: 'mp4' | 'gif'
}

export interface EditState {
  version: typeof EDIT_VERSION
  clips: Clip[]
  zooms: ZoomRegion[]
  frame: FrameStyle
  cursor: CursorStyle
  camera: CameraStyle
  motion: MotionStyle
  audio: AudioMix
  /** Nhạc nền và hiệu ứng âm thanh thêm vào. */
  audioClips: AudioClip[]
  /** Hiệu ứng chuyển tiếp ở chỗ nối giữa các clip. */
  transitions: Transition[]
  export: ExportSettings
  captions: CaptionsState
}

export const BACKGROUND_PRESETS: Background[] = [
  { kind: 'gradient', color: '#7c3aed', color2: '#db2777', angle: 135 },
  { kind: 'gradient', color: '#0ea5e9', color2: '#6366f1', angle: 135 },
  { kind: 'gradient', color: '#f59e0b', color2: '#ef4444', angle: 135 },
  { kind: 'gradient', color: '#10b981', color2: '#0ea5e9', angle: 135 },
  { kind: 'gradient', color: '#1e1b4b', color2: '#0f172a', angle: 160 },
  { kind: 'solid', color: '#0b0b10', color2: '#0b0b10', angle: 0 },
  { kind: 'solid', color: '#f5f5f4', color2: '#f5f5f4', angle: 0 },
]

export function createDefaultEdit(
  project: Pick<Project, 'segments' | 'cursorHidden' | 'fps'>,
  zooms: ZoomRegion[] = [],
): EditState {
  return {
    version: EDIT_VERSION,
    clips: initialClips(project),
    zooms,
    frame: {
      aspect: '16:9',
      padding: 0.06,
      radius: 0.025,
      shadow: 0.5,
      background: { ...BACKGROUND_PRESETS[0]! },
      fill: false,
    },
    // Chỉ vẽ con trỏ khi con trỏ gốc không nằm sẵn trong video.
    cursor: {
      visible: project.cursorHidden,
      size: 1.4,
      smoothing: 0.6,
      clickEffect: true,
      hideIdle: true,
    },
    camera: {
      visible: true,
      shape: 'circle',
      size: 0.22,
      position: 'bottom-right',
      layout: 'bubble',
      split: 0.4,
      beauty: { ...NO_BEAUTY },
    },
    motion: { cameraSpeed: 0.85, zoomTransitionMs: 700 },
    audio: { mic: 1, system: 1 },
    audioClips: [],
    transitions: [],
    export: { resolution: 1080, fps: project.fps >= 60 ? 60 : 30, format: 'mp4' },
    captions: { ...DEFAULT_CAPTIONS, lines: [] },
  }
}

function parseWords(value: unknown, duration: number): TranscriptWord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((w): TranscriptWord[] => {
    if (!isObj(w) || typeof w.text !== 'string') return []
    const start = num(w.start, NaN, 0, duration)
    const end = num(w.end, NaN, 0, duration)
    return Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? [{ text: w.text, start, end }]
      : []
  })
}

function parseCaptions(value: unknown, duration: number): CaptionsState {
  const c = isObj(value) ? value : {}
  const lines: CaptionLine[] = Array.isArray(c.lines)
    ? c.lines.flatMap((l, i): CaptionLine[] => {
        if (!isObj(l) || typeof l.text !== 'string') return []
        const start = num(l.start, NaN, 0, duration)
        const end = num(l.end, NaN, 0, duration)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
        return [
          {
            id: typeof l.id === 'string' ? l.id : `l${i}`,
            start,
            end,
            text: l.text.slice(0, 500),
            words: parseWords(l.words, duration),
            edited: l.edited === true,
          },
        ]
      })
    : []
  return {
    enabled: bool(c.enabled, false),
    style: c.style === 'classic' ? 'classic' : 'highlight',
    position: c.position === 'top' ? 'top' : 'bottom',
    size: num(c.size, 1, 0.5, 2.5),
    language: typeof c.language === 'string' ? c.language.slice(0, 16) : '',
    lines,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const pick = <T extends string | number>(allowed: readonly T[], v: unknown, fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback

/**
 * Đọc edit.json, sửa giá trị sai về mặc định và giữ clip/zoom trong thời lượng thật của bản quay,
 * để file hỏng hoặc sửa tay cũng không làm app lỗi.
 */
export function parseEditState(
  input: unknown,
  project: Pick<Project, 'segments' | 'cursorHidden' | 'fps'>,
): EditState {
  const base = createDefaultEdit(project)
  if (!isObj(input) || input.version !== EDIT_VERSION) return base
  const duration = sourceDuration(project.segments)

  const clips: Clip[] = Array.isArray(input.clips)
    ? input.clips.flatMap((c, i): Clip[] => {
        if (!isObj(c)) return []
        const start = num(c.sourceStart, NaN, 0, duration)
        const end = num(c.sourceEnd, NaN, 0, duration)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_CLIP_MS) return []
        return [
          {
            id: typeof c.id === 'string' ? c.id : `c${i}`,
            sourceStart: start,
            sourceEnd: end,
            speed: num(c.speed, 1, 0.25, 16),
          },
        ]
      })
    : base.clips

  const zooms: ZoomRegion[] = Array.isArray(input.zooms)
    ? input.zooms.flatMap((z, i): ZoomRegion[] => {
        if (!isObj(z)) return []
        const start = num(z.start, NaN, 0, duration)
        const end = num(z.end, NaN, 0, duration)
        if (!Number.isFinite(start) || !Number.isFinite(end)) return []
        return [
          {
            id: typeof z.id === 'string' ? z.id : `z${i}`,
            start,
            end,
            scale: num(z.scale, 2, 1.1, 5),
            mode: z.mode === 'fixed' ? 'fixed' : 'follow',
            x: num(z.x, 0.5, 0, 1),
            y: num(z.y, 0.5, 0, 1),
          },
        ]
      })
    : []

  const f = isObj(input.frame) ? input.frame : {}
  const bg = isObj(f.background) ? f.background : {}
  const c = isObj(input.cursor) ? input.cursor : {}
  const cam = isObj(input.camera) ? input.camera : {}
  const a = isObj(input.audio) ? input.audio : {}
  const m = isObj(input.motion) ? input.motion : {}
  const e = isObj(input.export) ? input.export : {}

  return {
    version: EDIT_VERSION,
    clips,
    zooms: normalizeZooms(zooms, duration),
    frame: {
      aspect: pick(ASPECTS, f.aspect, base.frame.aspect),
      padding: num(f.padding, base.frame.padding, 0, 0.45),
      radius: num(f.radius, base.frame.radius, 0, 0.2),
      shadow: num(f.shadow, base.frame.shadow, 0, 1),
      background: {
        kind:
          bg.kind === 'solid'
            ? 'solid'
            : bg.kind === 'gradient'
              ? 'gradient'
              : base.frame.background.kind,
        color: color(bg.color, base.frame.background.color),
        color2: color(bg.color2, base.frame.background.color2),
        angle: num(bg.angle, base.frame.background.angle, 0, 360),
      },
      fill: bool(f.fill, base.frame.fill),
    },
    cursor: {
      visible: bool(c.visible, base.cursor.visible),
      size: num(c.size, base.cursor.size, 0.5, 4),
      smoothing: num(c.smoothing, base.cursor.smoothing, 0, 1),
      clickEffect: bool(c.clickEffect, base.cursor.clickEffect),
      hideIdle: bool(c.hideIdle, base.cursor.hideIdle),
    },
    camera: {
      visible: bool(cam.visible, base.camera.visible),
      shape: pick(['circle', 'rounded', 'square'] as const, cam.shape, base.camera.shape),
      size: num(cam.size, base.camera.size, 0.05, 0.6),
      position: pick(CORNERS, cam.position, base.camera.position),
      layout: pick(CAMERA_LAYOUTS, cam.layout, base.camera.layout),
      split: num(cam.split, base.camera.split, 0.2, 0.6),
      beauty: parseBeauty(cam.beauty),
    },
    motion: {
      cameraSpeed: num(m.cameraSpeed, base.motion.cameraSpeed, 0, 1),
      zoomTransitionMs: num(m.zoomTransitionMs, base.motion.zoomTransitionMs, 250, 1500),
    },
    audio: { mic: num(a.mic, 1, 0, 2), system: num(a.system, 1, 0, 2) },
    audioClips: parseAudioClips(input.audioClips),
    transitions: pruneTransitions(clips, parseTransitions(input.transitions)),
    export: {
      resolution: pick(RESOLUTIONS, e.resolution, base.export.resolution),
      fps: pick([30, 60] as const, e.fps, base.export.fps),
      format: e.format === 'gif' ? 'gif' : 'mp4',
    },
    captions: parseCaptions(input.captions, duration),
  }
}
