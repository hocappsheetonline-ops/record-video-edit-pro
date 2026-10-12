import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { lumora } from '../api'
import { useAppStore } from '../store/app'

/** Nút đèn giao thông kiểu macOS: đỏ đóng, vàng thu nhỏ, xanh phóng to; ký hiệu hiện khi rê chuột. */
function TrafficLight({
  color,
  label,
  testId,
  onClick,
  children,
}: {
  color: string
  label: string
  testId: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tooltip={label}
      data-testid={testId}
      onClick={onClick}
      className="app-no-drag group flex size-3 items-center justify-center rounded-full text-[9px] font-bold leading-none text-black/60 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)]"
      style={{ background: color }}
    >
      <span className="opacity-0 transition-opacity group-hover:opacity-100">{children}</span>
    </button>
  )
}

/**
 * Thanh tiêu đề tự vẽ cho cửa sổ không viền (kiểu macOS): kéo để dời cửa sổ, bấm đúp để phóng to.
 * Trên macOS hệ thống đã vẽ nút đèn giao thông nên chỉ chừa chỗ bên trái.
 */
export function TitleBar() {
  const { t } = useTranslation()
  const appInfo = useAppStore((s) => s.appInfo)
  const [maximized, setMaximized] = useState(false)
  const frameless = appInfo?.frameless ?? false

  useEffect(() => {
    if (!frameless) return
    const api = lumora()
    let alive = true
    void api
      .isWindowMaximized()
      .then((m) => alive && setMaximized(m))
      .catch(() => undefined)
    const off = api.onWindowMaximized(setMaximized)
    return () => {
      alive = false
      off()
    }
  }, [frameless])

  const toggle = () => void lumora().toggleMaximizeWindow().then(setMaximized)

  return (
    <div
      data-testid="title-bar"
      className="app-drag glass flex h-9 shrink-0 items-center border-b px-3 text-[12px] text-muted select-none"
      onDoubleClick={frameless ? toggle : undefined}
    >
      {frameless ? (
        <div className="flex items-center gap-2">
          <TrafficLight
            color="#ff5f57"
            label={t('window.close')}
            testId="window-close"
            onClick={() => void lumora().closeWindow()}
          >
            ×
          </TrafficLight>
          <TrafficLight
            color="#febc2e"
            label={t('window.minimize')}
            testId="window-minimize"
            onClick={() => void lumora().minimizeWindow()}
          >
            –
          </TrafficLight>
          <TrafficLight
            color="#28c840"
            label={maximized ? t('window.restore') : t('window.maximize')}
            testId="window-maximize"
            onClick={toggle}
          >
            {maximized ? '⌄' : '+'}
          </TrafficLight>
        </div>
      ) : (
        // macOS: chừa chỗ cho nút đèn giao thông của hệ thống.
        <div className="w-[68px]" aria-hidden />
      )}
      <span className="flex-1 text-center font-medium tracking-tight">Lumora</span>
      <div className="w-[68px]" aria-hidden />
    </div>
  )
}
