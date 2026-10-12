import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Scissors, Sparkles, WandSparkles } from 'lucide-react'
import {
  removeSourceRanges,
  sourceToOutput,
  wordsToRanges,
  type AssistantCommand,
  type CutSuggestion,
} from '@lumora/core'
import { useAppStore } from '../store/app'
import type { AiSummary } from '@shared/ipc'
import { lumora } from '../api'
import { aiErrorText } from './ai-errors'
import { runJob, useJobs } from './jobs'
import { AUTO_EDIT_STEPS, useEditorStore, type AutoEditOptions, type AutoEditReport } from './store'
import { formatTimecode } from './timeline-math'

const button =
  'rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50 disabled:shadow-none'
const heading = 'text-sm font-semibold'

const DEFAULT_AUTO: AutoEditOptions = {
  silences: true,
  fillers: true,
  zooms: true,
  captions: true,
  audio: true,
  title: false,
}

/** Nhãn ngắn của một lệnh trợ lý (hiện thành thẻ sau khi AI hiểu yêu cầu). */
function commandLabel(t: ReturnType<typeof useTranslation>['t'], c: AssistantCommand): string {
  switch (c.kind) {
    case 'title':
      return `${t('ai.assistant.kinds.title')}: “${c.text}”`
    case 'filter':
      return `${t('ai.assistant.kinds.filter')}: ${t(`editor.look.filters.${c.preset}`, { defaultValue: c.preset })}`
    case 'speed':
      return `${t('ai.assistant.kinds.speed')}: ${c.factor}×`
    case 'aspect':
      return `${t('ai.assistant.kinds.aspect')}: ${c.aspect}`
    case 'trimStart':
    case 'trimEnd':
      return `${t(`ai.assistant.kinds.${c.kind}`)}: ${(c.ms / 1000).toFixed(0)}s`
    default:
      return t(`ai.assistant.kinds.${c.kind}`)
  }
}

