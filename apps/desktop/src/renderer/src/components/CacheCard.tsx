import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HardDrive, Trash2 } from 'lucide-react'
import { lumora } from '../api'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** Bộ nhớ đệm: file tải tạm, giọng đọc AI đã lưu. Xóa được bất kỳ lúc nào (không mất dự án). */
export function CacheCard() {
  const { t } = useTranslation()
  const [bytes, setBytes] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void lumora()
      .cacheInfo()
      .then(setBytes)
      .catch(() => setBytes(0))
  }, [])
  return (
    <section
      className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5"
      data-testid="cache-card"
    >
      <HardDrive size={22} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <h3 className="font-medium">{t('settings.cache')}</h3>
        <p className="text-sm text-muted">{t('settings.cacheHint')}</p>
      </div>
      <span className="font-mono text-sm tabular-nums" data-testid="cache-size">
        {bytes === null ? '…' : formatBytes(bytes)}
      </span>
      <button
        type="button"
        data-testid="cache-clear"
        disabled={busy || !bytes}
        onClick={() => {
          setBusy(true)
          void lumora()
            .cacheClear()
            .then(setBytes)
            .finally(() => setBusy(false))
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-40"
      >
        <Trash2 size={15} aria-hidden />
        {t('settings.cacheClear')}
      </button>
    </section>
  )
}
