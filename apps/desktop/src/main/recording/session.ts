import { createWriteStream, type WriteStream } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EVENTS_FILE,
  PROJECT_FILE,
  PROJECT_VERSION,
  projectDuration,
  THUMBNAIL_FILE,
  trackFileName,
  type Project,
  type ProjectSource,
  type Segment,
  type TrackKind,
} from '@lumora/core'
import { writeJsonFile } from '../json-file'

export interface ScreenCaptureHandle {
  /** Thời điểm (ms, epoch) khung hình đầu tiên được ghi. */
  startedAt: number
  stop(): Promise<void>
}

export interface SessionDeps {
  dir: string
  now(): number
  /** Bắt đầu quay màn hình bằng ffmpeg. Không có khi giao diện tự quay màn hình (quay cửa sổ). */
  startScreen?: (outputPath: string) => Promise<ScreenCaptureHandle>
  tracker: {
    start(filePath: string): Promise<void>
    stop(): Promise<void>
    readonly mode: 'hook' | 'poll' | 'off'
  } | null
  /** Ghi lại container để file từ MediaRecorder tua được. */
  remux(input: string, output: string): Promise<void>
  thumbnail(input: string, output: string): Promise<void>
}

export interface SessionMeta {
  id: string
  name: string
  createdAt: string
  source: ProjectSource
  engine: Project['engine']
  encoder: string | null
  fps: number
  cursorHidden: boolean
  /** Các track do giao diện ghi bằng MediaRecorder rồi gửi dữ liệu về. */
  rendererTracks: TrackKind[]
}

export type SessionState = 'ready' | 'recording' | 'paused' | 'finished' | 'cancelled'

export interface SegmentStart {
  index: number
  rendererTracks: TrackKind[]
}

const VIDEO_TRACKS: ReadonlySet<TrackKind> = new Set(['screen', 'camera'])

/** Đuôi file sau khi xử lý: video lưu Matroska (hỗ trợ cả H.264), âm thanh lưu WebM/Opus. */
export function rendererTrackExt(kind: TrackKind): string {
  return VIDEO_TRACKS.has(kind) ? 'mkv' : 'webm'
}

function rawFileName(index: number, kind: TrackKind): string {
  return `seg${index}-${kind}.rec.webm`
}

/**
 * Một phiên quay. Mỗi lần tạm dừng/quay tiếp tạo một đoạn (segment) mới với file riêng.
 * Mọi thao tác chạy tuần tự để dữ liệu ghi đúng thứ tự kể cả khi người dùng bấm liên tục.
 */
export class RecordingSession {
  state: SessionState = 'ready'
  private readonly segments: Segment[] = []
  private screen: ScreenCaptureHandle | null = null
  private readonly streams = new Map<string, WriteStream>()
  private queue: Promise<unknown> = Promise.resolve()
  private trackerStarted = false
  private inputMode: 'hook' | 'poll' | null = null

  constructor(
    private readonly meta: SessionMeta,
    private readonly deps: SessionDeps,
  ) {}

