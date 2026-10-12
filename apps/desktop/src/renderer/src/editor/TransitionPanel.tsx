import { useTranslation } from 'react-i18next'
import { cutPoints, DEFAULT_TRANSITION_MS, TRANSITION_KINDS } from '@lumora/core'
import { useEditorStore } from './store'

const chip = (active: boolean) =>
  `rounded-md px-2 py-1.5 text-xs ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-text'}`

/** Chọn hiệu ứng chuyển tiếp cho chỗ nối đang chọn (hoặc áp dụng cho mọi chỗ nối). */
export function TransitionPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  const { setTransition, applyTransitionToAll } = useEditorStore.getState()
  if (!edit) return null
  const cuts = cutPoints(edit.clips)
  if (cuts.length === 0)
    return <p className="text-sm text-muted">{t('editor.transition.noCuts')}</p>

  const cut = selection?.kind === 'transition' ? selection.id : null
  const current = cut ? edit.transitions.find((x) => x.afterClip === cut) : undefined
  const duration = current?.durationMs ?? DEFAULT_TRANSITION_MS

  return (
    <div className="flex flex-col gap-4" data-testid="transition-panel">
      {!cut && <p className="text-sm text-muted">{t('editor.transition.pick')}</p>}
      {cut && (
        <>
          <p className="text-sm text-muted">
            {t('editor.transition.at', { n: cuts.findIndex((c) => c.afterClip === cut) + 1 })}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="transition-none"
              className={chip(!current)}
              onClick={() => setTransition(cut, null)}
            >
              {t('editor.transition.kinds.none')}
            </button>
            {TRANSITION_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                data-testid={`transition-${kind}`}
                className={chip(current?.kind === kind)}
                onClick={() => setTransition(cut, kind)}
              >
                {t(`editor.transition.kinds.${kind}`)}
              </button>
            ))}
          </div>
          {current && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">
                {t('editor.transition.duration')}: {(duration / 1000).toFixed(1)}s
              </span>
              <input
                type="range"
                min={200}
                max={2000}
                step={100}
                value={duration}
                data-testid="transition-duration"
                className="accent-accent"
                onChange={(e) => setTransition(cut, current.kind, Number(e.target.value))}
              />
            </label>
          )}
          {current && (
            <button
              type="button"
              data-testid="transition-all"
              className="self-start text-xs text-accent hover:underline"
              onClick={() => applyTransitionToAll(current.kind, duration)}
            >
              {t('editor.transition.applyAll', { count: cuts.length })}
            </button>
          )}
        </>
      )}
    </div>
  )
}
