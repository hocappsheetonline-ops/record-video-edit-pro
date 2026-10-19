export const LANGUAGES = ['vi', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const THEMES = ['system', 'dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

/**
 * Màu nhấn có sẵn: xanh ngọc kiểu CapCut (mặc định) và bộ màu hệ thống của macOS (xanh dương,
 * tím, hồng, đỏ, cam, vàng, xanh lá, than chì); người dùng cũng có thể chọn màu bất kỳ (mã hex).
 */
export const ACCENT_PRESETS = [
  '#1ed6d6',
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
  /** AI cục bộ (Ollama) thay cho Claude: trợ lý, cắt từ thừa, tóm tắt, dịch chạy trên máy. */
  localAi: LocalAiSettings
  /** Giọng nói cục bộ (whisper.cpp + Piper) thay cho ElevenLabs: phụ đề và giọng đọc chạy trên máy. */
  localSpeech: LocalSpeechSettings
}

/** Model Whisper (ggml) tải được trong app: cân bằng giữa cỡ file, tốc độ và chất lượng tiếng Việt. */
export const WHISPER_MODELS = [
  'small',
  'medium-q5_0',
  'large-v3-turbo-q5_0',
  'large-v3-turbo',
] as const
export type WhisperModel = (typeof WHISPER_MODELS)[number]

export interface LocalSpeechSettings {
  enabled: boolean
  /** Model Whisper dùng để nhận dạng (tải trong Cài đặt). */
  whisperModel: WhisperModel
  /** Giọng Piper mặc định (ví dụ vi_VN-vais1000-medium). */
  piperVoice: string
}

export const DEFAULT_LOCAL_SPEECH: LocalSpeechSettings = {
  enabled: false,
  whisperModel: 'large-v3-turbo-q5_0',
  piperVoice: 'vi_VN-vais1000-medium',
}

/** Chuẩn hóa cài đặt giọng nói cục bộ: model trong danh sách, tên giọng là tên file an toàn. */
export function normalizeLocalSpeech(input: unknown): LocalSpeechSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const voice = typeof raw.piperVoice === 'string' ? raw.piperVoice.trim() : ''
  return {
    enabled: raw.enabled === true,
    whisperModel: WHISPER_MODELS.includes(raw.whisperModel as WhisperModel)
      ? (raw.whisperModel as WhisperModel)
      : DEFAULT_LOCAL_SPEECH.whisperModel,
    piperVoice: /^[\w.-]{1,80}$/.test(voice) ? voice : DEFAULT_LOCAL_SPEECH.piperVoice,
  }
}

export interface LocalAiSettings {
  enabled: boolean
  /** Địa chỉ máy chủ Ollama (mặc định http://127.0.0.1:11434). */
  baseUrl: string
  /** Tên model đã tải trong Ollama (ví dụ qwen2.5:7b, llama3.2). */
  model: string
}

export const DEFAULT_LOCAL_AI: LocalAiSettings = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:7b',
}

/** Chuẩn hóa cài đặt AI cục bộ: chỉ nhận http(s), bỏ dấu / cuối, tên model ngắn gọn. */
export function normalizeLocalAi(input: unknown): LocalAiSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const url = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/+$/, '') : ''
  const model = typeof raw.model === 'string' ? raw.model.trim().slice(0, 80) : ''
  return {
    enabled: raw.enabled === true,
    baseUrl:
      /^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(url) && url.length <= 200
        ? url
        : DEFAULT_LOCAL_AI.baseUrl,
    model: /^[\w.:/-]+$/.test(model) ? model : DEFAULT_LOCAL_AI.model,
  }
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
  localAi: { ...DEFAULT_LOCAL_AI },
  localSpeech: { ...DEFAULT_LOCAL_SPEECH },
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
    localAi: normalizeLocalAi(raw.localAi),
    localSpeech: normalizeLocalSpeech(raw.localSpeech),
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
