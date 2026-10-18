import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { MusicFindQuery, MusicTrack } from '@shared/ipc'
import type { FetchLike } from '../key-validation'
import type { MusicLibrary } from '../projects/music'
import { searchJamendo, type MusicCandidate } from './jamendo'
import { ContentError } from './types'

/** Một bài nhạc nền tối đa 40 MB (MP3 320 kbps 10 phút ≈ 24 MB). */
export const MAX_MUSIC_BYTES = 40 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 120_000
/** Kết quả tìm cùng tâm trạng giữ 10 phút: tự dựng nhiều dự án liên tiếp không gọi API lặp. */
const CACHE_MS = 10 * 60_000

export interface MusicFinderDeps {
  getKey(name: 'jamendo'): Promise<string | undefined>
  library: Pick<MusicLibrary, 'findByOrigin' | 'addTrack'>
  tmpDir: string
  fetchImpl?: FetchLike
  now?: () => number
}

/**
 * AI tự tìm nhạc nền: hỏi Jamendo theo tâm trạng / nhịp, lấy bài hợp nhất (ưu tiên bài chưa
 * dùng gần đây để các video không trùng nhạc), tải về kho nhạc cùng dòng ghi nguồn. Bài đã có
 * trong kho (cùng mã) thì dùng lại, không tải lần hai.
 */
export class MusicFinder {
  private readonly cache = new Map<string, { at: number; items: MusicCandidate[] }>()
  private readonly recent: string[] = []

  constructor(private readonly deps: MusicFinderDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)()
  }

  async search(query: MusicFindQuery): Promise<MusicCandidate[]> {
    const key = JSON.stringify([query.mood.trim().toLowerCase(), query.tempo])
    const hit = this.cache.get(key)
    if (hit && this.now() - hit.at < CACHE_MS) return hit.items
    const clientId = await this.deps.getKey('jamendo')
    if (!clientId) throw new Error('key_missing')
    const items = await searchJamendo(clientId, {
      mood: query.mood,
      tempo: query.tempo,
      durationMs: query.durationMs,
      fetchImpl: this.deps.fetchImpl,
    })
    this.cache.set(key, { at: this.now(), items })
    return items
  }

  /** Tìm rồi tải bài hợp nhất vào kho nhạc. Không có bài: lỗi `no_results`. */
  async find(query: MusicFindQuery): Promise<MusicTrack> {
    let items = await this.search(query)
    if (items.length === 0 && query.mood.trim()) {
      // Tâm trạng quá riêng: thử lại không thẻ (chỉ nhịp + không lời).
      items = await this.search({ ...query, mood: '' })
    }
    if (items.length === 0) throw new Error('no_results')
    // Trong 5 kết quả đầu, ưu tiên bài chưa dùng gần đây.
    const top = items.slice(0, 5)
    const pick = top.find((c) => !this.recent.includes(c.id)) ?? top[0]!
    this.recent.push(pick.id)
    if (this.recent.length > 20) this.recent.shift()
    const existing = await this.deps.library.findByOrigin('jamendo', pick.id)
    if (existing) return existing
    return this.download(pick)
  }

  private async download(item: MusicCandidate): Promise<MusicTrack> {
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
    if (declared > MAX_MUSIC_BYTES) throw new Error('online_too_large')
    await mkdir(this.deps.tmpDir, { recursive: true })
    const tmp = join(this.deps.tmpDir, `dl-jamendo-${item.id.replace(/[^\w-]/g, '_')}.mp3`)
    let received = 0
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length
        if (received > MAX_MUSIC_BYTES) done(new Error('online_too_large'))
        else done(null, chunk)
      },
    })
    try {
      await pipeline(
        Readable.fromWeb(response.body as unknown as WebReadableStream),
        limit,
        createWriteStream(tmp),
      )
      return await this.deps.library.addTrack(tmp, {
        name: item.artist ? `${item.name} – ${item.artist}` : item.name,
        credit: item.credit,
        origin: { source: 'jamendo', id: item.id },
      })
    } finally {
      await rm(tmp, { force: true })
    }
  }
}
