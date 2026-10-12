import {
  ALL_FORMATS,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  UrlSource,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny'
import {
  buildCursorTrack,
  cameraFollowTrack,
  mediaTime,
  outputDuration,
  outputSize,
  outputToSource,
  segmentAt,
  sourceSegments,
  type EditState,
  type InputEvent,
  type Project,
  type Size,
} from '@lumora/core'
import type { ExportResult } from '@shared/ipc'
import { lumora } from '../api'
import { mediaUrl } from '../lib/media'
import { drawScene, type FrameSource } from './draw'
import { computeScene } from './scene'

export interface ExportProgress {
  phase: 'render' | 'mux'
  /** 0..1 */
  progress: number
}

export class ExportCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'ExportCancelled'
  }
}

function sampleSource(sample: VideoSample): FrameSource {
  return {
    width: sample.displayWidth,
    height: sample.displayHeight,
    draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => sample.draw(ctx, sx, sy, sw, sh, dx, dy, dw, dh),
  }
}

/** Danh sách thời điểm (giây trong file) cần lấy khung hình của một track, theo thứ tự khung xuất. */
export interface FramePlan {
  /** Với mỗi khung xuất: đoạn quay và thời điểm nguồn. */
  frames: { segment: number | null; source: number }[]
  /** Với mỗi `${đoạn}:${track}`: các thời điểm trong file theo đúng thứ tự cần lấy. */
  timestamps: Map<string, number[]>
}

export function planFrames(project: Project, edit: EditState, fps: number): FramePlan {
  const segments = sourceSegments(project.segments)
  const total = Math.max(1, Math.round((outputDuration(edit.clips) / 1000) * fps))
  const frames: FramePlan['frames'] = []
  const timestamps = new Map<string, number[]>()
  for (let i = 0; i < total; i++) {
    const hit = outputToSource(edit.clips, (i * 1000) / fps)
    const source = hit?.source ?? 0
    const item = segmentAt(segments, source)
    frames.push({ segment: item?.segment.index ?? null, source })
    if (!item) continue
    for (const kind of ['screen', 'camera'] as const) {
      const t = mediaTime(item, kind, source)
      if (t === null) continue
      const key = `${item.segment.index}:${kind}`
      const list = timestamps.get(key) ?? []
      list.push(Math.max(0, t))
      timestamps.set(key, list)
    }
  }
  return { frames, timestamps }
}

/**
 * Xuất video: giải mã chính xác từng khung hình bằng WebCodecs, vẽ bằng đúng hàm của phần xem trước,
 * mã hóa (ưu tiên H.264) và gửi từng phần về main process. Main ghép âm thanh bằng FFmpeg.
 */
export async function exportVideo(options: {
  folder: string
  project: Project
  edit: EditState
  events: InputEvent[]
  videoSize: Size
  onProgress?: (p: ExportProgress) => void
  signal?: AbortSignal
}): Promise<ExportResult> {
  const { folder, project, edit, signal } = options
  const api = lumora()
  const fps = edit.export.fps
  const size = outputSize(edit.frame.aspect, edit.export.resolution, options.videoSize)
  const cursor = buildCursorTrack(
    options.events,
    project.segments,
    project.source.captureRect,
    edit.cursor.smoothing,
  )
  const follow = cameraFollowTrack(cursor)

  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'vp8'], {
    width: size.width,
    height: size.height,
  })
  if (!codec) throw new Error('Máy này không mã hóa được video (WebCodecs)')

  const canvas = new OffscreenCanvas(size.width, size.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không tạo được canvas')

  const exportId = await api.startExport(folder)
  const inputs: Input[] = []
  let output: Output | null = null
  try {
    const target = new StreamTarget(
      new WritableStream({
        write: (chunk) =>
          api.writeExport(
            exportId,
            chunk.position,
            chunk.data.buffer.slice(
              chunk.data.byteOffset,
              chunk.data.byteOffset + chunk.data.byteLength,
            ),
          ),
      }),
      { chunked: true, chunkSize: 8 * 1024 * 1024 },
    )
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
    const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 })
    output.addVideoTrack(source, { frameRate: fps })
    await output.start()

    const plan = planFrames(project, edit, fps)
    const iterators = new Map<string, AsyncGenerator<VideoSample | null, void, unknown>>()
    for (const [key, times] of plan.timestamps) {
      const [segText, kind] = key.split(':') as [string, 'screen' | 'camera']
      const track = project.segments.find((s) => s.index === Number(segText))?.tracks[kind]
      if (!track) continue
      const input = new Input({
        source: new UrlSource(mediaUrl(folder, track.file)),
        formats: ALL_FORMATS,
      })
      inputs.push(input)
      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) continue
      iterators.set(key, new VideoSampleSink(videoTrack).samplesAtTimestamps(times))
    }

    const last = new Map<string, VideoSample | null>()
    const next = async (key: string) => {
      const it = iterators.get(key)
      if (!it) return null
      const result = await it.next()
      const sample = result.done ? null : result.value
      // Giữ khung cuối cùng nếu file hết sớm hơn timeline một chút.
      if (sample) {
        last.get(key)?.close()
        last.set(key, sample)
        return sample
      }
      return last.get(key) ?? null
    }

    const hasCamera = (segment: number | null) =>
      segment !== null && iterators.has(`${segment}:camera`)
    for (let i = 0; i < plan.frames.length; i++) {
      if (signal?.aborted) throw new ExportCancelled()
      const frame = plan.frames[i]!
      const screen = frame.segment === null ? null : await next(`${frame.segment}:screen`)
      const camera = hasCamera(frame.segment) ? await next(`${frame.segment}:camera`) : null
      const scene = computeScene({
        edit,
        output: size,
        video: screen
          ? { width: screen.displayWidth, height: screen.displayHeight }
          : options.videoSize,
        source: frame.source,
        cursor,
        follow,
        hasCamera: !!camera,
      })
      drawScene(ctx, scene, {
        screen: screen ? sampleSource(screen) : null,
        camera: camera ? sampleSource(camera) : null,
      })
      await source.add(i / fps, 1 / fps)
      options.onProgress?.({ phase: 'render', progress: (i + 1) / plan.frames.length })
    }
    for (const sample of last.values()) sample?.close()
    await output.finalize()
    output = null
    options.onProgress?.({ phase: 'mux', progress: 0 })
    return await api.finishExport(exportId, folder, edit)
  } catch (error) {
    await output?.cancel().catch(() => undefined)
    await api.cancelExport(exportId).catch(() => undefined)
    throw error
  } finally {
    for (const input of inputs) input.dispose()
  }
}
