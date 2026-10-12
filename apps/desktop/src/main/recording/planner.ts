import {
  evenRect,
  intersectRect,
  type ProjectSource,
  type Rect,
  type RecordingOptions,
  type TrackKind,
} from '@lumora/core'
import {
  planScreenCapture,
  type CaptureCapabilities,
  type DisplayGeometry,
  type ScreenCapturePlan,
} from '../ffmpeg/capabilities'

export interface DisplayInfo extends DisplayGeometry {
  label: string
  /** Vị trí và kích thước theo tọa độ logic (DIP). */
  bounds: Rect
  scaleFactor: number
}

export type BrowserScreenSource =
  { kind: 'display'; displayId: string } | { kind: 'window'; sourceId: string }

export interface RecordingPlan {
  engine: 'ffmpeg' | 'browser'
  screen: ScreenCapturePlan | null
  /** Nguồn mà giao diện tự quay khi không dùng ffmpeg. */
  browserSource: BrowserScreenSource | null
  source: ProjectSource
  rendererTracks: TrackKind[]
  /** Màn hình đặt thanh điều khiển (null: màn hình chính). */
  barDisplayId: string | null
}

export class RecordingPlanError extends Error {
  constructor(
    readonly code: 'display_not_found' | 'region_requires_ffmpeg' | 'region_outside_display',
  ) {
    super(code)
    this.name = 'RecordingPlanError'
  }
}

export interface PlannerEnv {
  /** Đổi vùng DIP tuyệt đối sang pixel vật lý trên màn hình ảo. */
  toPhysical(rect: Rect): Rect
  x11Display?: string
}

function rendererTracksFor(options: RecordingOptions, browserScreen: boolean): TrackKind[] {
  const tracks: TrackKind[] = []
  if (browserScreen) tracks.push('screen')
  if (options.cameraId) tracks.push('camera')
  if (options.micId) tracks.push('mic')
  if (options.systemAudio) tracks.push('system')
  return tracks
}

/**
 * Quyết định cách quay cho một lựa chọn của người dùng: ffmpeg (ẩn con trỏ) khi được,
 * nếu không thì để giao diện tự quay bằng bộ quay của Electron.
 */
export function planRecording(
  options: RecordingOptions,
  displays: readonly DisplayInfo[],
  caps: CaptureCapabilities,
  env: PlannerEnv,
): RecordingPlan {
  const { source } = options
  if (source.kind === 'window') {
    return {
      engine: 'browser',
      screen: null,
      browserSource: { kind: 'window', sourceId: source.sourceId },
      source: { kind: 'window', name: source.name, captureRect: null, scaleFactor: 1 },
      rendererTracks: rendererTracksFor(options, true),
      barDisplayId: null,
    }
  }

  const index = displays.findIndex((d) => d.id === source.displayId)
  const display = displays[index]
  if (!display) throw new RecordingPlanError('display_not_found')
  const name = display.label || `Display ${index + 1}`

  let captureRect = evenRect(display.physicalBounds)
  if (source.kind === 'region') {
    const absolute = {
      ...source.region,
      x: display.bounds.x + source.region.x,
      y: display.bounds.y + source.region.y,
    }
    const physical = intersectRect(env.toPhysical(absolute), display.physicalBounds)
    if (!physical) throw new RecordingPlanError('region_outside_display')
    captureRect = evenRect(physical)
  }

  const screen = planScreenCapture(caps, displays, display.id, captureRect, options.fps, {
    display: env.x11Display,
  })
  if (!screen && source.kind === 'region') throw new RecordingPlanError('region_requires_ffmpeg')

  return {
    engine: screen ? 'ffmpeg' : 'browser',
    screen,
    browserSource: screen ? null : { kind: 'display', displayId: display.id },
    source: { kind: source.kind, name, captureRect, scaleFactor: display.scaleFactor },
    rendererTracks: rendererTracksFor(options, !screen),
    barDisplayId: display.id,
  }
}
