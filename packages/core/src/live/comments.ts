export interface LiveComment {
  id: string
  platform: 'youtube' | 'facebook'
  author: string
  text: string
  /** Thời điểm (ms epoch). */
  at: number
}

/** Đọc phản hồi liveChatMessages.list của YouTube Data API v3. */
export function parseYouTubeChat(response: unknown): {
  comments: LiveComment[]
  nextPageToken: string | null
  pollMs: number
} {
  const r = (typeof response === 'object' && response !== null ? response : {}) as Record<
    string,
    unknown
  >
  const items = Array.isArray(r.items) ? r.items : []
  const comments = items.flatMap((item): LiveComment[] => {
    const it = item as {
      id?: unknown
      snippet?: Record<string, unknown>
      authorDetails?: Record<string, unknown>
    }
    const text = it.snippet?.displayMessage
    if (typeof it.id !== 'string' || typeof text !== 'string') return []
    const published = Date.parse(String(it.snippet?.publishedAt ?? ''))
    return [
      {
        id: `yt-${it.id}`,
        platform: 'youtube',
        author:
          typeof it.authorDetails?.displayName === 'string'
            ? it.authorDetails.displayName
            : 'YouTube',
        text,
        at: Number.isFinite(published) ? published : Date.now(),
      },
    ]
  })
  const poll = typeof r.pollingIntervalMillis === 'number' ? r.pollingIntervalMillis : 5000
  return {
    comments,
    nextPageToken: typeof r.nextPageToken === 'string' ? r.nextPageToken : null,
    pollMs: Math.min(30_000, Math.max(2000, poll)),
  }
}

/** Đọc phản hồi /{live-video-id}/comments của Facebook Graph API. */
export function parseFacebookComments(response: unknown): LiveComment[] {
  const r = (typeof response === 'object' && response !== null ? response : {}) as Record<
    string,
    unknown
  >
  const data = Array.isArray(r.data) ? r.data : []
  return data.flatMap((item): LiveComment[] => {
    const c = item as {
      id?: unknown
      message?: unknown
      created_time?: unknown
      from?: { name?: unknown }
    }
    if (typeof c.id !== 'string' || typeof c.message !== 'string') return []
    const at = Date.parse(String(c.created_time ?? ''))
    return [
      {
        id: `fb-${c.id}`,
        platform: 'facebook',
        author: typeof c.from?.name === 'string' ? c.from.name : 'Facebook',
        text: c.message,
        at: Number.isFinite(at) ? at : Date.now(),
      },
    ]
  })
}

/** Gộp bình luận mới vào danh sách, bỏ trùng, giữ tối đa `limit` bình luận mới nhất. */
export function mergeComments(
  current: readonly LiveComment[],
  incoming: readonly LiveComment[],
  limit = 300,
): LiveComment[] {
  const seen = new Set(current.map((c) => c.id))
  const merged = [...current, ...incoming.filter((c) => !seen.has(c.id))].sort(
    (a, b) => a.at - b.at,
  )
  return merged.slice(-limit)
}