  get dir(): string {
    return this.deps.dir
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => undefined)
    return result
  }

  private get current(): Segment | undefined {
    return this.segments[this.segments.length - 1]
  }

  beginSegment(): Promise<SegmentStart> {
    return this.run(async () => {
      if (this.state !== 'ready' && this.state !== 'paused') {
        throw new Error(`Không thể bắt đầu đoạn mới khi đang ở trạng thái ${this.state}`)
      }
      const index = this.segments.length
      const segment: Segment = { index, startedAt: this.deps.now(), endedAt: 0, tracks: {} }
      if (this.deps.startScreen) {
        const file = trackFileName(index, 'screen', 'mkv')
        this.screen = await this.deps.startScreen(join(this.deps.dir, file))
        segment.tracks.screen = { file, startedAt: this.screen.startedAt }
      }
      if (this.deps.tracker && !this.trackerStarted) {
        await this.deps.tracker.start(join(this.deps.dir, EVENTS_FILE))
        this.trackerStarted = true
        this.inputMode = this.deps.tracker.mode === 'off' ? null : this.deps.tracker.mode
      }
      this.segments.push(segment)
      this.state = 'recording'
      return { index, rendererTracks: this.meta.rendererTracks }
    })
  }

  private assertRendererTrack(index: number, kind: TrackKind): Segment {
    const segment = this.current
    if (this.state !== 'recording' || !segment || segment.index !== index) {
      throw new Error(`Đoạn ${index} không còn đang quay`)
    }
    if (!this.meta.rendererTracks.includes(kind)) throw new Error(`Track không hợp lệ: ${kind}`)
    return segment
  }

  trackStarted(index: number, kind: TrackKind, startedAt: number): Promise<void> {
    return this.run(async () => {
      const segment = this.assertRendererTrack(index, kind)
      segment.tracks[kind] = { file: trackFileName(index, kind, rendererTrackExt(kind)), startedAt }
    })
  }

  writeChunk(index: number, kind: TrackKind, data: Uint8Array): Promise<void> {
    return this.run(async () => {
      this.assertRendererTrack(index, kind)
      const key = `${index}:${kind}`
      let stream = this.streams.get(key)
      if (!stream) {
        stream = createWriteStream(join(this.deps.dir, rawFileName(index, kind)))
        this.streams.set(key, stream)
      }
      if (!stream.write(data))
        await new Promise<void>((resolve) => stream.once('drain', () => resolve()))
    })
  }

  private async closeStreams(): Promise<void> {
    const streams = [...this.streams.values()]
    this.streams.clear()
    await Promise.all(streams.map((s) => new Promise<void>((resolve) => s.end(resolve))))
  }

  private async stopActiveSegment(): Promise<void> {
    const segment = this.current
    if (this.state !== 'recording' || !segment) return
    const screen = this.screen
    this.screen = null
    segment.endedAt = this.deps.now()
    await Promise.all([screen?.stop(), this.closeStreams()])
    this.state = 'paused'
    await this.save()
  }

  endSegment(): Promise<void> {
    return this.run(() => this.stopActiveSegment())
  }

  private project(): Project {
    return {
      version: PROJECT_VERSION,
      id: this.meta.id,
      name: this.meta.name,
      createdAt: this.meta.createdAt,
      source: this.meta.source,
      engine: this.meta.engine,
      encoder: this.meta.encoder,
      fps: this.meta.fps,
      cursorHidden: this.meta.cursorHidden,
      segments: this.segments.map((s) => ({ ...s, tracks: { ...s.tracks } })),
      hasEvents: this.trackerStarted,
      inputMode: this.trackerStarted ? this.inputMode : null,
      durationMs: projectDuration(this.segments),
    }
  }

  private save(): Promise<void> {
    return writeJsonFile(join(this.deps.dir, PROJECT_FILE), this.project())
  }

  /** Xử lý file của giao diện: ghi lại container; nếu lỗi thì giữ nguyên dữ liệu gốc. */
  private async finalizeRendererTracks(): Promise<void> {
    for (const segment of this.segments) {
      for (const kind of this.meta.rendererTracks) {
        const track = segment.tracks[kind]
        if (!track) continue
        const raw = join(this.deps.dir, rawFileName(segment.index, kind))
        const final = join(this.deps.dir, track.file)
        const exists = await stat(raw).then(
          (s) => s.size > 0,
          () => false,
        )
        if (!exists) {
          delete segment.tracks[kind]
          continue
        }
        try {
          await this.deps.remux(raw, final)
          await rm(raw, { force: true })
        } catch {
          await rename(raw, final)
        }
      }
    }
  }

  finish(): Promise<Project> {
    return this.run(async () => {
      if (this.state === 'finished' || this.state === 'cancelled') {
        throw new Error('Phiên quay đã kết thúc')
      }
      await this.stopActiveSegment()
      if (this.trackerStarted) await this.deps.tracker?.stop()
      await this.finalizeRendererTracks()
      const firstScreen = this.segments.find((s) => s.tracks.screen)?.tracks.screen
      if (firstScreen) {
        await this.deps
          .thumbnail(join(this.deps.dir, firstScreen.file), join(this.deps.dir, THUMBNAIL_FILE))
          .catch(() => undefined)
      }
      this.state = 'finished'
      await this.save()
      return this.project()
    })
  }

  /** Hủy phiên quay và xóa toàn bộ file đã ghi. */
  cancel(): Promise<void> {
    return this.run(async () => {
      if (this.state === 'finished' || this.state === 'cancelled') return
      await this.screen?.stop().catch(() => undefined)
      this.screen = null
      await this.closeStreams()
      if (this.trackerStarted) await this.deps.tracker?.stop().catch(() => undefined)
      this.state = 'cancelled'
      await rm(this.deps.dir, { recursive: true, force: true })
    })
  }
}
