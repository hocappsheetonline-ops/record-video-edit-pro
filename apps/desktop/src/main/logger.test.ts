import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Logger, loggingIpc, redactSecrets } from './logger'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-log-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('redactSecrets', () => {
  it('che API key, token và stream key', () => {
    const text = [
      'key sk-ant-api03-abcdefghijklmnop',
      'el sk_0123456789abcdef0123',
      'yt AIzaSyA1234567890abcdef',
      'fb EAAGm0PX4ZCpsBAKZB0ZCZAZBxyz123',
      'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop',
    ].join('\n')
    const out = redactSecrets(text)
    for (const secret of [
      'abcdefghijklmnop',
      '0123456789abcdef0123',
      '1234567890abcdef',
      'ZCpsBAKZB0',
      'efgh-ijkl',
    ]) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain('rtmp://a.rtmp.youtube.com/live2/')
    expect(out).toContain('sk-a•••')
  })

  it('giữ nguyên câu chữ bình thường', () => {
    expect(redactSecrets('Ghép âm thanh thất bại: exit 1')).toBe('Ghép âm thanh thất bại: exit 1')
  })
})

describe('Logger', () => {
  it('ghi dòng có thời gian, mức độ, phạm vi và stack lỗi', async () => {
    const logger = new Logger(
      join(dir, 'logs', 'main.log'),
      1024 * 1024,
      () => new Date('2026-10-12T05:00:00Z'),
    )
    logger.info('app', 'Lumora 0.1.0 khởi động')
    logger.error('export', new Error('hỏng rồi'))
    await logger.flush()
    const text = await readFile(join(dir, 'logs', 'main.log'), 'utf8')
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('2026-10-12T05:00:00.000Z INFO  [app] Lumora 0.1.0 khởi động')
    expect(lines[1]).toBe('2026-10-12T05:00:00.000Z ERROR [export] Error: hỏng rồi')
    expect(text).toContain('logger.test.ts')
  })

  it('xoay file khi vượt giới hạn, chỉ giữ một bản cũ', async () => {
    const file = join(dir, 'main.log')
    const logger = new Logger(file, 200)
    for (let i = 0; i < 10; i++) logger.info('t', `dòng số ${i} ${'x'.repeat(40)}`)
    await logger.flush()
    const current = await readFile(file, 'utf8')
    const old = await readFile(join(dir, 'main.old.log'), 'utf8')
    expect(Buffer.byteLength(current)).toBeLessThanOrEqual(200)
    expect(current).toContain('dòng số 9')
    expect(old).not.toContain('dòng số 9')
  })
})

describe('loggingIpc', () => {
  it('ghi lỗi handler rồi ném lại; kết quả bình thường đi qua nguyên vẹn', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = {
      handle: (channel: string, fn: (...args: never[]) => unknown) =>
        void handlers.set(channel, fn as (...args: unknown[]) => unknown),
    } as unknown as Pick<IpcMain, 'handle'>
    const logged: [string, unknown][] = []
    const wrapped = loggingIpc(ipc, { error: (scope, e) => logged.push([scope, e]) })
    wrapped.handle('a', (_e, x: number) => x * 2)
    wrapped.handle('b', async () => {
      throw new Error('missing_key:elevenlabs')
    })
    await expect(handlers.get('a')!({}, 21)).resolves.toBe(42)
    await expect(handlers.get('b')!({})).rejects.toThrow('missing_key:elevenlabs')
    expect(logged).toHaveLength(1)
    expect(logged[0]![0]).toBe('ipc b')
  })
})
