import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { lumora } from '../api'
import { useAppStore } from '../store/app'

interface Props {
  children: ReactNode
  /** Khóa đổi là dựng lại cây con (ví dụ khi mở dự án khác). */
  resetKey?: string | null
}

interface State {
  error: Error | null
}

/**
 * Lưới hứng lỗi hiển thị: một lỗi JavaScript khi dựng giao diện của trình chỉnh sửa trước đây làm
 * React gỡ toàn bộ cây, cửa sổ chỉ còn một màu đen. Giờ hiện thông báo kèm nút thử lại / về Dự án,
 * và ghi lỗi vào nhật ký để báo cáo.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      void lumora()
        .reportError(`render error: ${error.stack ?? error.message}\n${info.componentStack ?? ''}`)
        .catch(() => undefined)
    } catch {
      // Không có cầu nối (khi test): bỏ qua.
    }
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  override render() {
    if (!this.state.error) return this.props.children
    return <CrashScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />
  }
}

function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation()
  const setPage = useAppStore((s) => s.setPage)
  return (
    <div role="alert" data-testid="crash-screen" className="flex h-full flex-col gap-3 p-8">
      <h1 className="text-lg font-semibold text-danger">{t('crash.title')}</h1>
      <p className="text-sm text-muted">{t('crash.text')}</p>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-[11px] text-muted">
        {error.stack ?? error.message}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="crash-retry"
          onClick={onRetry}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110"
        >
          {t('crash.retry')}
        </button>
        <button
          type="button"
          data-testid="crash-back"
          onClick={() => {
            setPage('projects')
            onRetry()
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          {t('crash.back')}
        </button>
      </div>
    </div>
  )
}
