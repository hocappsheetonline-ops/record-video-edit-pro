import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** File đánh dấu dự án đang mở trong trình chỉnh sửa (xóa khi đóng bình thường). */
export const LOCK_FILE = '.editing.lock'

/** Mã của lần chạy app này: khóa của lần chạy khác còn sót lại nghĩa là app đã tắt đột ngột. */
const SESSION = randomUUID()

/**
 * Đánh dấu dự án đang được chỉnh sửa. `recovered` = true khi còn khóa của một lần chạy trước
 * (app bị tắt đột ngột / mất điện): bản chỉnh sửa tự lưu gần nhất đã được mở lại.
 */
export async function acquireLock(
  dir: string,
  session: string = SESSION,
): Promise<{ recovered: boolean }> {
  let recovered = false
  try {
    const old = JSON.parse(await readFile(join(dir, LOCK_FILE), 'utf8')) as { session?: unknown }
    recovered = old.session !== session
  } catch {
    recovered = false
  }
  await writeFile(
    join(dir, LOCK_FILE),
    JSON.stringify({ session, pid: process.pid, at: new Date().toISOString() }),
  )
  return { recovered }
}

export async function releaseLock(dir: string): Promise<void> {
  await rm(join(dir, LOCK_FILE), { force: true })
}
