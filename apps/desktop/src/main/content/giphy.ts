import type { FetchLike } from '../key-validation'
import { giphyBaseUrl } from './endpoints'
import { getJson, int, isObj, str, type OnlineItem, type OnlineSearch } from './types'

export const GIPHY_PAGE = 24
/** GIPHY không trả kết quả quá vị trí này, và từ khóa tối đa 50 ký tự. */
const MAX_OFFSET = 4999
const MAX_QUERY = 50

const url = (v: unknown) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : '')

interface Rendition {
  gif: string
  mp4: string
  width: number
  height: number
}

/** GIPHY trả kích thước dạng chuỗi ("480"). */
const dim = (v: unknown) => (typeof v === 'string' ? int(Number(v)) : int(v))

function rendition(v: unknown): Rendition | null {
  if (!isObj(v)) return null
  const gif = url(v.url)
  const mp4 = url(v.mp4)
  if (!gif && !mp4) return null
  return { gif, mp4, width: dim(v.width), height: dim(v.height) }
}

/**
 * Tìm meme trên GIPHY (GIF / video ngắn, hoặc sticker nền trong suốt). Không có từ khóa thì lấy
 * danh sách thịnh hành. Tải về ưu tiên MP4 (nhẹ hơn GIF nhiều), sticker thì GIF trong suốt.
 */
export async function searchGiphy(
  apiKey: string,
  options: { q: string; kind: 'gif' | 'sticker'; next?: string | null; fetchImpl?: FetchLike },
): Promise<OnlineSearch> {
  const sticker = options.kind === 'sticker'
  const q = options.q.trim().slice(0, MAX_QUERY)
  const offset = Math.max(0, Math.min(MAX_OFFSET, Math.floor(Number(options.next) || 0)))
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(GIPHY_PAGE),
    offset: String(offset),
    rating: 'pg-13',
  })
  if (q) {
    params.set('q', q)
    params.set('lang', 'vi')
  }
  const path = `/v1/${sticker ? 'stickers' : 'gifs'}/${q ? 'search' : 'trending'}`
  const data = await getJson(`${giphyBaseUrl()}${path}?${params}`, options.fetchImpl ?? fetch)
  const results = isObj(data) && Array.isArray(data.data) ? data.data : []
  const items = results.flatMap((r): OnlineItem[] => {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || !isObj(r.images)) return []
    const img = r.images
    const original = rendition(img.original)
    const small = rendition(img.fixed_width_small) ?? rendition(img.fixed_width) ?? original
    if (!original || !small) return []
    const downloadUrl = sticker ? original.gif : original.mp4 || original.gif
    const thumbUrl = small.gif || original.gif
    if (!downloadUrl || !thumbUrl) return []
    const video = !sticker && downloadUrl === original.mp4
    return [
      {
        id: r.id,
        source: 'giphy',
        kind: sticker ? 'sticker' : video ? 'video' : 'gif',
        title: str(r.title).trim() || str(r.alt_text).trim() || 'GIPHY',
        thumbUrl,
        previewUrl: video ? small.mp4 || thumbUrl : thumbUrl,
        downloadUrl,
        width: original.width || 320,
        height: original.height || 240,
        // GIPHY không cho biết độ dài; thư viện đọc độ dài thật sau khi tải về.
        durationMs: 0,
      },
    ]
  })
  const page = isObj(data) && isObj(data.pagination) ? data.pagination : {}
  const end = offset + (int(page.count) || results.length)
  const hasMore = items.length > 0 && end < int(page.total_count) && end <= MAX_OFFSET
  return { items, next: hasMore ? String(end) : null, attribution: 'Powered by GIPHY' }
}
