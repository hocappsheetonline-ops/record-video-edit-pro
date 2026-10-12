import type { Rect, Size } from '@lumora/core'
import {
  buildDdagrabProbeArgs,
  buildScreenCaptureArgs,
  ENCODER_PRIORITY,
  type CaptureBackend,
  type ScreenCaptureSpec,
  type VideoEncoder,
} from './args'
import { parseInputResolution } from './parse'
import type { FfmpegRunner } from './runner'

export interface BackendCapability {
  encoder: VideoEncoder
}

/** Những cách quay màn hình bằng ffmpeg dùng được trên máy này. */
export interface CaptureCapabilities {
  /** Danh sách màn hình DXGI (theo output_idx) mà ddagrab mở được. */
  ddagrabOutputs: Size[]
  ddagrab: BackendCapability | null
  gdigrab: BackendCapability | null
  x11grab: BackendCapability | null
}

export const NO_CAPTURE: CaptureCapabilities = {
  ddagrabOutputs: [],
  ddagrab: null,
  gdigrab: null,
  x11grab: null,
}

const PROBE_RECT: Rect = { x: 0, y: 0, width: 256, height: 256 }
const MAX_OUTPUTS = 8

async function firstWorkingEncoder(
  run: FfmpegRunner,
  base: Omit<ScreenCaptureSpec, 'encoder'>,
  encoders: readonly VideoEncoder[],
): Promise<VideoEncoder | null> {
  for (const encoder of encoders) {
    const args = buildScreenCaptureArgs({ ...base, encoder }, { kind: 'null', frames: 10 })
    const result = await run(args, 15_000)
    if (result.code === 0) return encoder
  }
  return null
}

/**
 * Chạy thử từng cách quay (vài khung hình nhỏ, không ghi file) để biết máy hỗ trợ gì.
 * Mất vài giây nên chỉ chạy một lần mỗi phiên làm việc.
 */
export async function detectCaptureCapabilities(
  run: FfmpegRunner,
  platform: NodeJS.Platform,
  env: { display?: string } = {},
): Promise<CaptureCapabilities> {
  const caps: CaptureCapabilities = { ...NO_CAPTURE, ddagrabOutputs: [] }

  if (platform === 'win32') {
    for (let idx = 0; idx < MAX_OUTPUTS; idx++) {
      const result = await run(buildDdagrabProbeArgs(idx), 10_000)
      const size = result.code === 0 ? parseInputResolution(result.stderr) : null
      if (!size) break
      caps.ddagrabOutputs.push(size)
    }
    if (caps.ddagrabOutputs.length > 0) {
      const encoder = await firstWorkingEncoder(
        run,
        { backend: 'ddagrab', fps: 30, rect: PROBE_RECT, outputIdx: 0 },
        ENCODER_PRIORITY,
      )
      if (encoder) caps.ddagrab = { encoder }
    }
    const gdiEncoder = await firstWorkingEncoder(
      run,
      { backend: 'gdigrab', fps: 30, rect: PROBE_RECT },
      ENCODER_PRIORITY,
    )
    if (gdiEncoder) caps.gdigrab = { encoder: gdiEncoder }
  } else if (platform === 'linux' && env.display) {
    const encoder = await firstWorkingEncoder(
      run,
      { backend: 'x11grab', fps: 30, rect: PROBE_RECT, x11Display: env.display },
      ['libx264'],
    )
    if (encoder) caps.x11grab = { encoder }
  }
  return caps
}

export interface DisplayGeometry {
  id: string
  /** Vùng màn hình tính bằng pixel vật lý trên toàn màn hình ảo. */
  physicalBounds: Rect
}

/**
 * Tìm output_idx của ddagrab ứng với màn hình được chọn. Thứ tự màn hình của DXGI có thể khác
 * Electron nên chỉ chấp nhận khi chắc chắn (chỉ có một màn hình, hoặc độ phân giải không trùng).
 */
export function matchDdagrabOutput(
  displays: readonly DisplayGeometry[],
  targetId: string,
  outputs: readonly Size[],
): number | null {
  const target = displays.find((d) => d.id === targetId)
  if (!target) return null
  if (displays.length === 1 && outputs.length === 1) return 0
  const { width, height } = target.physicalBounds
  const sameSizeDisplays = displays.filter(
    (d) => d.physicalBounds.width === width && d.physicalBounds.height === height,
  )
  const sameSizeOutputs = outputs
    .map((size, idx) => ({ size, idx }))
    .filter(({ size }) => size.width === width && size.height === height)
  if (sameSizeDisplays.length === 1 && sameSizeOutputs.length === 1) {
    return sameSizeOutputs[0]!.idx
  }
  return null
}

export interface ScreenCapturePlan {
  spec: ScreenCaptureSpec
  /** Vùng video thể hiện, pixel vật lý trên toàn màn hình ảo (để đổi tọa độ chuột). */
  captureRect: Rect
}

/**
 * Chọn cách quay tốt nhất cho một màn hình (và vùng nếu có).
 * Trả về `null` nếu ffmpeg không quay được trên máy này: khi đó app dùng bộ quay của Electron.
 */
export function planScreenCapture(
  caps: CaptureCapabilities,
  displays: readonly DisplayGeometry[],
  displayId: string,
  /** Vùng cần quay, pixel vật lý trên toàn màn hình ảo. */
  captureRect: Rect,
  fps: number,
  env: { display?: string } = {},
): ScreenCapturePlan | null {
  const display = displays.find((d) => d.id === displayId)
  if (!display) return null

  if (caps.ddagrab) {
    const outputIdx = matchDdagrabOutput(displays, displayId, caps.ddagrabOutputs)
    if (outputIdx !== null) {
      const backend: CaptureBackend = 'ddagrab'
      return {
        captureRect,
        spec: {
          backend,
          encoder: caps.ddagrab.encoder,
          fps,
          outputIdx,
          rect: {
            ...captureRect,
            x: captureRect.x - display.physicalBounds.x,
            y: captureRect.y - display.physicalBounds.y,
          },
        },
      }
    }
  }
  if (caps.gdigrab) {
    return {
      captureRect,
      spec: { backend: 'gdigrab', encoder: caps.gdigrab.encoder, fps, rect: captureRect },
    }
  }
  if (caps.x11grab) {
    return {
      captureRect,
      spec: {
        backend: 'x11grab',
        encoder: caps.x11grab.encoder,
        fps,
        rect: captureRect,
        x11Display: env.display,
      },
    }
  }
  return null
}
