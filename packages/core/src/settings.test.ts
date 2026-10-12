import { describe, expect, it } from 'vitest'
import { accentForeground, DEFAULT_SETTINGS, mergeSettings, normalizeSettings } from './settings'

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
      accent: DEFAULT_SETTINGS.accent,
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

describe('màu nhấn', () => {
  it('mặc định là xanh dương; nhận mã hex hợp lệ, bỏ giá trị sai', () => {
    expect(DEFAULT_SETTINGS.accent).toBe('#2563eb')
    expect(normalizeSettings({ accent: ' #1A73E8 ' }).accent).toBe('#1a73e8')
    expect(normalizeSettings({ accent: 'blue' }).accent).toBe('#2563eb')
    expect(normalizeSettings({ accent: '#12345' }).accent).toBe('#2563eb')
  })

  it('chữ trên nền màu nhấn đủ tương phản', () => {
    expect(accentForeground('#2563eb')).toBe('#ffffff')
    expect(accentForeground('#facc15')).toBe('#0b0b10')
  })
})
