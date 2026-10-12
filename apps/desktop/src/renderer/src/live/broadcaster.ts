import type { LumoraApi } from '@shared/ipc'

const TYPES = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

/** Ghi luồng chương trình bằng MediaRecorder và gửi từng phần (250ms) cho FFmpeg ở main process. */
export class Broadcaster {
  private recorder: MediaRecorder | null = null
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly api: Pick<LumoraApi, 'writeLive'>) {}

  start(stream: MediaStream) {
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 10_000_000,
      audioBitsPerSecond: 192_000,
    })
    this.recorder = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return
      const blob = event.data
      this.queue = this.queue
        .then(async () => this.api.writeLive(await blob.arrayBuffer()))
        .catch(() => undefined)
    }
    recorder.start(250)
  }

  async stop(): Promise<void> {
    const recorder = this.recorder
    this.recorder = null
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })
    }
    await this.queue
  }
}

/** Phụ đề trực tiếp: cứ vài giây ghi một đoạn micro độc lập (file WebM hoàn chỉnh) để gửi đi nhận dạng. */
export class CaptionChunker {
  private recorder: MediaRecorder | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly stream: MediaStream,
    private readonly onChunk: (data: ArrayBuffer) => void,
    private readonly chunkMs = 5000,
  ) {}

  start() {
    const next = () => {
      this.recorder?.stop()
      const recorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : undefined,
      })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) void event.data.arrayBuffer().then(this.onChunk)
      }
      recorder.start()
      this.recorder = recorder
    }
    next()
    this.timer = setInterval(next, this.chunkMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.recorder?.stop()
    this.recorder = null
  }
}
