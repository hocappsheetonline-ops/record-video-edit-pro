import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquireLock, LOCK_FILE, releaseLock } from './session-lock'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-lock-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('khóa phiên chỉnh sửa', () => {
  it('mở / đóng bình thường: không báo khôi phục; mở lại trong cùng lần chạy cũng vậy', async () => {
    expect(await acquireLock(dir, 's1')).toEqual({ recovered: false })
    expect(await acquireLock(dir, 's1')).toEqual({ recovered: false })
    await releaseLock(dir)
    expect(existsSync(join(dir, LOCK_FILE))).toBe(false)
    expect(await acquireLock(dir, 's2')).toEqual({ recovered: false })
  })

  it('còn khóa của lần chạy trước (app tắt đột ngột): báo khôi phục; khóa hỏng thì bỏ qua', async () => {
    await acquireLock(dir, 'old')
    expect(await acquireLock(dir, 'new')).toEqual({ recovered: true })
    writeFileSync(join(dir, LOCK_FILE), '{hỏng')
    expect(await acquireLock(dir, 'new')).toEqual({ recovered: false })
  })
})
