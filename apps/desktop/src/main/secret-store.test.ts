import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EncryptionUnavailableError, SecretStore, type Cipher } from './secret-store'

/** Mã hóa giả: đảo ngược chuỗi, đủ để kiểm tra key không bị lưu dạng văn bản thường. */
function fakeCipher(available = true): Cipher {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from([...plain].reverse().join(''), 'utf8'),
    decryptString: (buf) => [...buf.toString('utf8')].reverse().join(''),
  }
}

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-secrets-'))
  file = join(dir, 'secrets.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('SecretStore', () => {
  it('báo chưa có key khi file chưa tồn tại', async () => {
    expect(await new SecretStore(file, fakeCipher()).status()).toEqual({
      elevenlabs: { state: 'missing' },
      anthropic: { state: 'missing' },
    })
  })

  it('lưu key đã mã hóa, không để lộ key gốc trong file', async () => {
    await new SecretStore(file, fakeCipher()).set('anthropic', KEY)
    const raw = await readFile(file, 'utf8')
    expect(raw).not.toContain(KEY)
    expect(await new SecretStore(file, fakeCipher()).get('anthropic')).toBe(KEY)
  })

  it('status chỉ trả về dạng rút gọn', async () => {
    const store = new SecretStore(file, fakeCipher())
    await store.set('anthropic', KEY)
    const status = await store.status()
    expect(status.anthropic).toEqual({ state: 'saved', masked: 'sk-a••••••••1234' })
    expect(JSON.stringify(status)).not.toContain(KEY)
  })

  it('xóa key', async () => {
    const store = new SecretStore(file, fakeCipher())
    await store.set('anthropic', KEY)
    await store.set('elevenlabs', 'x'.repeat(32))
    await store.delete('anthropic')
    const reloaded = new SecretStore(file, fakeCipher())
    expect(await reloaded.get('anthropic')).toBeUndefined()
    expect(await reloaded.get('elevenlabs')).toBe('x'.repeat(32))
  })

  it('từ chối lưu khi không có mã hóa', async () => {
    await expect(
      new SecretStore(file, fakeCipher(false)).set('anthropic', KEY),
    ).rejects.toBeInstanceOf(EncryptionUnavailableError)
  })

  it('bỏ qua key không giải mã được (ví dụ chép từ máy khác)', async () => {
    await new SecretStore(file, fakeCipher()).set('anthropic', KEY)
    const broken: Cipher = {
      ...fakeCipher(),
      decryptString: () => {
        throw new Error('decrypt failed')
      },
    }
    expect((await new SecretStore(file, broken).status()).anthropic).toEqual({ state: 'missing' })
  })
})
