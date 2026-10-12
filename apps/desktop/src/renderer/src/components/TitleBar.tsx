import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Minus, Square, X } from 'lucide-react'
import { lumora } from '../api'
import { useAppStore } from '../store/app'

/** Chỗ để trang hiện tại (trình chỉnh sửa) đặt tên dự án và nút Xuất vào thanh tiêu đề (như CapCut). */
export const TITLE_BAR_SLOT = 'title-bar-slot'

/** Nút cửa sổ kiểu Windows: thu nhỏ, phóng to / thu về, đóng (đóng đỏ khi rê chuột). */
function WindowButton({
  label,
  testId,
  onClick,
  danger,
  children,
}: {
  label: string
  testId: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tooltip={label}
      data-testid={testId}
      onClick={onClick}
      className={`app-no-drag flex h-full w-11 items-center justify-center text-muted transition-colors hover:text-text ${
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-text/10'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Thanh tiêu đề tự vẽ cho cửa sổ không viền (bố cục như CapCut): logo bên trái, tên dự án và các
 * nút của trang ở giữa, nút cửa sổ kiểu Windows ở góc phải. Kéo để dời, bấm đúp để phóng to.
 * Trên macOS hệ thống vẽ nút đèn giao thông nên chỉ chừa chỗ bên trái.
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
      className="app-drag glass flex h-10 shrink-0 items-center border-b text-[12px] select-none"
      onDoubleClick={frameless ? toggle : undefined}
    >
      {!frameless && <div className="w-[72px] shrink-0" aria-hidden />}
      <div className="flex shrink-0 items-center gap-2 px-3">
        <span className="size-5 rounded-[6px] bg-gradient-to-br from-accent to-sky-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" />
        <span className="font-semibold tracking-tight">Lumora</span>
      </div>
      <div id={TITLE_BAR_SLOT} className="flex h-full min-w-0 flex-1 items-center gap-2" />
      {frameless && (
        <div className="flex h-full shrink-0 items-stretch" data-testid="window-controls">
          <WindowButton
            label={t('window.minimize')}
            testId="window-minimize"
            onClick={() => void lumora().minimizeWindow()}
          >
            <Minus size={14} aria-hidden />
          </WindowButton>
          <WindowButton
            label={maximized ? t('window.restore') : t('window.maximize')}
            testId="window-maximize"
            onClick={toggle}
          >
            {maximized ? <Copy size={12} aria-hidden /> : <Square size={12} aria-hidden />}
          </WindowButton>
          <WindowButton
            label={t('window.close')}
            testId="window-close"
            onClick={() => void lumora().closeWindow()}
            danger
          >
            <X size={15} aria-hidden />
          </WindowButton>
        </div>
      )}
    </div>
  )
}
