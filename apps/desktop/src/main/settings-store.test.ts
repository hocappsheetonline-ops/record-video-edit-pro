import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@lumora/core'
import { SettingsStore } from './settings-store'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-settings-'))
  file = join(dir, 'settings.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('SettingsStore', () => {
  it('dùng mặc định khi chưa có file', async () => {
    expect(await new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('dùng mặc định khi file bị hỏng', async () => {
    await writeFile(file, '{not json')
    expect(await new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('lưu thay đổi xuống đĩa và đọc lại được', async () => {
    await new SettingsStore(file).update({ language: 'en', theme: 'light' })
    const reloaded = await new SettingsStore(file).get()
    expect(reloaded).toMatchObject({ language: 'en', theme: 'light' })
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ language: 'en' })
  })

  it('không lưu giá trị không hợp lệ', async () => {
    const store = new SettingsStore(file)
    const result = await store.update({ language: 'de' } as never)
    expect(result.language).toBe(DEFAULT_SETTINGS.language)
  })
})
