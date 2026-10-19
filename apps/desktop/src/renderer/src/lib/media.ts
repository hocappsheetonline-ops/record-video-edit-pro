import type { TrackKind } from '@lumora/core'

const VIDEO_TYPES = [
  'video/webm;codecs=h264',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm']

/** Chọn định dạng MediaRecorder tốt nhất máy hỗ trợ (ưu tiên H.264 vì có mã hóa phần cứng). */
export function pickMimeType(
  kind: TrackKind,
  isSupported: (type: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
): string {
  const candidates = kind === 'mic' || kind === 'system' ? AUDIO_TYPES : VIDEO_TYPES
  return candidates.find(isSupported) ?? ''
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop())
}

export function getCameraStream(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
  })
}

/**
 * Cách Chromium xử lý tiếng micro trước khi đưa cho ta:
 * - `raw`: thu thô 48 kHz, tắt khử vang / lọc ồn / tự chỉnh gain của Chromium. Dùng khi quay và lồng
 *   tiếng: ba bộ lọc đó làm tiếng bị rè, bập bùng và "nuốt" đầu câu (nhất là khi máy bận mã hóa
 *   video), trong khi khử vang không có tác dụng vì âm thanh máy không đi qua Chromium. Lọc tạp
 *   âm làm sau bằng RNNoise trong trình chỉnh sửa, sạch hơn nhiều.
 * - `voice`: bật đủ ba bộ lọc, cho livestream / gọi với khách (cần khử vang tiếng loa).
 */
export type MicProcessing = 'raw' | 'voice'

export function micConstraints(deviceId: string, processing: MicProcessing): MediaTrackConstraints {
  const processed = processing === 'voice'
  return {
    deviceId: { exact: deviceId },
    echoCancellation: processed,
    noiseSuppression: processed,
    autoGainControl: processed,
    sampleRate: { ideal: 48000 },
    // Nhiều micro USB báo stereo nhưng chỉ có một kênh có tiếng: lấy mono cho đều hai bên.
    channelCount: { ideal: 1 },
  }
}

export function getMicStream(
  deviceId: string,
  processing: MicProcessing = 'raw',
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: false,
    audio: micConstraints(deviceId, processing),
  })
}

/** Ràng buộc riêng của Chromium/Electron để quay màn hình, cửa sổ hoặc âm thanh hệ thống. */
type DesktopConstraints = MediaStreamConstraints & {
  audio: boolean | { mandatory: Record<string, unknown> }
  video: boolean | { mandatory: Record<string, unknown> }
}

export function getDesktopStream(sourceId: string, fps: number): Promise<MediaStream> {
  const constraints: DesktopConstraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: fps,
        maxWidth: 3840,
        maxHeight: 2160,
      },
    },
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

/** Âm thanh hệ thống (loopback) trên Windows. Chromium yêu cầu xin kèm video nên ta bỏ video ngay. */
export async function getSystemAudioStream(): Promise<MediaStream> {
  const constraints: DesktopConstraints = {
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        // Loopback là tiếng đã trộn sẵn của máy: không cho Chromium khử vang / lọc ồn / chỉnh gain
        // lên nó (các bộ lọc này làm nhạc bị rè và nhấp nhô).
        echoCancellation: false,
        googEchoCancellation: false,
        googAutoGainControl: false,
        googNoiseSuppression: false,
      },
    },
    video: {
      mandatory: { chromeMediaSource: 'desktop', maxWidth: 1, maxHeight: 1, maxFrameRate: 1 },
    },
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  stream.getVideoTracks().forEach((t) => {
    t.stop()
    stream.removeTrack(t)
  })
  return stream
}

export interface ChunkSink {
  trackStarted(index: number, kind: TrackKind, startedAt: number): Promise<void>
  writeChunk(index: number, kind: TrackKind, data: ArrayBuffer): Promise<void>
}

const VIDEO_BITRATE: Partial<Record<TrackKind, number>> = { screen: 12_000_000, camera: 6_000_000 }

/**
 * Ghi một track bằng MediaRecorder và gửi từng phần dữ liệu (mỗi giây) về main process,
 * nên bộ nhớ không phình to dù quay lâu.
 */
export class TrackRecorder {
  private recorder: MediaRecorder | null = null
  private uploads: Promise<void> = Promise.resolve()
  private failed: unknown = null

  constructor(
    readonly kind: TrackKind,
    private readonly stream: MediaStream,
    private readonly sink: ChunkSink,
    private readonly createRecorder: (
      stream: MediaStream,
      options: MediaRecorderOptions,
    ) => MediaRecorder = (s, o) => new MediaRecorder(s, o),
  ) {}

  start(segmentIndex: number): Promise<void> {
    const mimeType = pickMimeType(this.kind)
    const recorder = this.createRecorder(this.stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: VIDEO_BITRATE[this.kind],
      audioBitsPerSecond: 160_000,
    })
    this.recorder = recorder
    this.uploads = Promise.resolve()
    this.failed = null
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return
      const blob = event.data
      this.uploads = this.uploads
        .then(async () => this.sink.writeChunk(segmentIndex, this.kind, await blob.arrayBuffer()))
        .catch((error) => {
          this.failed = error
        })
    }
    return new Promise((resolve, reject) => {
      recorder.onstart = () => {
        void this.sink
          .trackStarted(segmentIndex, this.kind, Date.now())
          .then(() => resolve(), reject)
      }
      recorder.onerror = () => reject(new Error(`MediaRecorder lỗi (${this.kind})`))
      recorder.start(1000)
    })
  }

  /** Dừng và chờ tới khi phần dữ liệu cuối cùng đã được ghi xong. */
  async stop(): Promise<void> {
    const recorder = this.recorder
    this.recorder = null
    if (!recorder || recorder.state === 'inactive') {
      await this.uploads
      return
    }
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })
    await this.uploads
    if (this.failed) throw this.failed
  }
}

/**
 * URL để phát file trong thư mục dự án qua giao thức lumora-media.
 * Nếu `file` đã là URL tuyệt đối (vd. URL thư viện từ `libraryUrl`) thì trả nguyên để
 * bộ xem trước có thể phát thẳng qua trường `file` của overlay.
 */
export function mediaUrl(folder: string, file: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return file
  return `lumora-media://projects/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`
}

/** URL để xem trước / nghe thử file trong thư viện chung (meme, nhạc) mà không cần chép vào dự án. */
export function libraryUrl(library: 'memes' | 'music', file: string): string {
  return `lumora-media://library/${library}/${encodeURIComponent(file)}`
}
