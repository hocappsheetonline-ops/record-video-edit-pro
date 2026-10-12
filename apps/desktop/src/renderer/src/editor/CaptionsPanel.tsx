import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Merge, Scissors } from 'lucide-react'
import {
  buildCaptionLines,
  CAPTION_LANGUAGES,
  CAPTION_TEMPLATES,
  FONTS,
  fontFamily,
  mergeCaptionLine,
  sourceToOutput,
  splitCaptionLine,
  toSrt,
  toVtt,
  withCaptionTemplate,
  type CaptionLook,
  type CaptionTemplate,
  type CaptionsState,
} from '@lumora/core'
import type { ExportResult } from '@shared/ipc'
import { lumora } from '../api'
import { useAppStore } from '../store/app'
import { aiErrorText } from './ai-errors'
import { drawCaptionBlock } from './caption-draw'
import { loadFonts } from './fonts'
import { runJob } from './jobs'
import { useEditorStore } from './store'
import { formatTimecode } from './timeline-math'
import { Segmented, SliderRow, Toggle } from './ui'

const button =
  'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50'

/** Mẫu phụ đề vẽ bằng đúng hàm vẽ trên video, từ thứ hai đang được nói. */
function CaptionThumb({ look }: { look: CaptionLook }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    void loadFonts().then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const w = 240
    const h = 120
    canvas.width = w
    canvas.height = h
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#475569')
    g.addColorStop(1, '#0f172a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    const words = ['Xin', 'chào', 'mọi', 'người']
    drawCaptionBlock(
      ctx,
      {
        words: words
          .slice(0, look.maxWords > 0 ? Math.min(3, look.maxWords) : 4)
          .map((text, i) => ({
            text: look.uppercase ? text.toLocaleUpperCase() : text,
            active: i === 1,
            spoken: i <= 1,
            since: i === 1 ? 300 : 600,
          })),
        style: 'highlight',
        look: { ...look, y: 0.5 },
        fontSize: 26,
        translation: null,
      },
      w,
      h,
    )
  }, [look, fontsReady])
  return <canvas ref={ref} aria-hidden className="aspect-[2/1] w-full rounded-md" />
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</h3>
  )
}

