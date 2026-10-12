import { isSecretKey, maskSecret, SECRET_KEYS, type SecretKey } from '@lumora/core'
import type { SecretsStatus } from '@shared/ipc'
import { readJsonFile, writeJsonFile } from './json-file'

/** Phần của `safeStorage` (Electron) mà kho key cần, tách ra để test được. */
export interface Cipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('Hệ điều hành không hỗ trợ mã hóa, không thể lưu API key an toàn.')
    this.name = 'EncryptionUnavailableError'
  }
}

/**
 * Lưu API key đã mã hóa (DPAPI trên Windows) vào một file JSON trong thư mục dữ liệu của app.
 * Key không bao giờ được gửi sang giao diện; giao diện chỉ thấy dạng rút gọn.
 */
export class SecretStore {
  private cache: Partial<Record<SecretKey, string>> | undefined

  constructor(
    private readonly filePath: string,
    private readonly cipher: Cipher,
  ) {}

  private async load(): Promise<Partial<Record<SecretKey, string>>> {
    if (this.cache) return this.cache
    const raw = await readJsonFile(this.filePath)
    const result: Partial<Record<SecretKey, string>> = {}
    if (typeof raw === 'object' && raw !== null && this.cipher.isEncryptionAvailable()) {
      for (const [key, value] of Object.entries(raw)) {
        if (!isSecretKey(key) || typeof value !== 'string') continue
        try {
          result[key] = this.cipher.decryptString(Buffer.from(value, 'base64'))
        } catch {
          // Key mã hóa trên máy hoặc tài khoản Windows khác thì không giải mã được: bỏ qua.
        }
      }
    }
    this.cache = result
    return result
  }

  private async persist(values: Partial<Record<SecretKey, string>>): Promise<void> {
    const encoded: Record<string, string> = {}
    for (const [key, value] of Object.entries(values)) {
      encoded[key] = this.cipher.encryptString(value).toString('base64')
    }
    await writeJsonFile(this.filePath, encoded)
    this.cache = values
  }

  async get(key: SecretKey): Promise<string | undefined> {
    return (await this.load())[key]
  }

  async set(key: SecretKey, value: string): Promise<void> {
    if (!this.cipher.isEncryptionAvailable()) throw new EncryptionUnavailableError()
    await this.persist({ ...(await this.load()), [key]: value.trim() })
  }

  async delete(key: SecretKey): Promise<void> {
    const next = { ...(await this.load()) }
    delete next[key]
    await this.persist(next)
  }

  async status(): Promise<SecretsStatus> {
    const values = await this.load()
    const status = {} as SecretsStatus
    for (const key of SECRET_KEYS) {
      const value = values[key]
      status[key] = value ? { state: 'saved', masked: maskSecret(value) } : { state: 'missing' }
    }
    return status
  }
}
