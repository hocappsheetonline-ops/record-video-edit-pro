import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildCaptionLines, sourceToOutput, toSrt, toVtt, type CaptionsState } from '@lumora/core'
import type { ExportResult } from '@shared/ipc'
import { lumora } from '../api'
import { useAppStore } from '../store/app'
import { aiErrorText } from './ai-errors'
import { useEditorStore } from './store'
import { formatTimecode } from './timeline-math'

const button =
  'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50'
const segmented = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-text'}`

export function CaptionsPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const folder = useEditorStore((s) => s.folder)
  const project = useEditorStore((s) => s.project)
  const change = useEditorStore((s) => s.change)
  const [language, setLanguage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ExportResult | null>(null)
  if (!edit || !folder || !project) return null
  const captions = edit.captions

  const setCaptions = (patch: Partial<CaptionsState>, coalesce?: string) =>
    change((e) => ({ ...e, captions: { ...e.captions, ...patch } }), coalesce)

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
      const transcript = await lumora().transcribe(folder, language)
      useEditorStore.getState().setTranscript(transcript)
      setCaptions({
        enabled: true,
        language: transcript.language,
        lines: buildCaptionLines(transcript.words),
      })
    })

  const translate = (target: string) =>
    run('translate', async () => {
      const translated = await lumora().translateLines(
        captions.lines.map((l) => ({ id: l.id, text: l.text })),
        target,
      )
      const byId = new Map(translated.map((l) => [l.id, l.text]))
      setCaptions({
        language: target,
        lines: captions.lines.map((l) => ({ ...l, text: byId.get(l.id) ?? l.text, edited: true })),
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="captions-enabled"
              checked={captions.enabled}
              onChange={(e) => setCaptions({ enabled: e.target.checked })}
              className="size-4 accent-accent"
            />
            {t('captions.show')}
          </label>
          <div className="flex flex-wrap gap-1">
            {(['highlight', 'classic'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setCaptions({ style })}
                className={segmented(captions.style === style)}
              >
                {t(`captions.styles.${style}`)}
              </button>
            ))}
            {(['bottom', 'top'] as const).map((position) => (
              <button
                key={position}
                type="button"
                onClick={() => setCaptions({ position })}
                className={segmented(captions.position === position)}
              >
                {t(`captions.positions.${position}`)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">
              {t('captions.size')}: {Math.round(captions.size * 100)}%
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={captions.size}
              onChange={(e) => setCaptions({ size: Number(e.target.value) }, 'cap-size')}
              className="accent-accent"
            />
          </label>
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
              data-testid="captions-translate"
              disabled={busy !== null}
              onClick={() => void translate(captions.language.startsWith('en') ? 'vi' : 'en')}
            >
              {busy === 'translate'
                ? t('captions.translating')
                : captions.language.startsWith('en')
                  ? t('captions.toVi')
                  : t('captions.toEn')}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy !== null}
              onClick={() => setCaptions({ lines: [], enabled: false })}
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
          <ol className="flex flex-col gap-2" data-testid="captions-lines">
            {captions.lines.map((line) => (
              <li key={line.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  className="self-start font-mono text-[11px] text-muted hover:text-text"
                  onClick={() => {
                    const out = sourceToOutput(edit.clips, line.start)
                    if (out !== null) useEditorStore.getState().setTime(out)
                  }}
                >
                  {formatTimecode(line.start)}
                </button>
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
