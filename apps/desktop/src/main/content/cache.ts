import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Tổng dung lượng (byte) các file trong các thư mục (kể cả thư mục con); thư mục chưa có = 0. */
export async function dirSize(dirs: readonly string[]): Promise<number> {
  let total = 0
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.isDirectory()) await walk(path)
      else total += (await stat(path).catch(() => null))?.size ?? 0
    }
  }
  for (const dir of dirs) await walk(dir)
  return total
}

/** Xóa bộ nhớ đệm (file tải tạm, giọng đọc AI đã lưu). Thư viện meme và dự án không bị đụng tới. */
export async function clearDirs(dirs: readonly string[]): Promise<void> {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
}
