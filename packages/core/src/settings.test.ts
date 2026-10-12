import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings } from './settings'

describe('normalizeSettings', () => {
  it('trả về mặc định khi đầu vào không phải object', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('abc')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('giữ giá trị hợp lệ', () => {
    expect(
      normalizeSettings({ language: 'en', theme: 'light', projectsDir: 'D:\\Videos' }),
    ).toEqual({
      language: 'en',
      theme: 'light',
      projectsDir: 'D:\\Videos',
    })
  })

  it('thay giá trị sai bằng mặc định và bỏ trường lạ', () => {
    const result = normalizeSettings({ language: 'fr', theme: 42, projectsDir: 7, extra: true })
    expect(result).toEqual(DEFAULT_SETTINGS)
    expect(result).not.toHaveProperty('extra')
  })

  it('cắt khoảng trắng ở đường dẫn thư mục', () => {
    expect(normalizeSettings({ projectsDir: '  C:\\Lumora  ' }).projectsDir).toBe('C:\\Lumora')
  })
})

describe('mergeSettings', () => {
  it('áp dụng thay đổi hợp lệ', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { language: 'en' }).language).toBe('en')
  })

  it('bỏ qua thay đổi không hợp lệ', () => {
    const patch = { theme: 'neon' } as unknown as Partial<typeof DEFAULT_SETTINGS>
    expect(mergeSettings(DEFAULT_SETTINGS, patch).theme).toBe(DEFAULT_SETTINGS.theme)
  })
})
