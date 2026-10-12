import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, Clapperboard, Scissors, Send, Sparkle, Trash2 } from 'lucide-react'
import {
  removeSourceRanges,
  sourceToOutput,
  wordsToRanges,
  type AssistantCommand,
  type CutSuggestion,
  type DirectorPlan,
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
    case 'effect':
      return `${t('ai.assistant.kinds.effect')}: ${t(`editor.effects.kinds.${c.effect}`, { defaultValue: c.effect })}`
    case 'transitions':
      return `${t('ai.assistant.kinds.transitions')}: ${t(`editor.transition.kinds.${c.transition}`, { defaultValue: c.transition })}`
    case 'music':
      return `${t('ai.assistant.kinds.music')}${c.query ? `: ${c.query}` : ''} · ${Math.round(c.volume * 100)}%`
    case 'captionsStyle':
      return `${t('ai.assistant.kinds.captionsStyle')}: ${t(`captions.templateNames.${c.template}`, { defaultValue: c.template })}`
    case 'export':
      return `${t('ai.assistant.kinds.export')}: ${c.resolution}p ${c.format.toUpperCase()}`
    case 'styleFrom':
      return `${t('ai.assistant.kinds.styleFrom')}: ${c.project}`
    default:
      return t(`ai.assistant.kinds.${c.kind}`)
  }
}

/** Nhãn nguồn hiểu yêu cầu: AI local (Ollama), Claude, hay chỉ từ khóa. */
function useDirectorEngine(): 'local' | 'claude' | 'keywords' {
  const settings = useAppStore((s) => s.settings)
  const secrets = useAppStore((s) => s.secrets)
  if (settings?.localAi?.enabled) return 'local'
  if (secrets?.anthropic?.state === 'saved') return 'claude'
  return 'keywords'
}

/**
 * Đạo diễn AI: trò chuyện với dự án. Gõ một yêu cầu, AI viết lại thành kế hoạch (cắt, phụ đề,
 * hiệu ứng, nhạc nền, khung hình, xuất…), hỏi lại khi thiếu thông tin, nhớ lịch sử từng dự án,
 * ghi quy tắc "luôn…/từ nay…" và học thói quen từ cách bạn chỉnh. Mỗi lượt làm là một bước hoàn tác.
 */
