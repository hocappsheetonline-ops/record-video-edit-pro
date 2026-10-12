import { mediaUrl } from '../lib/media'

/** Ảnh đã giải mã: ảnh tĩnh có 1 khung; GIF động có nhiều khung kèm thời lượng mỗi khung. */
interface Decoded {
  frames: ImageBitmap[]
  /** Thời điểm kết thúc tích lũy của từng khung (ms). */
  ends: number[]
  total: number
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>
  close(): void
}

/**
 * Tải và giải mã ảnh / GIF meme của dự án (qua lumora-media, không làm "bẩn" canvas khi xuất).
 * GIF động dùng ImageDecoder (WebCodecs) để lấy từng khung theo thời gian.
 */
export class OverlayImages {
  private readonly cache = new Map<string, Decoded | null>()
  private readonly pending = new Map<string, Promise<void>>()

  constructor(
    private readonly folder: string,
    private readonly onLoaded: () => void = () => undefined,
  ) {}

  load(file: string): Promise<void> {
    if (this.cache.has(file)) return Promise.resolve()
    const existing = this.pending.get(file)
    if (existing) return existing
    const task: Promise<void> = this.decode(file)
      .then((d) => {
        this.cache.set(file, d)
      })
      .catch(() => {
        this.cache.set(file, null)
      })
      .finally(() => {
        this.pending.delete(file)
        this.onLoaded()
      })
    this.pending.set(file, task)
    return task
  }

  private async decode(file: string): Promise<Decoded> {
    const res = await fetch(mediaUrl(this.folder, file))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const Decoder = (globalThis as { ImageDecoder?: new (init: object) => ImageDecoderLike })
      .ImageDecoder
    if (/\.gif$/i.test(file) && Decoder) {
      const decoder = new Decoder({ data: blob.stream(), type: 'image/gif' })
      try {
        await decoder.tracks.ready
        const count = decoder.tracks.selectedTrack?.frameCount ?? 1
        const frames: ImageBitmap[] = []
        const ends: number[] = []
        let total = 0
        for (let i = 0; i < Math.min(count, 300); i++) {
          const { image } = await decoder.decode({ frameIndex: i })
          // GIF hay ghi thời lượng 0 → coi như 100ms như trình duyệt.
          const ms = Math.max(20, (image.duration ?? 0) / 1000 || 100)
          frames.push(await createImageBitmap(image))
          image.close()
          total += ms
          ends.push(total)
        }
        if (frames.length > 0) return { frames, ends, total }
      } finally {
        decoder.close()
      }
    }
    return { frames: [await createImageBitmap(blob)], ends: [1], total: 1 }
  }

  /** Khung ảnh để vẽ tại `local` ms kể từ lúc lớp hiện (GIF lặp lại). */
  frameAt(file: string, local: number): ImageBitmap | null {
    const d = this.cache.get(file)
    if (!d) return null
    if (d.frames.length === 1) return d.frames[0]!
    const t = ((local % d.total) + d.total) % d.total
    const index = d.ends.findIndex((end) => t < end)
    return d.frames[index < 0 ? d.frames.length - 1 : index]!
  }

  dispose() {
    for (const d of this.cache.values()) d?.frames.forEach((f) => f.close())
    this.cache.clear()
  }
}
