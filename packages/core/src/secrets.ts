/** API key người dùng tự nhập: AI (ElevenLabs, Claude) và kho nội dung (Tenor, Pixabay). */
export const SECRET_KEYS = ['elevenlabs', 'anthropic', 'tenor', 'pixabay'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]

export function isSecretKey(value: unknown): value is SecretKey {
  return SECRET_KEYS.includes(value as SecretKey)
}

/** Hiển thị key dạng rút gọn để người dùng nhận ra key nào đang dùng mà không lộ toàn bộ. */
export function maskSecret(secret: string): string {
  const value = secret.trim()
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 4)}${'•'.repeat(8)}${value.slice(-4)}`
}

export type KeyFormatError = 'empty' | 'whitespace' | 'too_short' | 'wrong_prefix'

/** Kiểm tra nhanh định dạng key trước khi gọi API, để báo lỗi gõ nhầm ngay lập tức. */
export function checkKeyFormat(key: SecretKey, secret: string): KeyFormatError | null {
  if (secret.length === 0) return 'empty'
  if (/\s/.test(secret)) return 'whitespace'
  if (secret.length < 20) return 'too_short'
  if (key === 'anthropic' && !secret.startsWith('sk-ant-')) return 'wrong_prefix'
  // Tenor dùng API key của Google Cloud (luôn bắt đầu bằng AIza).
  if (key === 'tenor' && !secret.startsWith('AIza')) return 'wrong_prefix'
  return null
}

export type KeyStatus = { state: 'missing' } | { state: 'saved'; masked: string }

export type KeyValidationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'network' | 'format' | 'unknown'; message?: string }
