import type { FetchLike } from '../key-validation'
import { tenorBaseUrl } from './endpoints'
import { getJson, int, isObj, str, type OnlineItem, type OnlineSearch } from './types'

export const TENOR_PAGE = 24

interface Format {
  url: string
  dims: [number, number]
  duration: number
}

function format(v: unknown): Format | null {
  if (!isObj(v) || typeof v.url !== 'string' || !/^https?:\/\//.test(v.url)) return null
  const dims = Array.isArray(v.dims) ? v.dims : []
  return {
    url: v.url,
    dims: [int(dims[0]), int(dims[1])],
    duration: typeof v.duration === 'number' ? v.duration : 0,
  }
}

/**
 * Tìm meme trên Tenor (GIF / video ngắn, hoặc sticker nền trong suốt). Không có từ khóa thì lấy
 * danh sách nổi bật. Tải về ưu tiên MP4 (nhẹ, có thể dài hơn GIF), sticker thì GIF trong suốt.
 */
export async function searchTenor(
  apiKey: string,
  options: { q: string; kind: 'gif' | 'sticker'; next?: string | null; fetchImpl?: FetchLike },
): Promise<OnlineSearch> {
  const sticker = options.kind === 'sticker'
  const params = new URLSearchParams({
    key: apiKey,
    client_key: 'lumora',
    limit: String(TENOR_PAGE),
    contentfilter: 'medium',
    locale: 'vi_VN',
    media_filter: sticker ? 'gif_transparent,tinygif_transparent' : 'gif,tinygif,mp4,tinymp4',
  })
  if (options.q.trim()) params.set('q', options.q.trim())
  if (sticker) params.set('searchfilter', 'sticker')
  if (options.next) params.set('pos', options.next)
  const path = options.q.trim() ? 'search' : 'featured'
  const data = await getJson(`${tenorBaseUrl()}/v2/${path}?${params}`, options.fetchImpl ?? fetch)
  const results = isObj(data) && Array.isArray(data.results) ? data.results : []
  const items = results.flatMap((r): OnlineItem[] => {
    if (!isObj(r) || typeof r.id !== 'string' || !isObj(r.media_formats)) return []
    const f = r.media_formats
    const full = sticker ? format(f.gif_transparent) : (format(f.mp4) ?? format(f.gif))
    const preview = sticker
      ? (format(f.tinygif_transparent) ?? full)
      : (format(f.tinymp4) ?? format(f.tinygif) ?? full)
    const thumb = sticker ? preview : (format(f.tinygif) ?? preview)
    if (!full || !preview || !thumb) return []
    const video = !sticker && full.url.includes('.mp4')
    return [
      {
        id: r.id,
        source: 'tenor',
        kind: sticker ? 'sticker' : video ? 'video' : 'gif',
        title: str(r.content_description) || str(r.title) || 'Tenor',
        thumbUrl: thumb.url,
        previewUrl: preview.url,
        downloadUrl: full.url,
        width: full.dims[0] || 320,
        height: full.dims[1] || 240,
        durationMs: Math.round(full.duration * 1000),
      },
    ]
  })
  const next = isObj(data) && typeof data.next === 'string' && data.next ? data.next : null
  return { items, next: items.length > 0 ? next : null, attribution: 'Powered by Tenor' }
}
