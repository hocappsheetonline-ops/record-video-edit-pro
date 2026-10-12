export const LANGUAGES = ['vi', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const THEMES = ['system', 'dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export interface AppSettings {
  language: Language
  theme: Theme
  /** Thư mục lưu dự án. Rỗng nghĩa là dùng thư mục mặc định (Videos/Lumora). */
  projectsDir: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'vi',
  theme: 'dark',
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
    projectsDir:
      typeof raw.projectsDir === 'string' ? raw.projectsDir.trim() : DEFAULT_SETTINGS.projectsDir,
  }
}

export function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return normalizeSettings({ ...current, ...patch })
}
