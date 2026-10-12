export const LANGUAGES = ['vi', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const THEMES = ['system', 'dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

/** Màu nhấn có sẵn; người dùng cũng có thể chọn màu bất kỳ (mã hex). */
export const ACCENT_PRESETS = [
  '#2563eb',
  '#0ea5e9',
  '#14b8a6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
] as const

export interface AppSettings {
  language: Language
  theme: Theme
  /** Màu nhấn của giao diện (mã hex #rrggbb). */
  accent: string
  /** Thư mục lưu dự án. Rỗng nghĩa là dùng thư mục mặc định (Videos/Lumora). */
  projectsDir: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'vi',
  theme: 'dark',
  accent: ACCENT_PRESETS[0],
  projectsDir: '',
}

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * Chuẩn hóa dữ liệu settings đọc từ đĩa: bỏ trường lạ, thay giá trị sai bằng mặc định.
 * File settings có thể bị sửa tay hoặc đến từ phiên bản cũ nên không tin dữ liệu đầu vào.
 */
export function normalizeSettings(input: unknown): AppSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  return {
    language: pick(LANGUAGES, raw.language, DEFAULT_SETTINGS.language),
    theme: pick(THEMES, raw.theme, DEFAULT_SETTINGS.theme),
    accent:
      typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent.trim())
        ? raw.accent.trim().toLowerCase()
        : DEFAULT_SETTINGS.accent,
    projectsDir:
      typeof raw.projectsDir === 'string' ? raw.projectsDir.trim() : DEFAULT_SETTINGS.projectsDir,
  }
}

export function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return normalizeSettings({ ...current, ...patch })
}

/** Màu chữ nên dùng trên nền màu nhấn: trắng cho màu đậm, gần đen cho màu sáng. */
export function accentForeground(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.45 ? '#0b0b10' : '#ffffff'
}
