import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc'
import type { Validators } from './key-validation'
import { SecretStore, type Cipher } from './secret-store'
import { SettingsStore } from './settings-store'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const cipher: Cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
}

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234'

let dir: string
let handlers: Map<string, Handler>
let validators: { [K in keyof Validators]: Mock<Validators[K]> }

const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-ipc-'))
  handlers = new Map()
  validators = {
    elevenlabs: vi.fn<Validators['elevenlabs']>(async () => ({ ok: true })),
    anthropic: vi.fn<Validators['anthropic']>(async () => ({ ok: true })),
  }
  registerIpc(
    {
      handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
    } as unknown as Pick<IpcMain, 'handle'>,
    {
      settings: new SettingsStore(join(dir, 'settings.json')),
      secrets: new SecretStore(join(dir, 'secrets.json'), cipher),
      validators,
      appInfo: () => ({
        name: 'Lumora',
        version: '0.0.0',
        platform: 'win32',
        encryptionAvailable: true,
      }),
    },
  )
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('registerIpc', () => {
  it('đăng ký đủ các kênh', () => {
    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC).sort())
  })

  it('cập nhật settings', async () => {
    expect(await call(IPC.settingsUpdate, { language: 'en' })).toMatchObject({ language: 'en' })
    expect(await call(IPC.settingsGet)).toMatchObject({ language: 'en' })
  })

  it('bỏ qua patch settings không phải object', async () => {
    expect(await call(IPC.settingsUpdate, 'oops')).toMatchObject({ language: 'vi' })
  })

  it('lưu key và chỉ trả về dạng rút gọn', async () => {
    const status = await call(IPC.secretsSave, 'anthropic', `  ${KEY}  `)
    expect(status).toMatchObject({ anthropic: { state: 'saved', masked: 'sk-a••••••••1234' } })
  })

  it('từ chối loại key lạ', async () => {
    await expect(call(IPC.secretsSave, 'openai', KEY)).rejects.toThrow(/không hợp lệ/)
  })

  it('từ chối key sai định dạng', async () => {
    await expect(call(IPC.secretsSave, 'anthropic', 'abc')).rejects.toThrow(/too_short/)
  })

  it('kiểm tra key đã lưu khi không truyền giá trị', async () => {
    await call(IPC.secretsSave, 'anthropic', KEY)
    expect(await call(IPC.secretsTest, 'anthropic')).toEqual({ ok: true })
    expect(validators.anthropic).toHaveBeenCalledWith(KEY)
  })

  it('kiểm tra key mới khi có truyền giá trị', async () => {
    await call(IPC.secretsTest, 'elevenlabs', 'y'.repeat(30))
    expect(validators.elevenlabs).toHaveBeenCalledWith('y'.repeat(30))
  })

  it('báo lỗi định dạng khi chưa có key nào', async () => {
    expect(await call(IPC.secretsTest, 'anthropic')).toEqual({
      ok: false,
      reason: 'format',
      message: 'empty',
    })
  })

  it('xóa key', async () => {
    await call(IPC.secretsSave, 'anthropic', KEY)
    expect(await call(IPC.secretsDelete, 'anthropic')).toMatchObject({
      anthropic: { state: 'missing' },
    })
  })
})
