import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { MemeItem, OnlineItem, OnlineSearch, OnlineSource } from '@shared/ipc'
import type { FetchLike } from '../key-validation'
import type { MemeLibrary } from '../projects/images'
import { searchPixabay } from './pixabay'
import { searchTenor } from './tenor'
import { ContentError } from './types'

/** Kết quả tìm kiếm giữ lại 10 phút: gõ lại từ khóa cũ không tốn lượt gọi API. */
const CACHE_MS = 10 * 60_000
/** File tải về lớn hơn thì bỏ (meme / stock ngắn chỉ vài MB). */
export const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 120_000

export interface OnlineDeps {
  getKey(name: 'tenor' | 'pixabay'): Promise<string | undefined>
  library: MemeLibrary
  /** Thư mục tạm cho file đang tải. */
  tmpDir: string
  fetchImpl?: FetchLike
  now?: () => number
}

const keyFor = (source: OnlineSource) => (source.startsWith('tenor') ? 'tenor' : 'pixabay')

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function extensionOf(url: string, contentType: string): string {
  const fromType = EXTENSIONS[contentType.split(';')[0]!.trim().toLowerCase()]
  if (fromType) return fromType
  const fromPath = /\.(mp4|webm|gif|png|jpe?g|webp)(?:$|\?)/i.exec(new URL(url).pathname)?.[1]
  return (fromPath ?? 'mp4').toLowerCase().replace('jpeg', 'jpg')
}

/**
 * Kho nội dung online (Tenor, Pixabay): tìm kiếm qua main process (giấu key, tránh CORS), tải
 * về thư viện meme cá nhân để dùng offline. Chỉ tải được mục vừa có trong kết quả tìm kiếm, nên
 * giao diện không thể bắt app tải một địa chỉ tùy ý.
 */
export class OnlineService {
  private readonly cache = new Map<string, { at: number; result: OnlineSearch }>()
  private readonly known = new Map<string, OnlineItem>()
  private readonly downloading = new Map<string, Promise<MemeItem>>()

  constructor(private readonly deps: OnlineDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)()
  }

  private async key(source: OnlineSource): Promise<string> {
    const key = await this.deps.getKey(keyFor(source))
    if (!key) throw new Error('key_missing')
    return key
  }

  async search(source: OnlineSource, q: string, next: string | null): Promise<OnlineSearch> {
    const cacheKey = JSON.stringify([source, q.trim().toLowerCase(), next])
    const hit = this.cache.get(cacheKey)
    if (hit && this.now() - hit.at < CACHE_MS) return hit.result
    const apiKey = await this.key(source)
    const fetchImpl = this.deps.fetchImpl
    const result =
      source === 'tenor' || source === 'tenorSticker'
        ? await searchTenor(apiKey, {
            q,
            kind: source === 'tenor' ? 'gif' : 'sticker',
            next,
            fetchImpl,
          })
        : await searchPixabay(apiKey, {
            q,
            kind: source === 'pixabayVideo' ? 'video' : 'image',
            next,
            fetchImpl,
          })
    for (const item of result.items) this.known.set(`${item.source}:${item.id}`, item)
    this.cache.set(cacheKey, { at: this.now(), result })
    return result
  }

  /** Tải một mục vào thư viện meme (đã có thì dùng lại, không tải lần hai). */
  download(source: 'tenor' | 'pixabay', id: string): Promise<MemeItem> {
    const key = `${source}:${id}`
    const running = this.downloading.get(key)
    if (running) return running
    const task = this.doDownload(source, id).finally(() => this.downloading.delete(key))
    this.downloading.set(key, task)
    return task
  }

  private async doDownload(source: 'tenor' | 'pixabay', id: string): Promise<MemeItem> {
    const existing = (await this.deps.library.list()).find(
      (m) => m.origin?.source === source && m.origin.id === id,
    )
    if (existing) return existing
    const item = this.known.get(`${source}:${id}`)
    if (!item) throw new Error('online_unknown')

    let response: Response
    try {
      response = await (this.deps.fetchImpl ?? fetch)(item.downloadUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      })
    } catch {
      throw new ContentError('net_offline')
    }
    if (!response.ok || !response.body) throw new ContentError('bad_response')
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_DOWNLOAD_BYTES) throw new Error('online_too_large')

    await mkdir(this.deps.tmpDir, { recursive: true })
    const ext = extensionOf(item.downloadUrl, response.headers.get('content-type') ?? '')
    const tmp = join(this.deps.tmpDir, `dl-${source}-${id.replace(/[^\w-]/g, '_')}.${ext}`)
    let received = 0
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length
        if (received > MAX_DOWNLOAD_BYTES) done(new Error('online_too_large'))
        else done(null, chunk)
      },
    })
    try {
      await pipeline(
        Readable.fromWeb(response.body as unknown as WebReadableStream),
        limit,
        createWriteStream(tmp),
      )
      const list = await this.deps.library.add(
        [tmp],
        [{ name: item.title, origin: { source, id } }],
      )
      const added = list.find((m) => m.origin?.source === source && m.origin.id === id)
      if (!added) throw new Error('image_unreadable')
      return added
    } finally {
      await rm(tmp, { force: true })
    }
  }
}
