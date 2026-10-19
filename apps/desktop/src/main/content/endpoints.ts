/** Địa chỉ gốc của kho nội dung (đổi được bằng biến môi trường để test với máy chủ giả). */
export function pixabayBaseUrl(): string {
  return (process.env.LUMORA_PIXABAY_BASE_URL || 'https://pixabay.com').replace(/\/+$/, '')
}

/** Địa chỉ gốc API Jamendo (kho nhạc miễn phí bản quyền); đổi được để test với máy chủ giả. */
export function jamendoBaseUrl(): string {
  return (process.env.LUMORA_JAMENDO_BASE_URL || 'https://api.jamendo.com').replace(/\/+$/, '')
}
