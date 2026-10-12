import type { FetchLike } from '../key-validation'
import { pixabayBaseUrl } from './endpoints'
import { getJson, int, isObj, str, type OnlineItem, type OnlineSearch } from './types'

export const PIXABAY_PAGE = 24

const url = (v: unknown) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : '')

/** Tìm video hoặc ảnh miễn phí trên Pixabay (không cần ghi nguồn). */
export async function searchPixabay(
  apiKey: string,
  options: { q: string; kind: 'video' | 'image'; next?: string | null; fetchImpl?: FetchLike },
): Promise<OnlineSearch> {
  const page = Math.max(1, Number(options.next) || 1)
  const params = new URLSearchParams({
    key: apiKey,
    per_page: String(PIXABAY_PAGE),
    page: String(page),
    safesearch: 'true',
    lang: 'vi',
  })
  if (options.q.trim()) params.set('q', options.q.trim())
  if (options.kind === 'image') params.set('image_type', 'all')
  const path = options.kind === 'video' ? '/api/videos/' : '/api/'
  const data = await getJson(`${pixabayBaseUrl()}${path}?${params}`, options.fetchImpl ?? fetch)
  const hits = isObj(data) && Array.isArray(data.hits) ? data.hits : []
  const total = isObj(data) ? int(data.totalHits) : 0
  const items = hits.flatMap((h): OnlineItem[] => {
    if (!isObj(h) || (typeof h.id !== 'number' && typeof h.id !== 'string')) return []
    const title = str(h.tags).split(',')[0]?.trim() || 'Pixabay'
    if (options.kind === 'video') {
      const v = isObj(h.videos) ? h.videos : {}
      const small = isObj(v.small) ? v.small : {}
      const tiny = isObj(v.tiny) ? v.tiny : small
      const downloadUrl = url(small.url) || url(tiny.url)
      const previewUrl = url(tiny.url) || downloadUrl
      const thumbUrl = url(tiny.thumbnail) || url(small.thumbnail)
      if (!downloadUrl || !thumbUrl) return []
      return [
        {
          id: String(h.id),
          source: 'pixabay',
          kind: 'video',
          title,
          thumbUrl,
          previewUrl,
          downloadUrl,
          width: int(small.width, 640),
          height: int(small.height, 360),
          durationMs: int(h.duration) * 1000,
        },
      ]
    }
    const downloadUrl = url(h.webformatURL) || url(h.largeImageURL)
    const thumbUrl = url(h.previewURL) || downloadUrl
    if (!downloadUrl) return []
    return [
      {
        id: String(h.id),
        source: 'pixabay',
        kind: 'image',
        title,
        thumbUrl,
        previewUrl: thumbUrl,
        downloadUrl,
        width: int(h.webformatWidth, 640),
        height: int(h.webformatHeight, 480),
        durationMs: 0,
      },
    ]
  })
  const hasMore = items.length > 0 && page * PIXABAY_PAGE < total
  return {
    items,
    next: hasMore ? String(page + 1) : null,
    attribution: options.kind === 'video' ? 'Video từ Pixabay' : 'Ảnh từ Pixabay',
  }
}
