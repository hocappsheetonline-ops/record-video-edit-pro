import type { TrackKind } from '@lumora/core'
import type { ActiveSession, LumoraApi } from '@shared/ipc'
import {
  getCameraStream,
  getDesktopStream,
  getMicStream,
  getSystemAudioStream,
  stopStream,
  TrackRecorder,
} from './media'

export type BarPhase = 'preparing' | 'countdown' | 'recording' | 'paused' | 'saving' | 'error'

export interface BarState {
  phase: BarPhase
  countdown: number
  /** Track không mở được thiết bị (bỏ qua, vẫn quay phần còn lại). */
  failedTracks: TrackKind[]
  error: string | null
}

export type BarApi = Pick<
  LumoraApi,
  | 'getActiveSession'
  | 'beginSegment'
  | 'endSegment'
  | 'finishRecording'
  | 'cancelRecording'
  | 'trackStarted'
  | 'writeChunk'
>

export interface Recorder {
  start(segmentIndex: number): Promise<void>
  stop(): Promise<void>
}

export interface BarDeps {
  api: BarApi
  openStream(kind: TrackKind, session: ActiveSession): Promise<MediaStream>
  createRecorder(kind: TrackKind, stream: MediaStream): Recorder
  sleep(ms: number): Promise<void>
  now(): number
}

export function defaultBarDeps(api: BarApi): BarDeps {
  return {
    api,
    openStream: (kind, session) => {
      const { options, screenSourceId } = session
      switch (kind) {
        case 'camera':
          return getCameraStream(options.cameraId ?? '')
        case 'mic':
          return getMicStream(options.micId ?? '')
        case 'system':
          return getSystemAudioStream()
        case 'screen':
          return getDesktopStream(screenSourceId ?? '', options.fps)
      }
    },
    createRecorder: (kind, stream) => new TrackRecorder(kind, stream, api),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  }
}

/**
 * Điều khiển một phiên quay phía giao diện: mở thiết bị, đếm ngược, bắt đầu/tạm dừng/dừng
 * các MediaRecorder và báo cho main process. Các thao tác chạy lần lượt, bấm liên tục cũng không sao.
 */
export class BarController {
  state: BarState = { phase: 'preparing', countdown: 0, failedTracks: [], error: null }
  private streams = new Map<TrackKind, MediaStream>()
  private recorders: Recorder[] = []
  private listeners = new Set<(state: BarState) => void>()
  private busy = false
  /** Yêu cầu dừng đến khi đang bận (ví dụ đang tạm dừng): thực hiện ngay khi xong việc hiện tại. */
  private stopRequested = false
  private closed = false
  private recordedMs = 0
  private segmentStartedAt: number | null = null

  constructor(private readonly deps: BarDeps) {}

  subscribe(listener: (state: BarState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<BarState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l(this.state))
  }

  /** Tổng thời gian đã quay (không tính lúc tạm dừng). */
  elapsedMs(): number {
    const running = this.segmentStartedAt === null ? 0 : this.deps.now() - this.segmentStartedAt
    return this.recordedMs + running
  }

  async init(): Promise<void> {
    const session = await this.deps.api.getActiveSession()
    if (!session) return this.fail('no_session')
    const failed: TrackKind[] = []
    for (const kind of session.rendererTracks) {
      try {
        this.streams.set(kind, await this.deps.openStream(kind, session))
      } catch {
        // Không quay được màn hình thì không có gì để lưu; thiết bị phụ thì bỏ qua.
        if (kind === 'screen') {
          await this.deps.api.cancelRecording().catch(() => undefined)
          return this.fail('screen_unavailable')
        }
        failed.push(kind)
      }
    }
    this.set({ failedTracks: failed })
    for (let n = session.options.countdown; n > 0; n--) {
      if (this.closed) return
      this.set({ phase: 'countdown', countdown: n })
      await this.deps.sleep(1000)
    }
    if (this.closed) return
    await this.run(() => this.begin())
  }

  private fail(error: string) {
    this.releaseStreams()
    this.set({ phase: 'error', error })
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy || this.closed) return
    this.busy = true
    try {
      await task()
    } catch (e) {
      this.set({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
    } finally {
      this.busy = false
      if (this.stopRequested) {
        this.stopRequested = false
        void this.stop()
      }
    }
  }

  private async begin() {
    const segment = await this.deps.api.beginSegment()
    this.recorders = segment.rendererTracks.flatMap((kind) => {
      const stream = this.streams.get(kind)
      return stream ? [this.deps.createRecorder(kind, stream)] : []
    })
    await Promise.all(this.recorders.map((r) => r.start(segment.index)))
    this.segmentStartedAt = this.deps.now()
    this.set({ phase: 'recording' })
  }

  private async stopRecorders() {
    const recorders = this.recorders
    this.recorders = []
    await Promise.all(recorders.map((r) => r.stop()))
    if (this.segmentStartedAt !== null) {
      this.recordedMs += this.deps.now() - this.segmentStartedAt
      this.segmentStartedAt = null
    }
  }

  togglePause(): Promise<void> {
    return this.run(async () => {
      if (this.state.phase === 'recording') {
        await this.stopRecorders()
        await this.deps.api.endSegment()
        this.set({ phase: 'paused' })
      } else if (this.state.phase === 'paused') {
        await this.begin()
      }
    })
  }

  /** Dừng và lưu. Bấm dừng khi chưa quay gì (đang đếm ngược) thì hủy luôn. */
  async stop(): Promise<void> {
    if (this.state.phase === 'preparing' || this.state.phase === 'countdown') return this.cancel()
    if (this.busy) {
      this.stopRequested = true
      return
    }
    await this.run(async () => {
      if (this.state.phase === 'saving') return
      this.set({ phase: 'saving' })
      await this.stopRecorders().catch(() => undefined)
      this.releaseStreams()
      this.closed = true
      await this.deps.api.finishRecording()
    })
  }

  async cancel(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.stopRecorders().catch(() => undefined)
    this.releaseStreams()
    await this.deps.api.cancelRecording()
  }

  /** Lỗi từ main process (ví dụ ffmpeg dừng đột ngột): lưu lại phần đã quay. */
  async handleError(message: string): Promise<void> {
    this.set({ error: message })
    if (this.state.phase === 'recording' || this.state.phase === 'paused') await this.stop()
  }

  private releaseStreams() {
    this.streams.forEach((s) => stopStream(s))
    this.streams.clear()
  }
}
