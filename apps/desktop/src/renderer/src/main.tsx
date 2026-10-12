import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './i18n'
import './styles.css'
import { RecordingBar } from './views/RecordingBar'
import { RegionPicker } from './views/RegionPicker'

// Một bản giao diện dùng cho cả ba cửa sổ; phần sau dấu # cho biết cửa sổ nào.
const view = window.location.hash.replace(/^#\/?/, '')

let root: ReactNode = (
  <StrictMode>
    <App />
  </StrictMode>
)
if (view === 'bar' || view === 'region') {
  // Cửa sổ trong suốt: bỏ nền mặc định. Không dùng StrictMode ở đây vì nó chạy effect hai lần
  // khi phát triển, khiến thiết bị bị mở và phiên quay bị bắt đầu hai lần.
  document.documentElement.classList.add('transparent-window')
  root = view === 'bar' ? <RecordingBar /> : <RegionPicker />
}

// Lỗi không bắt được trong giao diện: ghi vào nhật ký (Cài đặt → Mở thư mục nhật ký) để báo lỗi.
const report = (message: string) => {
  try {
    void window.lumora?.reportError(message).catch(() => undefined)
  } catch {
    // Cửa sổ chưa có cầu nối (khi chạy test): bỏ qua.
  }
}
window.addEventListener('error', (e) =>
  report(`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}`),
)
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { stack?: string; message?: string } | undefined
  report(`unhandled rejection: ${r?.stack ?? r?.message ?? String(e.reason)}`)
})

createRoot(document.getElementById('root')!).render(root)
