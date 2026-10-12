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

createRoot(document.getElementById('root')!).render(root)
