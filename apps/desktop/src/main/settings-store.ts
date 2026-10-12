import { mergeSettings, normalizeSettings, type AppSettings } from '@lumora/core'
import { readJsonFile, writeJsonFile } from './json-file'

export class SettingsStore {
  private cache: AppSettings | undefined

  constructor(private readonly filePath: string) {}

  async get(): Promise<AppSettings> {
    this.cache ??= normalizeSettings(await readJsonFile(this.filePath))
    return this.cache
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = mergeSettings(await this.get(), patch)
    await writeJsonFile(this.filePath, next)
    this.cache = next
    return next
  }
}
