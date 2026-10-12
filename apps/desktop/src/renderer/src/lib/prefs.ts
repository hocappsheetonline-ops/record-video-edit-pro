/** Đọc/ghi lựa chọn gần nhất của người dùng. localStorage có thể bị chặn nên luôn bọc try/catch. */
export function loadPrefs<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : defaults
  } catch {
    return defaults
  }
}

export function savePrefs(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // bỏ qua: chỉ là tiện ích
  }
}

/** Lấy mã lỗi từ thông báo lỗi IPC ("Error invoking remote method ...: Error: code"). */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