/** Trợ lý AI kiểu EditPilot: gõ yêu cầu, AI hiểu thành lệnh rồi làm; hoàn tác một lần. */
function Assistant() {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [commands, setCommands] = useState<AssistantCommand[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await runJob(t('ai.assistant.job'), (progress) =>
        useEditorStore
          .getState()
          .runAssistant(text, (done, total, step) =>
            progress(done / total, t(`ai.auto.steps.${step}`)),
          ),
      )
      setCommands(result.commands)
      if (result.commands.length > 0)
        useJobs.getState().toast({ kind: 'success', text: t('ai.assistant.done') })
    } catch (e) {
      setError(aiErrorText(t, e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3"
      data-testid="ai-assistant"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <WandSparkles size={15} className="text-accent" aria-hidden />
        {t('ai.assistant.title')}
      </h3>
      <p className="text-xs text-muted">{t('ai.assistant.intro')}</p>
      <textarea
        value={text}
        rows={2}
        data-testid="assistant-input"
        placeholder={t('ai.assistant.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void run()
          }
        }}
        className="resize-none rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="flex flex-wrap gap-1">
        {(['silences', 'captions', 'vertical', 'cinematic'] as const).map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`assistant-example-${k}`}
            onClick={() => setText(t(`ai.assistant.examples.${k}`))}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-text"
          >
            {t(`ai.assistant.examples.${k}`)}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="assistant-run"
        disabled={busy || !text.trim()}
        onClick={() => void run()}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110 disabled:opacity-50"
      >
        {busy ? t('ai.working') : t('ai.assistant.run')}
      </button>
      {commands && commands.length === 0 && (
        <p className="text-xs text-muted" data-testid="assistant-none">
          {t('ai.assistant.none')}
        </p>
      )}
      {commands && commands.length > 0 && (
        <ul className="flex flex-wrap gap-1" data-testid="assistant-commands">
          {commands.map((c, i) => (
            <li
              key={i}
              data-testid="assistant-command"
              data-kind={c.kind}
              className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent"
            >
              {commandLabel(t, c)}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}

/** Chia video dài thành nhiều video ngắn (dự án riêng), theo chương AI hoặc mỗi N giây. */
function Shorts() {
  const { t } = useTranslation()
  const setPage = useAppStore((s) => s.setPage)
  const [mode, setMode] = useState<'chapters' | 'fixed'>('fixed')
  const [seconds, setSeconds] = useState(60)
  const [vertical, setVertical] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    setCount(null)
    try {
      const n = await runJob(t('ai.shorts.job'), (progress) =>
        useEditorStore
          .getState()
          .splitIntoShorts({ mode, seconds, vertical }, (done, total) => progress(done / total)),
      )
      setCount(n)
      if (n > 0)
        useJobs.getState().toast({
          kind: 'success',
          text: t('ai.shorts.done', { count: n }),
          action: { label: t('nav.projects'), run: () => setPage('projects') },
        })
    } catch (e) {
      setError(aiErrorText(t, e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="flex flex-col gap-3" data-testid="ai-shorts">
      <h3 className={`${heading} flex items-center gap-1.5`}>
        <Scissors size={14} aria-hidden className="text-muted" />
        {t('ai.shorts.title')}
      </h3>
      <p className="text-xs text-muted">{t('ai.shorts.intro')}</p>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['fixed', 60],
            ['fixed', 90],
            ['fixed', 120],
            ['chapters', 0],
          ] as const
        ).map(([m, s]) => {
          const active = mode === m && (m === 'chapters' || seconds === s)
          return (
            <button
              key={`${m}-${s}`}
              type="button"
              data-testid={m === 'chapters' ? 'shorts-mode-chapters' : `shorts-mode-${s}`}
              aria-pressed={active}
              onClick={() => {
                setMode(m)
                if (m === 'fixed') setSeconds(s)
              }}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                active
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              {m === 'chapters' ? t('ai.shorts.byChapters') : t('ai.shorts.every', { s })}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          data-testid="shorts-vertical"
          checked={vertical}
          onChange={(e) => setVertical(e.target.checked)}
        />
        {t('ai.shorts.vertical')}
      </label>
      <button
        type="button"
        data-testid="shorts-run"
        disabled={busy}
        onClick={() => void run()}
        className={button}
      >
        <Sparkles size={14} aria-hidden className="mr-1 inline" />
        {busy ? t('ai.working') : t('ai.shorts.run')}
      </button>
      {count === 0 && <p className="text-xs text-muted">{t('ai.shorts.tooShort')}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}

/** Một bấm: AI tự cắt, zoom, phụ đề, âm thanh, tiêu đề theo các ô đã chọn; hoàn tác một lần. */
function AutoEdit() {
  const { t } = useTranslation()
  const [options, setOptions] = useState<AutoEditOptions>(DEFAULT_AUTO)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<AutoEditReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const count = AUTO_EDIT_STEPS.filter((s) => options[s]).length

  const run = async () => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const result = await runJob(t('ai.auto.job'), (progress) =>
        useEditorStore
          .getState()
          .autoEdit(options, (done, total, step) =>
            progress(done / total, t(`ai.auto.steps.${step}`)),
          ),
      )
      setReport(result)
      if (result.some((r) => r.status === 'done'))
        useJobs.getState().toast({ kind: 'success', text: t('ai.auto.done') })
    } catch (e) {
      setError(aiErrorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  const detailText = (r: AutoEditReport) =>
    r.status === 'done'
      ? t('ai.auto.status.done', { n: r.detail })
      : r.status === 'skipped'
        ? t('ai.auto.status.skipped', {
            reason: t(`ai.auto.reasons.${r.detail}`, { defaultValue: String(r.detail) }),
          })
        : t('ai.auto.status.error', { message: String(r.detail) })

  return (
    <section className="flex flex-col gap-3" data-testid="ai-auto">
      <h3 className={heading}>{t('ai.auto.title')}</h3>
      <p className="text-xs text-muted">{t('ai.auto.intro')}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {AUTO_EDIT_STEPS.map((step) => (
          <label key={step} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              data-testid={`ai-auto-${step}`}
              checked={options[step]}
              onChange={(e) => setOptions({ ...options, [step]: e.target.checked })}
            />
            {t(`ai.auto.steps.${step}`)}
          </label>
        ))}
      </div>
      <button
        type="button"
        data-testid="ai-auto-run"
        disabled={busy || count === 0}
        onClick={() => void run()}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110 disabled:opacity-50"
      >
        {busy ? t('ai.working') : t('ai.auto.run', { count })}
      </button>
      {report && (
        <ul className="flex flex-col gap-1 text-xs" data-testid="ai-auto-report">
          {report.map((r) => (
            <li key={r.step} className="flex items-start gap-2" data-status={r.status}>
              <span
                className={`mt-0.5 size-2 shrink-0 rounded-full ${
                  r.status === 'done'
                    ? 'bg-success'
                    : r.status === 'skipped'
                      ? 'bg-muted'
                      : 'bg-danger'
                }`}
                aria-hidden
              />
              <span>
                <span className="font-medium">{t(`ai.auto.steps.${r.step}`)}</span>
                <span className="text-muted"> · {detailText(r)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}

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
      <Assistant />
      <AutoEdit />
      <Shorts />

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
