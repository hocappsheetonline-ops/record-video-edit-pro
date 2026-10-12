import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { History } from 'lucide-react'
import { describeChange, type EditState } from '@lumora/core'
import { useEditorStore } from './store'

/** "Thêm lớp phủ", "Sửa webcam"… cho bước đi từ `prev` sang `next`. */
export function historyLabel(t: TFunction, prev: EditState, next: EditState): string {
  const d = describeChange(prev, next)
  if (!d) return t('editor.history.ops.edit', { area: t('editor.history.areas.other') })
  return t(`editor.history.ops.${d.op}`, { area: t(`editor.history.areas.${d.area}`) })
}

/** Nhãn của bước sẽ hoàn tác / làm lại (để hiện trong chú thích nút). */
export function useUndoLabels() {
  const { t } = useTranslation()
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const edit = useEditorStore((s) => s.edit)
  const last = past[past.length - 1]
  const next = future[0]
  return {
    undo: last && edit ? historyLabel(t, last, edit) : null,
    redo: next && edit ? historyLabel(t, edit, next) : null,
  }
}

/** Nút Lịch sử trên thanh công cụ timeline: danh sách các bước, bấm để quay về bước đó. */
export function HistoryButton({ className }: { className: string }) {
  const { t } = useTranslation()
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const edit = useEditorStore((s) => s.edit)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [open])

  if (!edit) return null
  const all = [...past, edit, ...future]
  const current = past.length
  // Bước i (i ≥ 1) là thay đổi từ all[i - 1] sang all[i]; bước 0 là lúc mở dự án.
  const rows = all.map((state, i) => ({
    index: i,
    label: i === 0 ? t('editor.history.opened') : historyLabel(t, all[i - 1]!, state),
  }))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`${className} ${open ? 'text-accent' : ''}`}
        data-testid="history-open"
        aria-label={t('editor.history.title')}
        data-tooltip={t('editor.history.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <History size={16} aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('editor.history.title')}
          data-testid="history-panel"
          className="absolute left-0 top-full z-50 mt-1 flex max-h-80 w-64 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        >
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t('editor.history.title')}
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto py-1">
            {rows
              .slice()
              .reverse()
              .map(({ index, label }) => (
                <li key={index}>
                  <button
                    type="button"
                    data-testid="history-item"
                    data-current={index === current || undefined}
                    data-future={index > current || undefined}
                    onClick={() => useEditorStore.getState().jumpHistory(index)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2 ${
                      index === current
                        ? 'font-medium text-accent'
                        : index > current
                          ? 'text-muted/60 line-through'
                          : 'text-text'
                    }`}
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted">
                      {index}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  )
}
