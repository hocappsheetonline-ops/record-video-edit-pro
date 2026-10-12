import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

export interface MockContentFiles {
  /** Video meme (MP4) mà kết quả GIPHY / Pixabay video trỏ tới. */
  video: string
  /** Ảnh GIF (sticker / ảnh). */
  gif: string
  /** Ảnh JPG thu nhỏ. */
  thumb: string
}

/**
 * Máy chủ giả GIPHY + Pixabay: trả JSON đúng cấu trúc API thật, các URL ảnh / video trỏ về chính
 * máy chủ này. Key hợp lệ: GIPHY `mockGiphyKey…`, Pixabay `mock-pixabay-key…`. Ghi lại các
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
    const giphy = /^\/v1\/(gifs|stickers)\/(search|trending)$/.exec(url.pathname)
    if (giphy) {
      const apiKey = url.searchParams.get('api_key') ?? ''
      if (!apiKey.startsWith('mockGiphy'))
        return json(401, { meta: { status: 401, msg: 'Unauthorized' } })
      const sticker = giphy[1] === 'stickers'
      const q = url.searchParams.get('q') ?? 'trending'
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const total = 6
      const count = Math.max(0, Math.min(3, total - offset))
      const data = Array.from({ length: count }, (_, i) => {
        const id = `${sticker ? 's' : 'g'}${offset + i}`
        // Giống API thật: kích thước dạng chuỗi, URL có tham số theo dõi phía sau.
        const media = (name: string, w: number, h: number) => ({
          url: `${base}/media/${id}-${name}.gif?cid=mock&rid=giphy.gif&ct=${sticker ? 's' : 'g'}`,
          width: String(w),
          height: String(h),
          ...(sticker
            ? {}
            : { mp4: `${base}/media/${id}-${name}.mp4?cid=mock&rid=giphy.mp4&ct=g` }),
        })
        return {
          type: sticker ? 'sticker' : 'gif',
          id,
          title: `${q} ${offset + i + 1}`,
          alt_text: '',
          images: sticker
            ? {
                original: media('original', 200, 200),
                fixed_width_small: media('small', 100, 100),
              }
            : {
                original: media('original', 320, 180),
                fixed_width: media('fixed', 200, 113),
                fixed_width_small: media('small', 100, 56),
              },
        }
      })
      return json(200, {
        data,
        pagination: { total_count: total, count, offset },
        meta: { status: 200, msg: 'OK' },
      })
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
