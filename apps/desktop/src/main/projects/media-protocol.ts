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
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.jsonl': 'application/x-ndjson',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.tflite': 'application/octet-stream',
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

/** Tên file an toàn: một đoạn đường dẫn, không bắt đầu bằng dấu chấm (chặn `..` và file ẩn). */
const isSafeFileName = (file: string): boolean => /^[\w.-]+$/.test(file) && !file.startsWith('.')

/**
 * URL dạng lumora-media://projects/<thư mục dự án>/<tên file>, lumora-media://ai/<tên file>
 * cho các file của AI xóa phông (chỉ những file trong danh sách cho phép `aiFiles`), hoặc
 * lumora-media://library/<tên thư viện>/<tên file> cho thư viện chung (meme, nhạc) — chỉ các
 * thư viện có trong `libraries` (tên → thư mục), để xem trước mà không cần chép vào dự án.
 */
export function resolveMediaPath(
  url: string,
  projectsDir: string,
  aiFiles: Readonly<Record<string, string>> = {},
  libraries: Readonly<Record<string, string>> = {},
): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.host === 'ai') {
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    return Object.hasOwn(aiFiles, name) ? aiFiles[name]! : null
  }
  if (parsed.host !== 'projects' && parsed.host !== 'library') return null
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length !== 2) return null
  const [folder, file] = parts as [string, string]
  if (!isSafeFileName(file)) return null
  if (parsed.host === 'library') {
    return Object.hasOwn(libraries, folder) ? safeJoin(libraries[folder]!, file) : null
  }
  if (!isProjectFolderName(folder)) return null
  return safeJoin(projectsDir, folder, file)
}

/**
 * Cho phép giao diện (chạy từ file://) đọc media bằng fetch — bộ giải mã khung hình khi xuất video cần.
 * Chỉ đọc, và chỉ các file nằm trong thư mục dự án.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
}

/**
 * Trả file media từ thư mục dự án (hoặc thư viện chung trong `libraries`),
 * hỗ trợ đọc từng phần (Range) để tua video.
 */
export async function handleMediaRequest(
  request: Request,
  projectsDir: string,
  aiFiles: Readonly<Record<string, string>> = {},
  libraries: Readonly<Record<string, string>> = {},
): Promise<Response> {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  const path = resolveMediaPath(request.url, projectsDir, aiFiles, libraries)
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
    ...CORS_HEADERS,
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
    size === 0 || request.method === 'HEAD'
      ? null
      : (Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream)
  return new Response(body, { status: range ? 206 : 200, headers })
}
