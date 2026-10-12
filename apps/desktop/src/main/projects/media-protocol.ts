import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { isProjectFolderName, safeJoin } from './library'

export const MEDIA_SCHEME = 'lumora-media'

const MIME: Record<string, string> = {
  '.mkv': 'video/webm',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.jsonl': 'application/x-ndjson',
}

export interface ByteRange {
  start: number
  end: number
}

/**
 * Đọc header Range ("bytes=100-199", "bytes=100-", "bytes=-500").
 * Trình phát video cần tính năng này để tua. Trả về `'invalid'` nếu vượt kích thước file.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startText, endText] = match
  if (!startText && !endText) return 'invalid'
  let start: number
  let end: number
  if (!startText) {
    const suffix = Number(endText)
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText ? Math.min(Number(endText), size - 1) : size - 1
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/** URL dạng lumora-media://projects/<thư mục dự án>/<tên file>. */
export function resolveMediaPath(url: string, projectsDir: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.host !== 'projects') return null
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length !== 2) return null
  const [folder, file] = parts as [string, string]
  if (!isProjectFolderName(folder) || !/^[\w.-]+$/.test(file) || file.startsWith('.')) return null
  return safeJoin(projectsDir, folder, file)
}

/** Trả file media từ thư mục dự án, hỗ trợ đọc từng phần (Range) để tua video. */
export async function handleMediaRequest(request: Request, projectsDir: string): Promise<Response> {
  const path = resolveMediaPath(request.url, projectsDir)
  if (!path) return new Response('Not found', { status: 404 })
  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) return new Response('Not found', { status: 404 })
    size = info.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const headers = new Headers({
    'Content-Type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  })
  const range = parseRange(request.headers.get('range'), size)
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  const { start, end } = range ?? { start: 0, end: size - 1 }
  headers.set('Content-Length', String(size === 0 ? 0 : end - start + 1))
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  const body =
    size === 0
      ? null
      : (Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream)
  return new Response(body, { status: range ? 206 : 200, headers })
}
