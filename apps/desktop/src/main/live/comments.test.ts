import { describe, expect, it, vi } from 'vitest'
import type { LiveComment } from '@lumora/core'
import type { FetchLike } from '../key-validation'
import { pollFacebook, pollYouTube } from './comments'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

describe('bình luận', () => {
  it('YouTube: tìm chat của video rồi đọc liên tục theo pageToken', async () => {
    const urls: string[] = []
    const controller = new AbortController()
    const got: LiveComment[] = []
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('/videos?'))
        return json({ items: [{ liveStreamingDetails: { activeLiveChatId: 'chat1' } }] })
      const page = urls.filter((u) => u.includes('/liveChat/')).length
      if (page >= 2) controller.abort()
      return json({
        nextPageToken: `p${page}`,
        pollingIntervalMillis: 0,
        items: [
          {
            id: `m${page}`,
            snippet: { displayMessage: `Tin ${page}`, publishedAt: '2026-01-01T00:00:00Z' },
            authorDetails: { displayName: 'An' },
          },
        ],
      })
    }
    await pollYouTube(
      { apiKey: 'K', videoId: 'V', fetchImpl },
      { onComments: (c) => got.push(...c), onError: vi.fn() },
      controller.signal,
    )
    expect(urls[0]).toContain('/videos?part=liveStreamingDetails&id=V&key=K')
    expect(urls[1]).toContain('liveChatId=chat1')
    expect(urls[2]).toContain('pageToken=p1')
    expect(got.map((c) => c.text)).toEqual(['Tin 1', 'Tin 2'])
  })

  it('YouTube: báo lỗi dễ hiểu khi video chưa live', async () => {
    const onError = vi.fn()
    await pollYouTube(
      { apiKey: 'K', videoId: 'V', fetchImpl: async () => json({ items: [] }) },
      { onComments: vi.fn(), onError },
      new AbortController().signal,
    )
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Không tìm thấy chat'))
  })

  it('Facebook: đọc bình luận định kỳ, báo lỗi token', async () => {
    const controller = new AbortController()
    const got: LiveComment[] = []
    let calls = 0
    const fetchImpl: FetchLike = async (input) => {
      expect(String(input)).toContain('/LV/comments?access_token=T')
      calls += 1
      if (calls === 2) controller.abort()
      return json({ data: [{ id: String(calls), message: 'Hi', from: { name: 'B' } }] })
    }
    await pollFacebook(
      { token: 'T', videoId: 'LV', fetchImpl, intervalMs: 0 },
      { onComments: (c) => got.push(...c), onError: vi.fn() },
      controller.signal,
    )
    expect(got).toHaveLength(2)
    const onError = vi.fn()
    await pollFacebook(
      {
        token: 'T',
        videoId: 'LV',
        fetchImpl: async () => json({ error: { message: 'Invalid OAuth access token' } }, 400),
      },
      { onComments: vi.fn(), onError },
      new AbortController().signal,
    )
    expect(onError).toHaveBeenCalledWith('Facebook: Invalid OAuth access token')
  })
})
