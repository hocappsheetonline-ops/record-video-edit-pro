import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { removeSourceRanges, sourceToOutput, wordsToRanges, type CutSuggestion } from '@lumora/core'
import type { AiSummary } from '@shared/ipc'
import { lumora } from '../api'
import { aiErrorText } from './ai-errors'
import { useEditorStore } from './store'
import { formatTimecode } from './timeline-math'

const button =
  'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50'
const heading = 'text-sm font-medium'

export function AiPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const folder = useEditorStore((s) => s.folder)
  const project = useEditorStore((s) => s.project)
  const transcript = useEditorStore((s) => s.transcript)
  const change = useEditorStore((s) => s.change)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<CutSuggestion[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set())
  const [summary, setSummary] = useState<AiSummary | null>(null)

  const keptWords = useMemo(() => {
    if (!edit || !transcript) return []
    return transcript.words.map((w) => sourceToOutput(edit.clips, (w.start + w.end) / 2) !== null)
  }, [edit, transcript])

  if (!edit || !folder || !project) return null

  const run = async (name: string, task: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(aiErrorText(t, e))
    } finally {
      setBusy(null)
    }
  }

  const findCuts = () =>
    run('cuts', async () => {
      const list = await lumora().suggestCuts(folder)
      // Chỉ gợi ý phần còn nằm trên timeline.
      const visible = list.filter((s) => sourceToOutput(edit.clips, (s.start + s.end) / 2) !== null)
      setSuggestions(visible)
      setChecked(new Set(visible.map((s) => s.id)))
    })

  const applyCuts = () => {
    const ranges = (suggestions ?? [])
      .filter((s) => checked.has(s.id))
      .map((s) => ({ start: s.start, end: s.end }))
    change((e) => ({ ...e, clips: removeSourceRanges(e.clips, ranges) }))
    setSuggestions(null)
  }

  const cutWords = () => {
    if (!transcript) return
    const ranges = wordsToRanges(transcript.words, [...selectedWords])
    change((e) => ({ ...e, clips: removeSourceRanges(e.clips, ranges) }))
    setSelectedWords(new Set())
  }

  const makeSummary = () => run('summary', async () => setSummary(await lumora().summarize(folder)))

  const chapterLines = (summary?.chapters ?? []).flatMap((c) => {
    const out = sourceToOutput(edit.clips, c.start)
    return out === null ? [] : [`${formatTimecode(out).replace(/\.\d$/, '')} ${c.title}`]
  })
  const summaryText = summary
    ? [
        summary.titles[0] ?? '',
        '',
        summary.description,
        '',
        ...chapterLines,
        '',
        summary.hashtags.join(' '),
      ].join('\n')
    : ''

  return (
    <div className="flex flex-col gap-6" data-testid="ai-panel">
      <section className="flex flex-col gap-3">
        <h3 className={heading}>{t('ai.cuts.title')}</h3>
        <p className="text-xs text-muted">{t('ai.cuts.intro')}</p>
        <button
          type="button"
          data-testid="ai-suggest"
          className={button}
          disabled={busy !== null}
          onClick={() => void findCuts()}
        >
          {busy === 'cuts' ? t('ai.working') : t('ai.cuts.find')}
        </button>
        {suggestions && suggestions.length === 0 && (
          <p className="text-sm text-muted">{t('ai.cuts.none')}</p>
        )}
        {suggestions && suggestions.length > 0 && (
          <>
            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <label className="flex items-start gap-2 text-sm" data-testid="ai-suggestion">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-accent"
                      checked={checked.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(checked)
                        if (e.target.checked) next.add(s.id)
                        else next.delete(s.id)
                        setChecked(next)
                      }}
                    />
                    <span>
                      <span className="mr-1 rounded bg-surface-2 px-1.5 text-[11px] text-muted">
                        {t(`ai.kinds.${s.kind}`)}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {formatTimecode(sourceToOutput(edit.clips, s.start) ?? 0)}
                      </span>{' '}
                      {s.text
                        ? `“${s.text}”`
                        : t('ai.cuts.silenceLength', {
                            seconds: ((s.end - s.start) / 1000).toFixed(1),
                          })}
                      {s.reason && <span className="block text-xs text-muted">{s.reason}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="ai-apply"
              disabled={checked.size === 0}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              onClick={applyCuts}
            >
              {t('ai.cuts.apply', { count: checked.size })}
            </button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className={heading}>{t('ai.text.title')}</h3>
        {!transcript ? (
          <p className="text-xs text-muted">{t('ai.errors.noTranscript')}</p>
        ) : (
          <>
            <p className="text-xs text-muted">{t('ai.text.intro')}</p>
            <div
              className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2 text-sm leading-7"
              data-testid="ai-transcript"
            >
              {transcript.words.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid="ai-word"
                  disabled={!keptWords[i]}
                  onClick={() => {
                    const next = new Set(selectedWords)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    setSelectedWords(next)
                  }}
                  className={`mr-1 rounded px-0.5 ${
                    !keptWords[i]
                      ? 'text-muted line-through'
                      : selectedWords.has(i)
                        ? 'bg-danger/30 text-danger'
                        : 'hover:bg-surface'
                  }`}
                >
                  {w.text}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="ai-cut-words"
              className={button}
              disabled={selectedWords.size === 0}
              onClick={cutWords}
            >
              {t('ai.text.cut', { count: selectedWords.size })}
            </button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className={heading}>{t('ai.summary.title')}</h3>
        <button
          type="button"
          data-testid="ai-summarize"
          className={button}
          disabled={busy !== null}
          onClick={() => void makeSummary()}
        >
          {busy === 'summary' ? t('ai.working') : t('ai.summary.make')}
        </button>
        {summary && (
          <div className="flex flex-col gap-2 text-sm" data-testid="ai-summary">
            <ul className="list-disc pl-5">
              {summary.titles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
            <p className="text-muted">{summary.description}</p>
            {chapterLines.length > 0 && (
              <pre
                className="whitespace-pre-wrap rounded bg-surface-2 p-2 text-xs"
                data-testid="ai-chapters"
              >
                {chapterLines.join('\n')}
              </pre>
            )}
            <p className="text-accent">{summary.hashtags.join(' ')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className={button}
                onClick={() => void navigator.clipboard?.writeText(summaryText)}
              >
                {t('ai.summary.copy')}
              </button>
              <button
                type="button"
                className={button}
                onClick={() =>
                  void lumora().saveExportText(folder, `${project.name}.txt`, summaryText)
                }
              >
                {t('ai.summary.save')}
              </button>
            </div>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
