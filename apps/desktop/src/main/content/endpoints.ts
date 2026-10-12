/** Địa chỉ gốc của kho nội dung (đổi được bằng biến môi trường để test với máy chủ giả). */
export function tenorBaseUrl(): string {
  return (process.env.LUMORA_TENOR_BASE_URL || 'https://tenor.googleapis.com').replace(/\/+$/, '')
}

export function pixabayBaseUrl(): string {
  return (process.env.LUMORA_PIXABAY_BASE_URL || 'https://pixabay.com').replace(/\/+$/, '')
}
