import { useEffect, useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAppStore } from '../store/app'

/** Phím tắt của trình chỉnh sửa (nhóm → [phím, khóa mô tả]). */
export const SHORTCUT_GROUPS: { group: string; items: [string, string][] }[] = [
  {
    group: 'playback',
    items: [
      ['Space', 'play'],
      ['← / →', 'seek'],
      ['Shift+← / →', 'seekFar'],
      ['Home / End', 'ends'],
    ],
  },
  {
    group: 'edit',
    items: [
      ['S', 'split'],
      ['A / D', 'trim'],
      ['Delete', 'delete'],
      ['Shift+Delete', 'ripple'],
      ['Ctrl+Z / Ctrl+Y', 'undo'],
    ],
  },
  {
    group: 'clipboard',
    items: [
      ['Ctrl+C / X / V', 'copy'],
      ['Ctrl+D', 'duplicate'],
      ['Ctrl+A', 'selectAll'],
      ['Ctrl+click', 'multi'],
      ['Esc', 'deselect'],
    ],
  },
  {
    group: 'timeline',
    items: [
      ['M', 'marker'],
      ['Shift+M / Ctrl+M', 'jumpMarker'],
      ['N', 'snap'],
      ['Alt', 'noSnap'],
      ['Ctrl+wheel', 'zoom'],
      ['?', 'help'],
    ],
  },
]

/** Hộp thoại "Phím tắt" (phím ?). */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        data-testid="shortcuts-dialog"
        className="glass-strong flex max-h-full w-[560px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 id="shortcuts-title" className="text-sm font-semibold">
            {t('editor.help.shortcuts')}
          </h2>
          <button
            type="button"
            aria-label={t('editor.export.close')}
            data-testid="shortcuts-close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-text/8 hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto p-4">
          {SHORTCUT_GROUPS.map(({ group, items }) => (
            <section key={group} className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-semibold text-muted">
                {t(`editor.help.groups.${group}`)}
              </h3>
              {items.map(([key, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-xs">
                  <span>{t(`editor.help.keys.${label}`)}</span>
                  <kbd className="shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px]">
                    {key}
                  </kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Các bước giới thiệu lần đầu: vùng nào (theo data-testid) và nội dung. */
const STEPS = ['library', 'preview', 'timeline', 'properties', 'export'] as const
const TARGETS: Record<(typeof STEPS)[number], string> = {
  library: 'library',
  preview: 'editor-canvas',
  timeline: 'timeline',
  properties: 'properties',
  export: 'export-open',
}

/**
 * Hướng dẫn lần đầu mở trình chỉnh sửa: 5 bước chỉ vào từng vùng, có nút Bỏ qua. Không chặn
 * thao tác (chỉ là khung viền và thẻ nhỏ). Xong hoặc bỏ qua thì không hiện lại.
 */
export function Onboarding() {
  const { t } = useTranslation()
  const done = useAppStore((s) => s.settings?.onboardingDone ?? true)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const key = STEPS[step]!

  useLayoutEffect(() => {
    if (done) return
    const update = () => {
      const el = document.querySelector(`[data-testid="${TARGETS[key]}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    update()
    window.addEventListener('resize', update)
    const timer = setInterval(update, 500)
    return () => {
      window.removeEventListener('resize', update)
      clearInterval(timer)
    }
  }, [done, key])

  if (done) return null
  const finish = () => void useAppStore.getState().updateSettings({ onboardingDone: true })
  const last = step === STEPS.length - 1
  // Thẻ đặt cạnh vùng được chỉ (bên phải nếu đủ chỗ, không thì bên trái / dưới).
  const cardW = 280
  const pos = rect
    ? rect.right + cardW + 16 < window.innerWidth
      ? { left: rect.right + 12, top: Math.max(12, Math.min(rect.top, window.innerHeight - 200)) }
      : rect.left - cardW - 12 > 0
        ? {
            left: rect.left - cardW - 12,
            top: Math.max(12, Math.min(rect.top, window.innerHeight - 200)),
          }
        : {
            left: Math.max(12, rect.left),
            top: Math.min(rect.bottom + 12, window.innerHeight - 200),
          }
    : { left: window.innerWidth / 2 - cardW / 2, top: window.innerHeight / 3 }
  return (
    <>
      {rect && (
        <div
          aria-hidden
          data-testid="onboarding-ring"
          className="pointer-events-none fixed z-[55] rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-bg transition-all"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
      <div
        role="dialog"
        aria-labelledby="onboarding-title"
        data-testid="onboarding"
        data-step={key}
        className="glass-strong fixed z-[56] flex flex-col gap-2 rounded-2xl border p-4 shadow-2xl"
        style={{ ...pos, width: cardW }}
      >
        <span className="text-[11px] text-muted">
          {step + 1} / {STEPS.length}
        </span>
        <h2 id="onboarding-title" className="text-sm font-semibold">
          {t(`editor.onboarding.${key}.title`)}
        </h2>
        <p className="text-xs leading-relaxed text-muted">{t(`editor.onboarding.${key}.text`)}</p>
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            data-testid="onboarding-skip"
            onClick={finish}
            className="text-xs text-muted hover:text-text"
          >
            {t('editor.onboarding.skip')}
          </button>
          <div className="flex gap-1.5">
            {step > 0 && (
              <button
                type="button"
                data-testid="onboarding-back"
                onClick={() => setStep(step - 1)}
                className="rounded-lg border border-border bg-surface-2/70 px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
              >
                {t('editor.onboarding.back')}
              </button>
            )}
            <button
              type="button"
              data-testid="onboarding-next"
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-fg shadow-sm"
            >
              {last ? t('editor.onboarding.done') : t('editor.onboarding.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
