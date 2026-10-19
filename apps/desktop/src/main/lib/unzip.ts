import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'

/**
 * Chọn nơi lưu cho một mục trong file zip: trả về đường dẫn tương đối (dưới thư mục đích, dùng
 * dấu `/`) hoặc null để bỏ qua. Tên mục luôn dùng `/` và thư mục kết thúc bằng `/`.
 */
export type EntryMapper = (entryName: string) => string | null

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((ok, fail) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) =>
      error || !zip ? fail(error ?? new Error('zip')) : ok(zip),
    ),
  )
}

/** Đường dẫn đích phải nằm trong thư mục đích (chống "zip slip" kiểu `../../x`). */
function safeTarget(destDir: string, rel: string): string {
  const target = resolve(destDir, rel)
  const inside = relative(resolve(destDir), target)
  if (!inside || inside.startsWith('..') || inside.startsWith(sep) || resolve(inside) === inside) {
    throw new Error(`unzip_unsafe_path: ${rel}`)
  }
  return target
}

/**
 * Giải nén các mục được `map` chọn vào `destDir`, tạo thư mục con khi cần. Trả về danh sách
 * đường dẫn tương đối đã ghi. Mục thư mục (kết thúc `/`) được bỏ qua; thư mục được tạo theo file.
 */
export async function extractZip(
  zipPath: string,
  destDir: string,
  map: EntryMapper,
): Promise<string[]> {
  const written: string[] = []
  await mkdir(destDir, { recursive: true })
  const zip = await openZip(zipPath)
  try {
    await new Promise<void>((done, fail) => {
      zip.on('error', fail)
      zip.on('end', () => done())
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          const name = entry.fileName
          const rel = name.endsWith('/') ? null : map(name)
          if (rel) {
            const target = safeTarget(destDir, join(...rel.split('/')))
            await mkdir(dirname(target), { recursive: true })
            const stream = await new Promise<NodeJS.ReadableStream>((ok, no) =>
              zip.openReadStream(entry, (error, s) => (error || !s ? no(error) : ok(s))),
            )
            await pipeline(stream, createWriteStream(target))
            written.push(rel)
          }
          zip.readEntry()
        })().catch(fail)
      })
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
  return written
}
