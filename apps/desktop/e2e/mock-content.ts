import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

export interface MockContentFiles {
  /** Video meme (MP4) mà kết quả Tenor / Pixabay video trỏ tới. */
  video: string
  /** Ảnh GIF (sticker / ảnh). */
  gif: string
  /** Ảnh JPG thu nhỏ. */
  thumb: string
}

/**
 * Máy chủ giả Tenor + Pixabay: trả JSON đúng cấu trúc API thật, các URL ảnh / video trỏ về chính
 * máy chủ này. Key hợp lệ: Tenor `AIzaMockTenorKey…`, Pixabay `mock-pixabay-key…`. Ghi lại các
 * request để test kiểm tra.
 */
export async function startMockContent(files: MockContentFiles): Promise<{
  url: string
  requests: { path: string; query: URLSearchParams }[]
  close(): Promise<void>
}> {
  const requests: { path: string; query: URLSearchParams }[] = []
  let base = ''
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push({ path: url.pathname, query: url.searchParams })
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    const file = (path: string, type: string) => {
      const data = readFileSync(path)
      res.writeHead(200, {
        'content-type': type,
        'content-length': data.length,
        'access-control-allow-origin': '*',
      })
      res.end(data)
    }
    const key = url.searchParams.get('key') ?? ''
    if (url.pathname.startsWith('/media/')) {
      if (url.pathname.endsWith('.mp4')) return file(files.video, 'video/mp4')
      if (url.pathname.endsWith('.gif')) return file(files.gif, 'image/gif')
      return file(files.thumb, 'image/jpeg')
    }
    if (url.pathname === '/v2/search' || url.pathname === '/v2/featured') {
      if (!key.startsWith('AIzaMock')) return json(400, { error: { message: 'API key not valid' } })
      const sticker = url.searchParams.get('searchfilter') === 'sticker'
      const q = url.searchParams.get('q') ?? 'featured'
      const pos = Number(url.searchParams.get('pos') ?? 0)
      const results = Array.from({ length: 3 }, (_, i) => {
        const id = `${sticker ? 's' : 't'}${pos + i}`
        const media = (name: string, ext: string, dims: number[]) => ({
          url: `${base}/media/${id}-${name}.${ext}`,
          dims,
          duration: 2,
          size: 1000,
        })
        return {
          id,
          title: '',
          content_description: `${q} ${pos + i + 1}`,
          media_formats: sticker
            ? {
                gif_transparent: media('gif', 'gif', [200, 200]),
                tinygif_transparent: media('tiny', 'gif', [100, 100]),
              }
            : {
                mp4: media('mp4', 'mp4', [320, 180]),
                tinymp4: media('tinymp4', 'mp4', [160, 90]),
                gif: media('gif', 'gif', [320, 180]),
                tinygif: media('tinygif', 'gif', [160, 90]),
              },
        }
      })
      return json(200, { results, next: pos < 3 ? String(pos + 3) : '' })
    }
    if (url.pathname === '/api/videos/' || url.pathname === '/api/') {
      if (!key.startsWith('mock-pixabay'))
        return json(400, '[ERROR 400] Invalid or missing API key')
      const page = Number(url.searchParams.get('page') ?? 1)
      const video = url.pathname === '/api/videos/'
      const hits = Array.from({ length: 2 }, (_, i) => {
        const id = page * 100 + i
        return video
          ? {
              id,
              tags: `${url.searchParams.get('q') ?? 'stock'} ${i + 1}, demo`,
              duration: 2,
              videos: {
                small: {
                  url: `${base}/media/p${id}.mp4`,
                  width: 320,
                  height: 180,
                  thumbnail: `${base}/media/p${id}.jpg`,
                },
                tiny: {
                  url: `${base}/media/p${id}-tiny.mp4`,
                  width: 160,
                  height: 90,
                  thumbnail: `${base}/media/p${id}-tiny.jpg`,
                },
              },
            }
          : {
              id,
              tags: `${url.searchParams.get('q') ?? 'photo'} ${i + 1}`,
              previewURL: `${base}/media/i${id}.jpg`,
              webformatURL: `${base}/media/i${id}.gif`,
              webformatWidth: 200,
              webformatHeight: 200,
            }
      })
      return json(200, { total: 30, totalHits: 30, hits })
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  return {
    url: base,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