function Director() {
  const { t } = useTranslation()
  const engine = useDirectorEngine()
  const messages = useEditorStore((s) => s.directorMessages)
  const plan = useEditorStore((s) => s.directorPlan)
  const busy = useEditorStore((s) => s.directorBusy)
  const memory = useEditorStore((s) => s.memory)
  const askConfirm = useEditorStore((s) => s.askConfirm)
  const [text, setText] = useState('')
  const [report, setReport] = useState<AutoEditReport[] | null>(null)
  const [lastPlan, setLastPlan] = useState<DirectorPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const historyRef = useRef<HTMLUListElement>(null)

  // Cuộn xuống tin mới nhất khi lịch sử đổi.
  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, plan])

  const finish = (applied: boolean, result: AutoEditReport[], p: DirectorPlan) => {
    setLastPlan(p)
    setReport(applied ? result : null)
    if (applied && result.some((r) => r.status === 'done'))
      useJobs.getState().toast({ kind: 'success', text: t('ai.assistant.done') })
  }

  const send = async () => {
    const goal = text.trim()
    if (!goal || busy) return
    setText('')
    setError(null)
    setReport(null)
    try {
      const result = await runJob(t('ai.assistant.job'), (progress) =>
        useEditorStore
          .getState()
          .askDirector(goal, (done, total, step) =>
            progress(done / total, t(`ai.auto.steps.${step}`, { defaultValue: step })),
          ),
      )
      finish(result.applied, result.report, result.plan)
    } catch (e) {
      setError(aiErrorText(t, e))
    }
  }

  const apply = async () => {
    if (!plan) return
    setError(null)
    try {
      const pending = plan
      const result = await runJob(t('ai.assistant.job'), (progress) =>
        useEditorStore
          .getState()
          .applyDirectorPlan((done, total, step) =>
            progress(done / total, t(`ai.auto.steps.${step}`, { defaultValue: step })),
          ),
      )
      finish(true, result, pending)
    } catch (e) {
      setError(aiErrorText(t, e))
    }
  }

  const habits = Object.entries(memory.counts)
    .map(([key, bucket]) => {
      const best = Object.entries(bucket).sort((a, b) => b[1] - a[1])[0]
      return best ? { key, value: best[0], n: best[1] } : null
    })
    .filter((h): h is { key: string; value: string; n: number } => h !== null)

  const hasPlan = plan !== null
  const shownCommands = plan?.commands ?? lastPlan?.commands ?? null

  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3"
      data-testid="ai-assistant"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clapperboard size={15} className="text-accent" aria-hidden />
          {t('ai.assistant.title')}
        </h3>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
            engine === 'keywords' ? 'bg-surface-2 text-muted' : 'bg-success/15 text-success'
          }`}
          data-testid="director-engine"
          data-engine={engine}
          title={engine === 'keywords' ? t('ai.assistant.noAiHint') : undefined}
        >
          {t(`ai.assistant.engine.${engine}`)}
        </span>
      </div>
      <p className="text-xs text-muted">{t('ai.assistant.intro')}</p>

      {(messages.length > 0 || hasPlan) && (
        <ul
          ref={historyRef}
          className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-2/60 p-2"
          data-testid="director-history"
        >
          {messages.map((m, i) => (
            <li
              key={`${m.at}-${i}`}
              data-testid="director-message"
              data-role={m.role}
              className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-xs ${
                m.role === 'user'
                  ? 'self-end bg-accent text-accent-fg'
                  : 'self-start border border-border bg-surface text-text'
              }`}
            >
              {m.text}
            </li>
          ))}
          {hasPlan && (
            <li
              className="flex flex-col gap-1.5 self-stretch rounded-lg border border-accent/40 bg-surface p-2 text-xs"
              data-testid="director-plan"
            >
              {plan.summary && <p className="font-medium">{plan.summary}</p>}
              {plan.questions.map((q, i) => (
                <p key={i} className="text-text" data-testid="director-question">
                  {q}
                </p>
              ))}
              {plan.commands.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {plan.commands.map((c, i) => (
                    <li
                      key={i}
                      data-testid="director-plan-command"
                      data-kind={c.kind}
                      className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] text-accent"
                    >
                      {commandLabel(t, c)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {plan.commands.length > 0 && (
                  <button
                    type="button"
                    data-testid="director-apply"
                    disabled={busy}
                    onClick={() => void apply()}
                    className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
                  >
                    {plan.questions.length > 0
                      ? t('ai.assistant.applyAnyway')
                      : t('ai.assistant.apply', { count: plan.commands.length })}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="director-discard"
                  disabled={busy}
                  onClick={() => useEditorStore.getState().discardDirectorPlan()}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted hover:text-text disabled:opacity-50"
                >
                  {t('ai.assistant.discard')}
                </button>
                {plan.questions.length > 0 && (
                  <span className="text-[11px] text-muted">{t('ai.assistant.answerHint')}</span>
                )}
              </div>
            </li>
          )}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={text}
          rows={2}
          data-testid="assistant-input"
          placeholder={
            hasPlan && plan.questions.length > 0
              ? t('ai.assistant.answerPlaceholder')
              : t('ai.assistant.placeholder')
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          data-testid="assistant-run"
          disabled={busy || !text.trim()}
          onClick={() => void send()}
          aria-label={t('ai.assistant.run')}
          title={t('ai.assistant.run')}
          className="flex h-[46px] w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm hover:brightness-110 disabled:opacity-50"
        >
          {busy ? (
            <Sparkle size={16} className="animate-pulse" aria-hidden />
          ) : (
            <Send size={16} aria-hidden />
          )}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(['full', 'silences', 'captions', 'vertical', 'cinematic'] as const).map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`assistant-example-${k}`}
            onClick={() => setText(t(`ai.assistant.examples.${k}`))}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted hover:text-text"
          >
            {t(`ai.assistant.examples.${k}`)}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          data-testid="director-ask-confirm"
          checked={askConfirm}
          onChange={(e) => useEditorStore.getState().setAskConfirm(e.target.checked)}
        />
        {t('ai.assistant.askFirst')}
      </label>

      {report && report.length === 0 && shownCommands && shownCommands.length === 0 && (
        <p className="text-xs text-muted" data-testid="assistant-none">
          {t('ai.assistant.none')}
        </p>
      )}
      {report && report.length > 0 && (
        <ul className="flex flex-wrap gap-1" data-testid="assistant-commands">
          {report.map((r, i) => (
            <li
              key={i}
              data-testid="assistant-command"
              data-kind={r.step}
              data-status={r.status}
              title={
                r.status === 'done'
                  ? t('ai.auto.status.done', { n: r.detail })
                  : r.status === 'skipped'
                    ? t('ai.auto.status.skipped', {
                        reason: t(`ai.auto.reasons.${r.detail}`, {
                          defaultValue: String(r.detail),
                        }),
                      })
                    : t('ai.auto.status.error', { message: String(r.detail) })
              }
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${
                r.status === 'done'
                  ? 'bg-accent/15 text-accent'
                  : r.status === 'skipped'
                    ? 'bg-surface-2 text-muted line-through'
                    : 'bg-danger/10 text-danger'
              }`}
            >
              {t(`ai.assistant.kinds.${r.step}`, {
                defaultValue: t(`ai.auto.steps.${r.step}`, { defaultValue: r.step }),
              })}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          data-testid="director-rules-toggle"
          onClick={() => setShowRules((v) => !v)}
          aria-expanded={showRules}
          className="flex items-center gap-1.5 self-start text-[11px] font-medium text-muted hover:text-text"
        >
          <Brain size={13} aria-hidden />
          {t('ai.assistant.memoryTitle', { count: memory.rules.length })}
        </button>
        {showRules && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2/60 p-2 text-xs">
            <p className="text-muted">{t('ai.assistant.memoryHint')}</p>
            {memory.rules.length === 0 ? (
              <p className="text-muted" data-testid="director-no-rules">
                {t('ai.assistant.noRules')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="director-rules">
                {memory.rules.map((rule) => (
                  <li key={rule} className="flex items-center gap-2" data-testid="director-rule">
                    <span className="min-w-0 flex-1 truncate">{rule}</span>
                    <button
                      type="button"
                      data-testid="director-rule-forget"
                      aria-label={t('ai.assistant.forget')}
                      title={t('ai.assistant.forget')}
                      onClick={() => useEditorStore.getState().forgetDirectorRule(rule)}
                      className="rounded p-0.5 text-muted hover:text-danger"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {habits.length > 0 && (
              <p className="text-muted" data-testid="director-habits">
                {t('ai.assistant.habits')}{' '}
                {habits
                  .map(
                    (h) =>
                      `${t(`ai.assistant.habitKeys.${h.key}`, { defaultValue: h.key })}: ${h.value} (×${h.n})`,
                  )
                  .join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>

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
              className={`rounded-md border px-2.5 py-0.5 text-[11px] ${
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
        <Sparkle size={14} aria-hidden className="mr-1 inline" />
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
      <Director />
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
