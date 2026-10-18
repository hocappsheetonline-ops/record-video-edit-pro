import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sourceDuration, sourceToOutput, type ZoomRegion } from '@lumora/core'
import { lumora } from '../api'
import { aiErrorText } from './ai-errors'
import { useEditorStore } from './store'
import { formatTimecode } from './timeline-math'

const button =
  'rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50 disabled:shadow-none'
const heading = 'text-sm font-semibold'

const PRESETS = ['narration', 'tidy', 'calmer'] as const

/**
 * Chỉnh các đoạn zoom bằng Claude: mô tả cách muốn zoom (hoặc chọn gợi ý), xem trước danh sách
 * đề xuất rồi mới áp dụng (một bước hoàn tác).
 */
export function ZoomPlan() {
  const { t } = useTranslation()
  const folder = useEditorStore((s) => s.folder)
  const project = useEditorStore((s) => s.project)
  const edit = useEditorStore((s) => s.edit)
  const cursor = useEditorStore((s) => s.cursor)
  const [ask, setAsk] = useState('')
  const [plan, setPlan] = useState<ZoomRegion[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!folder || !project || !edit) return null

  const planZooms = async () => {
    setBusy(true)
    setError(null)
    setPlan(null)
    try {
      setPlan(
        await lumora().planZooms(folder, {
          instruction: ask.trim(),
          zooms: edit.zooms,
          durationMs: sourceDuration(project.segments),
          clicks: cursor?.clicks.map((c) => c.s) ?? [],
        }),
      )
    } catch (e) {
      setError(aiErrorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!plan) return
    useEditorStore.getState().setZooms(plan)
    setPlan(null)
  }

  return (
    <section className="flex flex-col gap-3" data-testid="ai-zoom">
      <h3 className={heading}>{t('ai.zoom.title')}</h3>
      <p className="text-xs text-muted">{t('ai.zoom.intro')}</p>
      <p className="text-xs text-muted" data-testid="ai-zoom-current">
        {t('ai.zoom.current', { count: edit.zooms.length })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            data-testid={`ai-zoom-preset-${preset}`}
            onClick={() => setAsk(t(`ai.zoom.presets.${preset}`))}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
          >
            {t(`ai.zoom.presets.${preset}`)}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        value={ask}
        data-testid="ai-zoom-instruction"
        aria-label={t('ai.zoom.title')}
        placeholder={t('ai.zoom.placeholder')}
        onChange={(e) => setAsk(e.target.value)}
        className="resize-none rounded-md border border-border bg-surface-2 px-2.5 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        data-testid="ai-zoom-plan"
        className={button}
        disabled={busy || !ask.trim()}
        onClick={() => void planZooms()}
      >
        {busy ? t('ai.working') : t('ai.zoom.plan')}
      </button>
      {plan && (
        <div className="flex flex-col gap-2" data-testid="ai-zoom-proposal">
          <p className="text-sm">
            {t('ai.zoom.proposal', { count: plan.length, current: edit.zooms.length })}
          </p>
          {plan.length > 0 && (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-muted">
              {plan.map((z) => (
                <li key={z.id} className="flex gap-2 font-mono" data-testid="ai-zoom-item">
                  <span>
                    {formatTimecode(sourceToOutput(edit.clips, z.start) ?? z.start)} –{' '}
                    {formatTimecode(sourceToOutput(edit.clips, z.end) ?? z.end)}
                  </span>
                  <span>{z.scale.toFixed(1)}×</span>
                  <span>{t(`editor.zoom.modes.${z.mode}`)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="ai-zoom-apply"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
              onClick={apply}
            >
              {t('ai.zoom.apply')}
            </button>
            <button type="button" className={button} onClick={() => setPlan(null)}>
              {t('ai.zoom.discard')}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
