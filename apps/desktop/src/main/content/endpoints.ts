/** Địa chỉ gốc của kho nội dung (đổi được bằng biến môi trường để test với máy chủ giả). */
export function giphyBaseUrl(): string {
  return (process.env.LUMORA_GIPHY_BASE_URL || 'https://api.giphy.com').replace(/\/+$/, '')
}

export function pixabayBaseUrl(): string {
  return (process.env.LUMORA_PIXABAY_BASE_URL || 'https://pixabay.com').replace(/\/+$/, '')
}
