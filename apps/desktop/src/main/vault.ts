import { readJsonFile, writeJsonFile } from './json-file'
import type { Cipher } from './secret-store'

/** Kho bí mật dạng khóa–giá trị (stream key, token...), mã hóa bằng safeStorage giống API key. */
export class Vault {
  private cache: Map<string, string> | null = null

  constructor(
    private readonly filePath: string,
    private readonly cipher: Cipher,
  ) {}

  private async load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache
    const raw = await readJsonFile(this.filePath)
    const map = new Map<string, string>()
    if (typeof raw === 'object' && raw !== null && this.cipher.isEncryptionAvailable()) {
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== 'string') continue
        try {
          map.set(key, this.cipher.decryptString(Buffer.from(value, 'base64')))
        } catch {
          // không giải mã được (máy khác): bỏ qua
        }
      }
    }
    this.cache = map
    return map
  }

  private async save(map: Map<string, string>) {
    const out: Record<string, string> = {}
    for (const [k, v] of map) out[k] = this.cipher.encryptString(v).toString('base64')
    await writeJsonFile(this.filePath, out)
    this.cache = map
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.load()).get(key)
  }

  async has(key: string): Promise<boolean> {
    return (await this.load()).has(key)
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.cipher.isEncryptionAvailable()) throw new Error('Hệ điều hành không hỗ trợ mã hóa')
    const map = new Map(await this.load())
    if (value.trim()) map.set(key, value.trim())
    else map.delete(key)
    await this.save(map)
  }

  async delete(key: string): Promise<void> {
    const map = new Map(await this.load())
    map.delete(key)
    await this.save(map)
  }
}
