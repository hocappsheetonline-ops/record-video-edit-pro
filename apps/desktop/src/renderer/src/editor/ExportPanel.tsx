import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { outputSize, RESOLUTIONS, type Resolution } from '@lumora/core'
import type { ExportResult } from '@shared/ipc'
import { lumora } from '../api'
import { ipcErrorMessage } from '../lib/prefs'
import { ExportCancelled, exportVideo, type ExportProgress } from './exporter'
import { runJob, useJobs } from './jobs'
import { useEditorStore } from './store'

const segmented = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-text'}`

export function ExportPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const videoSize = useEditorStore((s) => s.videoSize)
  const change = useEditorStore((s) => s.change)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  if (!edit) return null

  const size = outputSize(edit.frame.aspect, edit.export.resolution, videoSize)
  const setExport = (patch: Partial<typeof edit.export>) =>
    change((e) => ({ ...e, export: { ...e.export, ...patch } }))

  const run = async () => {
    const { folder, project, events } = useEditorStore.getState()
    if (!folder || !project) return
    setError(null)
    setResult(null)
    useEditorStore.getState().setPlaying(false)
    const controller = new AbortController()
    abort.current = controller
    setProgress({ phase: 'render', progress: 0 })
    // Xuất từ bản sao lúc bấm: vẫn chỉnh sửa tiếp được trong lúc xuất (theo dõi ở Việc đang làm).
    const snapshot = useEditorStore.getState().edit!
    const label = t('editor.jobs.export', { format: snapshot.export.format.toUpperCase() })
    try {
      const done = await runJob(
        label,
        (report) =>
          exportVideo({
            folder,
            project,
            edit: snapshot,
            events,
            videoSize,
            signal: controller.signal,
            onProgress: (p) => {
              setProgress(p)
              report(p.phase === 'render' ? p.progress * 0.9 : 0.9 + p.progress * 0.1)
            },
          }),
        {
          cancel: () => controller.abort(),
          errorText: (e) =>
            e instanceof ExportCancelled ? t('editor.jobs.cancelled') : ipcErrorMessage(e),
        },
      )
      setResult(done)
      useJobs.getState().toast(
        {
          kind: 'success',
          text: t('editor.export.done', { file: done.fileName }),
          action: {
            label: t('editor.export.reveal'),
            run: () => void lumora().revealFile(done.path),
          },
        },
        8000,
      )
    } catch (e) {
      if (!(e instanceof ExportCancelled)) {
        const message = ipcErrorMessage(e)
        setError(
          message === 'ai_bg_unavailable'
            ? t('editor.aiBg.status.unavailable')
            : message.startsWith('reverse_')
              ? t('editor.reverse.failed')
              : message,
        )
      }
    } finally {
      abort.current = null
      setProgress(null)
    }
  }

  const busy = progress !== null
  return (
    <div className="flex flex-col gap-4" data-testid="export-panel">
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t('editor.export.format')}</span>
        <div className="flex gap-1">
          {(['mp4', 'gif'] as const).map((format) => (
            <button
              key={format}
              type="button"
              data-testid={`format-${format}`}
              disabled={busy}
              onClick={() => setExport({ format })}
              className={segmented(edit.export.format === format)}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t('editor.export.resolution')}</span>
        <div className="flex flex-wrap gap-1">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`resolution-${r}`}
              disabled={busy}
              onClick={() => setExport({ resolution: r as Resolution })}
              className={segmented(edit.export.resolution === r)}
            >
              {r === 2160 ? '4K' : `${r}p`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t('editor.export.fps')}</span>
        <div className="flex gap-1">
          {([30, 60] as const).map((fps) => (
            <button
              key={fps}
              type="button"
              disabled={busy}
              onClick={() => setExport({ fps })}
              className={segmented(edit.export.fps === fps)}
            >
              {fps} fps
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted" data-testid="export-size">
        {size.width} × {size.height}
      </p>

      {busy ? (
        <div className="flex flex-col gap-2" data-testid="export-progress">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(progress.progress * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {progress.phase === 'render'
                ? t('editor.export.rendering', { percent: Math.round(progress.progress * 100) })
                : t('editor.export.muxing')}
            </span>
            {progress.phase === 'render' && (
              <button
                type="button"
                onClick={() => abort.current?.abort()}
                className="text-danger hover:underline"
              >
                {t('editor.export.cancel')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="export-start"
          onClick={() => void run()}
          className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-fg hover:opacity-90"
        >
          {t('editor.export.start')}
        </button>
      )}

      {result && (
        <div
          className="flex flex-col gap-2 rounded-lg bg-success/10 p-3 text-sm"
          data-testid="export-result"
        >
          <span className="text-success">{t('editor.export.done', { file: result.fileName })}</span>
          <button
            type="button"
            onClick={() => void lumora().revealFile(result.path)}
            className="self-start text-accent hover:underline"
          >
            {t('editor.export.reveal')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {t('editor.export.failed', { message: error })}
        </p>
      )}
    </div>
  )
}
