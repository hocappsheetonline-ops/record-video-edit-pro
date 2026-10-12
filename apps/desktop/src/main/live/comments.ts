import { parseFacebookComments, parseYouTubeChat, type LiveComment } from '@lumora/core'
import type { FetchLike } from '../key-validation'

export function youtubeApiBase(): string {
  return (process.env.LUMORA_YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(
    /\/+$/,
    '',
  )
}

export function facebookApiBase(): string {
  return (process.env.LUMORA_FACEBOOK_API_BASE || 'https://graph.facebook.com/v19.0').replace(
    /\/+$/,
    '',
  )
}

export interface CommentSink {
  onComments(comments: LiveComment[]): void
  onError(message: string): void
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

async function getJson(fetchImpl: FetchLike, url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetchImpl(url, { signal })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body
}

/** Lấy chat của buổi live trên YouTube (YouTube Data API v3, chỉ cần API key cho buổi live công khai). */
export async function pollYouTube(
  options: { apiKey: string; videoId: string; fetchImpl?: FetchLike },
  sink: CommentSink,
  signal: AbortSignal,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = youtubeApiBase()
  const key = encodeURIComponent(options.apiKey)
  try {
    const video = (await getJson(
      fetchImpl,
      `${base}/videos?part=liveStreamingDetails&id=${encodeURIComponent(options.videoId)}&key=${key}`,
      signal,
    )) as { items?: { liveStreamingDetails?: { activeLiveChatId?: string } }[] }
    const chatId = video.items?.[0]?.liveStreamingDetails?.activeLiveChatId
    if (!chatId) throw new Error('Không tìm thấy chat của buổi live (video chưa phát hoặc sai ID)')
    let pageToken: string | null = null
    while (!signal.aborted) {
      const url = `${base}/liveChat/messages?liveChatId=${encodeURIComponent(chatId)}&part=snippet,authorDetails&key=${key}${
        pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      }`
      const parsed = parseYouTubeChat(await getJson(fetchImpl, url, signal))
      if (parsed.comments.length > 0) sink.onComments(parsed.comments)
      pageToken = parsed.nextPageToken
      await sleep(parsed.pollMs, signal)
    }
  } catch (error) {
    if (!signal.aborted) sink.onError(`YouTube: ${(error as Error).message}`)
  }
}

/** Lấy bình luận buổi live trên Facebook (Graph API, cần Page access token). */
export async function pollFacebook(
  options: { token: string; videoId: string; fetchImpl?: FetchLike; intervalMs?: number },
  sink: CommentSink,
  signal: AbortSignal,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${facebookApiBase()}/${encodeURIComponent(options.videoId)}/comments?access_token=${encodeURIComponent(
    options.token,
  )}&order=reverse_chronological&fields=id,message,created_time,from&limit=50`
  try {
    while (!signal.aborted) {
      const comments = parseFacebookComments(await getJson(fetchImpl, url, signal))
      if (comments.length > 0) sink.onComments(comments)
      await sleep(options.intervalMs ?? 4000, signal)
    }
  } catch (error) {
    if (!signal.aborted) sink.onError(`Facebook: ${(error as Error).message}`)
  }
}
