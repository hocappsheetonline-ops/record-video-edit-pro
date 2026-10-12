export const LANGUAGES = ['vi', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const THEMES = ['system', 'dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

/**
 * Màu nhấn có sẵn (bộ màu hệ thống của macOS: xanh dương, tím, hồng, đỏ, cam, vàng, xanh lá,
 * than chì); người dùng cũng có thể chọn màu bất kỳ (mã hex).
 */
export const ACCENT_PRESETS = [
  '#0a84ff',
  '#bf5af2',
  '#ff375f',
  '#ff453a',
  '#ff9f0a',
  '#ffd60a',
  '#30d158',
  '#8e8e93',
] as const

export interface AppSettings {
  language: Language
  theme: Theme
  /** Màu nhấn của giao diện (mã hex #rrggbb). */
  accent: string
  /** Thư mục lưu dự án. Rỗng nghĩa là dùng thư mục mặc định (Videos/Lumora). */
  projectsDir: string
  /** Đã xem (hoặc bỏ qua) hướng dẫn lần đầu trong trình chỉnh sửa. */
  onboardingDone: boolean
  /** Chất lượng xem trước: tự hạ khi máy chậm, luôn cao, hoặc luôn nhẹ (540p). */
  previewQuality: PreviewQuality
  /** Mẫu cho bản quay mới mở lần đầu: tỉ lệ khung hình mặc định. */
  projectTemplate: ProjectTemplate
  /** Giảm trong suốt: bề mặt kính mờ thành màu đặc (máy yếu hoặc muốn tương phản cao). */
  reduceTransparency: boolean
}

export const PREVIEW_QUALITIES = ['auto', 'high', 'low'] as const
export type PreviewQuality = (typeof PREVIEW_QUALITIES)[number]
/** Mẫu dự án: hướng dẫn 16:9, TikTok / Shorts 9:16, vuông 1:1. */
export const PROJECT_TEMPLATES = ['tutorial', 'tiktok', 'square'] as const
export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number]

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'vi',
  theme: 'dark',
  accent: ACCENT_PRESETS[0],
  projectsDir: '',
  onboardingDone: false,
  previewQuality: 'auto',
  projectTemplate: 'tutorial',
  reduceTransparency: false,
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
    onboardingDone: raw.onboardingDone === true,
    previewQuality: pick(PREVIEW_QUALITIES, raw.previewQuality, DEFAULT_SETTINGS.previewQuality),
    projectTemplate: pick(PROJECT_TEMPLATES, raw.projectTemplate, DEFAULT_SETTINGS.projectTemplate),
    reduceTransparency: raw.reduceTransparency === true,
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
