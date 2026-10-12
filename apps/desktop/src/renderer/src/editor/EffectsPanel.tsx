import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { EFFECT_KINDS } from '@lumora/core'
import { useEditorStore } from './store'

/** Thư viện hiệu ứng hình (thêm tại đầu phát) và chỉnh hiệu ứng đang chọn. */
export function EffectsPanel() {
  const { t } = useTranslation()
  const effect = useEditorStore((s) =>
    s.selection?.kind === 'effect'
      ? s.edit?.effects.find((x) => x.id === s.selection!.id)
      : undefined,
  )
  const { addEffect, updateEffect, deleteSelection } = useEditorStore.getState()
  return (
    <div className="flex flex-col gap-4" data-testid="effects-panel">
      <p className="text-xs text-muted">{t('editor.effects.hint')}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {EFFECT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`effect-add-${kind}`}
            onClick={() => addEffect(kind)}
            className="rounded-md bg-surface-2 px-2 py-1.5 text-xs hover:bg-accent/20"
          >
            {t(`editor.effects.kinds.${kind}`)}
          </button>
        ))}
      </div>
      {effect && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
          data-testid="effect-selected"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t(`editor.effects.kinds.${effect.kind}`)}</span>
            <button
              type="button"
              aria-label={t('editor.effects.remove')}
              data-testid="effect-remove"
              onClick={deleteSelection}
              className="text-danger"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              {t('editor.effects.intensity')}: {Math.round(effect.intensity * 100)}%
            </span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={effect.intensity}
              data-testid="effect-intensity"
              className="accent-accent"
              onChange={(e) =>
                updateEffect(
                  effect.id,
                  { intensity: Number(e.target.value) },
                  `fx-int-${effect.id}`,
                )
              }
            />
          </label>
          <p className="text-xs text-muted">
            {((effect.end - effect.start) / 1000).toFixed(1)}s · {t('editor.effects.dragHint')}
          </p>
        </div>
      )}
    </div>
  )
}
