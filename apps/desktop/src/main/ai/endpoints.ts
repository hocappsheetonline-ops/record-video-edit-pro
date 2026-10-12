/** Có thể đổi địa chỉ API qua biến môi trường (dùng cho test với máy chủ giả, hoặc proxy nội bộ). */
export function elevenLabsBaseUrl(): string {
  return (process.env.LUMORA_ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/+$/, '')
}

export function anthropicBaseUrl(): string | undefined {
  return process.env.LUMORA_ANTHROPIC_BASE_URL || undefined
}
