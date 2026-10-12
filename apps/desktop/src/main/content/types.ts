import type { OnlineItem, OnlineSearch } from '@shared/ipc'
import type { FetchLike } from '../key-validation'

export type { OnlineItem, OnlineSearch }

/** Lỗi gọi kho nội dung, mã ngắn để giao diện dịch ra lời dễ hiểu. */
export class ContentError extends Error {
  constructor(readonly code: 'net_offline' | 'key_invalid' | 'quota' | 'bad_response') {
    super(code)
    this.name = 'ContentError'
  }
}

export const SEARCH_TIMEOUT_MS = 15_000

/** Gọi API trả JSON, đổi lỗi mạng / HTTP thành mã chuẩn. */
export async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
  } catch {
    throw new ContentError('net_offline')
  }
  if (response.status === 401 || response.status === 403) throw new ContentError('key_invalid')
  if (response.status === 429) throw new ContentError('quota')
  if (response.status === 400) {
    // Pixabay / Google trả 400 khi key sai.
    const body = await response.text().catch(() => '')
    if (/key/i.test(body)) throw new ContentError('key_invalid')
    throw new ContentError('bad_response')
  }
  if (!response.ok) throw new ContentError('bad_response')
  try {
    return await response.json()
  } catch {
    throw new ContentError('bad_response')
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
export const int = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