export function CaptionsPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const folder = useEditorStore((s) => s.folder)
  const project = useEditorStore((s) => s.project)
  const change = useEditorStore((s) => s.change)
  const [language, setLanguage] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ExportResult | null>(null)
  if (!edit || !folder || !project) return null
  const captions = edit.captions
  const look = captions.look
  const toLang = target ?? (captions.language.startsWith('en') ? 'vi' : 'en')

  const setCaptions = (patch: Partial<CaptionsState>, coalesce?: string) =>
    change((e) => ({ ...e, captions: { ...e.captions, ...patch } }), coalesce)
  const setLook = (patch: Partial<CaptionLook>, coalesce?: string) =>
    change(
      (e) => ({ ...e, captions: { ...e.captions, look: { ...e.captions.look, ...patch } } }),
      coalesce,
    )

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

  const generate = () =>
    run('generate', async () => {
      const transcript = await runJob(t('editor.jobs.captions'), () =>
        lumora().transcribe(folder, language),
      )
      useEditorStore.getState().setTranscript(transcript)
      setCaptions({
        enabled: true,
        language: transcript.language,
        lines: buildCaptionLines(transcript.words),
        bilingual: false,
        translationLanguage: '',
      })
    })

  /** Dịch: thay nội dung (`replace`) hoặc thêm dòng dịch bên dưới (`bilingual`). */
  const translate = (mode: 'replace' | 'bilingual') =>
    run(mode === 'replace' ? 'translate' : 'bilingual', async () => {
      const translated = await lumora().translateLines(
        captions.lines.map((l) => ({ id: l.id, text: l.text })),
        toLang,
      )
      const byId = new Map(translated.map((l) => [l.id, l.text]))
      const lines = useEditorStore.getState().edit?.captions.lines ?? captions.lines
      if (mode === 'replace')
        setCaptions({
          language: toLang,
          bilingual: false,
          lines: lines.map((l) => {
            const next = { ...l, text: byId.get(l.id) ?? l.text, edited: true }
            delete next.translation
            return next
          }),
        })
      else
        setCaptions({
          bilingual: true,
          translationLanguage: toLang,
          lines: lines.map((l) => ({ ...l, translation: byId.get(l.id) ?? l.text })),
        })
    })

  const saveFile = (format: 'srt' | 'vtt') =>
    run(format, async () => {
      const content =
        format === 'srt' ? toSrt(captions.lines, edit.clips) : toVtt(captions.lines, edit.clips)
      setSaved(
        await lumora().saveExportText(
          folder,
          `${project.name}.${captions.language || 'captions'}.${format}`,
          content,
        ),
      )
    })

  const goToSettings = () => useAppStore.getState().setPage('settings')
  const hasTranslation = captions.lines.some((l) => l.translation !== undefined)

  return (
    <div className="flex flex-col gap-4" data-testid="captions-panel">
      {captions.lines.length === 0 ? (
        <>
          <p className="text-sm text-muted">{t('captions.intro')}</p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t('captions.language')}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
            >
              <option value="">{t('captions.auto')}</option>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <button
            type="button"
            data-testid="captions-generate"
            disabled={busy !== null}
            onClick={() => void generate()}
            className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'generate' ? t('captions.generating') : t('captions.generate')}
          </button>
        </>
      ) : (
        <>
          <Toggle
            label={t('captions.show')}
            checked={captions.enabled}
            onChange={(enabled) => setCaptions({ enabled })}
            testId="captions-enabled"
          />

          <Heading>{t('captions.templates')}</Heading>
          <div className="grid grid-cols-2 gap-2">
            {CAPTION_TEMPLATES.map((template: CaptionTemplate) => (
              <button
                key={template}
                type="button"
                data-testid={`caption-template-${template}`}
                aria-pressed={look.template === template}
                onClick={() => setLook(withCaptionTemplate(look, template))}
                className={`flex flex-col gap-1 rounded-lg border p-1 text-left text-[11px] ${
                  look.template === template
                    ? 'border-accent text-text'
                    : 'border-transparent text-muted hover:bg-surface-2 hover:text-text'
                }`}
              >
                <CaptionThumb look={withCaptionTemplate(look, template)} />
                <span className="truncate px-0.5">{t(`captions.templateNames.${template}`)}</span>
              </button>
            ))}
          </div>

          <Heading>{t('captions.style')}</Heading>
          <Segmented
            options={(['highlight', 'classic'] as const).map((value) => ({
              value,
              label: t(`captions.styles.${value}`),
            }))}
            value={captions.style}
            onChange={(style) => setCaptions({ style })}
            testIdPrefix="captions-style-"
          />
          <label className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-muted">{t('captions.font')}</span>
            <select
              data-testid="caption-font"
              aria-label={t('captions.font')}
              value={look.font}
              onChange={(e) => setLook({ font: e.target.value as CaptionLook['font'] })}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
              style={{ fontFamily: fontFamily(look.font) }}
            >
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between text-xs">
              <span className="text-muted">{t('captions.color')}</span>
              <input
                type="color"
                data-testid="caption-color"
                aria-label={t('captions.color')}
                value={look.color}
                onChange={(e) => setLook({ color: e.target.value }, 'cap-color')}
                className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
            <label className="flex items-center justify-between text-xs">
              <span className="text-muted">{t('captions.highlight')}</span>
              <input
                type="color"
                data-testid="caption-highlight"
                aria-label={t('captions.highlight')}
                value={look.highlightColor}
                onChange={(e) => setLook({ highlightColor: e.target.value }, 'cap-hl')}
                className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
          </div>
          <Toggle
            label={t('captions.uppercase')}
            checked={look.uppercase}
            onChange={(uppercase) => setLook({ uppercase })}
            testId="caption-uppercase"
          />
          <Segmented
            label={t('captions.wordsAtOnce')}
            options={[0, 1, 2, 3, 4].map((n) => ({
              value: n,
              label: n === 0 ? t('captions.wholeLine') : String(n),
            }))}
            value={look.maxWords}
            onChange={(maxWords) => setLook({ maxWords })}
            testIdPrefix="caption-words-"
          />
          <Segmented
            label={t('captions.position')}
            options={(['top', 'middle', 'bottom'] as const).map((p) => ({
              value: p,
              label: t(`captions.positions.${p}`),
            }))}
            value={look.y < 0.3 ? 'top' : look.y > 0.7 ? 'bottom' : 'middle'}
            onChange={(p) => {
              const y = p === 'top' ? 0.12 : p === 'middle' ? 0.5 : 0.88
              setCaptions({
                position: p === 'top' ? 'top' : 'bottom',
                look: { ...look, y },
              })
            }}
            testIdPrefix="caption-pos-"
          />
          <SliderRow
            label={t('captions.height')}
            value={look.y}
            min={0.05}
            max={0.95}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            defaultValue={0.88}
            testId="caption-y"
            onChange={(y) => setLook({ y }, 'cap-y')}
          />
          <SliderRow
            label={t('captions.size')}
            value={captions.size}
            min={0.5}
            max={2}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            defaultValue={1}
            testId="caption-size"
            onChange={(size) => setCaptions({ size }, 'cap-size')}
          />

          <Heading>{t('captions.translate')}</Heading>
          <label className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-muted">{t('captions.target')}</span>
            <select
              data-testid="captions-target"
              aria-label={t('captions.target')}
              value={toLang}
              onChange={(e) => setTarget(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
            >
              {CAPTION_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {t(`captions.languages.${code}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={button}
              data-testid="captions-translate"
              disabled={busy !== null}
              onClick={() => void translate('replace')}
            >
              {busy === 'translate' ? t('captions.translating') : t('captions.replace')}
            </button>
            <button
              type="button"
              className={button}
              data-testid="captions-bilingual"
              disabled={busy !== null}
              onClick={() => void translate('bilingual')}
            >
              {busy === 'bilingual' ? t('captions.translating') : t('captions.addBilingual')}
            </button>
          </div>
          {hasTranslation && (
            <Toggle
              label={t('captions.showBilingual')}
              checked={captions.bilingual}
              onChange={(bilingual) => setCaptions({ bilingual })}
              testId="captions-bilingual-on"
            />
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              data-testid="captions-srt"
              disabled={busy !== null}
              onClick={() => void saveFile('srt')}
            >
              {t('captions.saveSrt')}
            </button>
            <button
              type="button"
              className={button}
              data-testid="captions-vtt"
              disabled={busy !== null}
              onClick={() => void saveFile('vtt')}
            >
              {t('captions.saveVtt')}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy !== null}
              onClick={() => setCaptions({ lines: [], enabled: false, bilingual: false })}
            >
              {t('captions.reset')}
            </button>
          </div>
          {saved && (
            <p className="text-xs text-success" data-testid="captions-saved">
              {t('editor.export.done', { file: saved.fileName })}{' '}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => void lumora().revealFile(saved.path)}
              >
                {t('editor.export.reveal')}
              </button>
            </p>
          )}
          <Heading>{t('captions.lines')}</Heading>
          <ol className="flex flex-col gap-2" data-testid="captions-lines">
            {captions.lines.map((line, i) => (
              <li key={line.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="mr-auto font-mono text-[11px] text-muted hover:text-text"
                    onClick={() => {
                      const out = sourceToOutput(edit.clips, line.start)
                      if (out !== null) useEditorStore.getState().setTime(out)
                    }}
                  >
                    {formatTimecode(line.start)}
                  </button>
                  <button
                    type="button"
                    data-testid="caption-split"
                    aria-label={t('captions.split')}
                    data-tooltip={t('captions.split')}
                    onClick={() =>
                      setCaptions({ lines: splitCaptionLine(captions.lines, line.id) })
                    }
                    className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Scissors size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    data-testid="caption-merge"
                    aria-label={t('captions.merge')}
                    data-tooltip={t('captions.merge')}
                    disabled={i === captions.lines.length - 1}
                    onClick={() =>
                      setCaptions({ lines: mergeCaptionLine(captions.lines, line.id) })
                    }
                    className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
                  >
                    <Merge size={12} aria-hidden />
                  </button>
                </div>
                <input
                  value={line.text}
                  data-testid="caption-line"
                  onChange={(e) =>
                    setCaptions(
                      {
                        lines: captions.lines.map((l) =>
                          l.id === line.id ? { ...l, text: e.target.value, edited: true } : l,
                        ),
                      },
                      `cap-${line.id}`,
                    )
                  }
                  className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
                />
                {line.translation !== undefined && (
                  <input
                    value={line.translation}
                    data-testid="caption-translation"
                    aria-label={t('captions.translation')}
                    onChange={(e) =>
                      setCaptions(
                        {
                          lines: captions.lines.map((l) =>
                            l.id === line.id ? { ...l, translation: e.target.value } : l,
                          ),
                        },
                        `cap-tr-${line.id}`,
                      )
                    }
                    className="rounded-md border border-border bg-surface-2/60 px-2 py-1 text-xs text-muted"
                  />
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
          {error.includes('API') && (
            <button
              type="button"
              onClick={goToSettings}
              className="self-start text-accent hover:underline"
            >
              {t('nav.settings')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
