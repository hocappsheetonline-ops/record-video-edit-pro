import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo, UpdateState } from '@shared/ipc'
import { lumora } from '../api'

const button =
  'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50'

function statusText(t: (key: string, o?: Record<string, unknown>) => string, s: UpdateState) {
  switch (s.state) {
    case 'unsupported':
      return t('settings.update.unsupported')
    case 'idle':
      return ''
    case 'checking':
      return t('settings.update.checking')
    case 'none':
      return t('settings.update.none')
    case 'downloading':
      return t('settings.update.downloading', { version: s.version, percent: s.percent })
    case 'ready':
      return t('settings.update.ready', { version: s.version })
    case 'error':
      return t('settings.update.error', { message: s.message })
  }
}

/** Phiên bản app, kiểm tra / cài bản cập nhật và mở thư mục nhật ký lỗi. */
export function AboutCard({ appInfo }: { appInfo: AppInfo }) {
  const { t } = useTranslation()
  const [update, setUpdate] = useState<UpdateState | null>(null)

  useEffect(() => {
    const api = lumora()
    let alive = true
    void api.getUpdateState().then((s) => alive && setUpdate(s))
    const off = api.onUpdateState(setUpdate)
    return () => {
      alive = false
      off()
    }
  }, [])

  const busy = update?.state === 'checking' || update?.state === 'downloading'
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-sm">
      <p className="text-muted" data-testid="app-version">
        {appInfo.name} · {t('settings.version', { version: appInfo.version })}
      </p>
      {update && (
        <div className="flex flex-wrap items-center gap-3">
          {update.state === 'ready' ? (
            <button
              type="button"
              data-testid="update-install"
              className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg"
              onClick={() => void lumora().installUpdate()}
            >
              {t('settings.update.install')}
            </button>
          ) : (
            update.state !== 'unsupported' && (
              <button
                type="button"
                data-testid="update-check"
                className={button}
                disabled={busy}
                onClick={() => void lumora().checkForUpdates().then(setUpdate)}
              >
                {t('settings.update.check')}
              </button>
            )
          )}
          <span
            data-testid="update-status"
            className={update.state === 'error' ? 'text-danger' : 'text-muted'}
          >
            {statusText(t, update)}
          </span>
        </div>
      )}
      <div>
        <button
          type="button"
          data-testid="open-logs"
          className={button}
          onClick={() => void lumora().openLogs()}
        >
          {t('settings.openLogs')}
        </button>
        <p className="mt-1 text-xs text-muted">{t('settings.logsHint')}</p>
      </div>
    </div>
  )
}
