import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import type { UpdateState } from '@shared/ipc'
import { lumora } from '../api'

/**
 * Thanh báo ở đầu app khi bản mới đã tải xong: bấm để khởi động lại và cập nhật ngay,
 * hoặc "Để sau" — bản mới sẽ tự cài khi thoát app.
 */
export function UpdateBanner() {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    const api = lumora()
    let alive = true
    void api.getUpdateState().then((s) => alive && setState(s))
    const off = api.onUpdateState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])

  if (state?.state !== 'ready' || dismissed === state.version) return null
  return (
    <div
      role="status"
      data-testid="update-banner"
      className="flex items-center gap-3 border-b border-accent/40 bg-accent/10 px-4 py-2 text-sm"
    >
      <Download size={16} className="text-accent" aria-hidden />
      <span className="flex-1">{t('update.ready', { version: state.version })}</span>
      <button
        type="button"
        data-testid="update-banner-install"
        onClick={() => void lumora().installUpdate()}
        className="rounded-md bg-accent px-3 py-1 font-medium text-accent-fg"
      >
        {t('settings.update.install')}
      </button>
      <button
        type="button"
        aria-label={t('update.later')}
        title={t('update.later')}
        onClick={() => setDismissed(state.version)}
        className="rounded p-1 text-muted hover:text-text"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
