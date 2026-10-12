import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info, ListTodo, Loader2, X, XCircle } from 'lucide-react'
import { useJobs } from './jobs'

/** Nút "Việc đang làm" ở đầu trình chỉnh sửa: tiến độ từng việc nền, hủy được. */
export function JobsButton() {
  const { t } = useTranslation()
  const jobs = useJobs((s) => s.jobs)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const running = jobs.filter((j) => j.status === 'running')

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [open])

  if (jobs.length === 0) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="jobs-button"
        aria-label={t('editor.jobs.title')}
        data-tooltip={t('editor.jobs.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted transition-colors hover:bg-text/8 hover:text-text"
      >
        {running.length > 0 ? (
          <Loader2 size={15} className="animate-spin text-accent" aria-hidden />
        ) : (
          <ListTodo size={15} aria-hidden />
        )}
        {running.length > 0 && (
          <span data-testid="jobs-count" className="tabular-nums">
            {running.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('editor.jobs.title')}
          data-testid="jobs-panel"
          className="glass-strong absolute right-0 top-full z-50 mt-1.5 flex w-80 flex-col overflow-hidden rounded-xl border shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold text-muted">{t('editor.jobs.title')}</span>
            {jobs.some((j) => j.status !== 'running') && (
              <button
                type="button"
                data-testid="jobs-clear"
                onClick={() => useJobs.getState().clearDone()}
                className="text-[11px] text-accent hover:underline"
              >
                {t('editor.jobs.clear')}
              </button>
            )}
          </div>
          <ol className="flex max-h-72 flex-col overflow-y-auto">
            {[...jobs].reverse().map((j) => (
              <li
                key={j.id}
                data-testid="job-item"
                data-status={j.status}
                className="flex flex-col gap-1 border-b border-border/60 px-3 py-2 last:border-0"
              >
                <div className="flex items-center gap-2 text-xs">
                  {j.status === 'running' ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-hidden />
                  ) : j.status === 'done' ? (
                    <CheckCircle2 size={13} className="shrink-0 text-success" aria-hidden />
                  ) : (
                    <XCircle size={13} className="shrink-0 text-danger" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{j.label}</span>
                  {j.status === 'running' && j.progress !== null && (
                    <span className="font-mono text-[10px] text-muted">
                      {Math.round(j.progress * 100)}%
                    </span>
                  )}
                  {j.cancel && j.status === 'running' && (
                    <button
                      type="button"
                      data-testid="job-cancel"
                      aria-label={t('editor.jobs.cancel')}
                      data-tooltip={t('editor.jobs.cancel')}
                      onClick={j.cancel}
                      className="rounded p-0.5 text-muted hover:bg-danger/15 hover:text-danger"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  )}
                </div>
                {j.status === 'running' && (
                  <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full bg-accent ${j.progress === null ? 'w-1/3 animate-pulse' : ''}`}
                      style={j.progress === null ? undefined : { width: `${j.progress * 100}%` }}
                    />
                  </div>
                )}
                {j.error && <p className="text-[11px] text-danger">{j.error}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

/** Thông báo nhỏ ở góc dưới bên phải (tự ẩn sau vài giây). */
export function ToastLayer() {
  const toasts = useJobs((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon =
          toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? XCircle : Info
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            data-testid="toast"
            data-kind={toast.kind}
            className="glass-strong pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm shadow-2xl"
          >
            <Icon
              size={16}
              aria-hidden
              className={`mt-0.5 shrink-0 ${
                toast.kind === 'success'
                  ? 'text-success'
                  : toast.kind === 'error'
                    ? 'text-danger'
                    : 'text-accent'
              }`}
            />
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                data-testid="toast-action"
                onClick={() => {
                  toast.action!.run()
                  useJobs.getState().dismiss(toast.id)
                }}
                className="shrink-0 text-xs font-medium text-accent hover:underline"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="×"
              onClick={() => useJobs.getState().dismiss(toast.id)}
              className="shrink-0 text-muted hover:text-text"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
