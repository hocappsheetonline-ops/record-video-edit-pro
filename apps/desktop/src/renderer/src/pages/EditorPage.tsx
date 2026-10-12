import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play, Redo2, Scissors, Trash2, Undo2 } from 'lucide-react'
import { outputDuration, SPEEDS } from '@lumora/core'
import { lumora } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Inspector } from '../editor/Inspector'
import { PreviewCanvas } from '../editor/PreviewCanvas'
import { selectedClip, useEditorStore } from '../editor/store'
import { Timeline } from '../editor/Timeline'
import { formatTimecode } from '../editor/timeline-math'
import { useAppStore } from '../store/app'

const toolButton =
  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40'

/** Tự lưu bản chỉnh sửa sau khi người dùng ngừng thao tác một chút. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (!state.folder || !state.edit || state.edit === prev.edit || !prev.edit) return
      if (timer) clearTimeout(timer)
      const { folder, edit } = state
      timer = setTimeout(() => void lumora().saveEdit(folder, edit), 600)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA'
      )
        return
      const s = useEditorStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (e.code === 'Space') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo()
      } else if (
        mod &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault()
        s.redo()
      } else if (!mod && e.key.toLowerCase() === 's') {
        s.splitAtPlayhead()
      } else if (!mod && e.key.toLowerCase() === 'a') {
        s.trimAtPlayhead('left')
      } else if (!mod && e.key.toLowerCase() === 'd') {
        s.trimAtPlayhead('right')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        s.deleteSelection()
      } else if (e.key === 'ArrowLeft') {
        s.setTime(s.time - (e.shiftKey ? 5000 : 1000))
      } else if (e.key === 'ArrowRight') {
        s.setTime(s.time + (e.shiftKey ? 5000 : 1000))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function EditorPage() {
  const { t } = useTranslation()
  const folder = useAppStore((s) => s.editorFolder)
  const setPage = useAppStore((s) => s.setPage)
  const project = useEditorStore((s) => s.project)
  const edit = useEditorStore((s) => s.edit)
  const loadError = useEditorStore((s) => s.loadError)
  const time = useEditorStore((s) => s.time)
  const playing = useEditorStore((s) => s.playing)
  const selection = useEditorStore((s) => s.selection)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  useAutosave()
  useShortcuts()

  useEffect(() => {
    if (folder) void useEditorStore.getState().load(folder)
    return () => useEditorStore.getState().setPlaying(false)
  }, [folder])

  if (!folder) {
    return (
      <div className="p-8">
        <PageHeader title={t('editor.title')} description={t('editor.description')} />
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
          {t('editor.empty')}{' '}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => setPage('projects')}
          >
            {t('nav.projects')}
          </button>
        </div>
      </div>
    )
  }
  if (loadError)
    return (
      <p role="alert" className="p-8 text-danger">
        {t('projects.notFound')}
      </p>
    )
  if (!project || !edit) return <p className="p-8 text-muted">{t('editor.loading')}</p>

  const s = useEditorStore.getState()
  const clip = selectedClip(edit, selection)
  const duration = outputDuration(edit.clips)

  return (
    <div className="flex h-full flex-col" data-testid="editor">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h1 className="truncate font-medium" data-testid="editor-title">
              {project.name}
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={toolButton}
                onClick={() => s.undo()}
                disabled={past.length === 0}
                aria-label={t('editor.undo')}
                title={`${t('editor.undo')} (Ctrl+Z)`}
                data-testid="undo"
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                className={toolButton}
                onClick={() => s.redo()}
                disabled={future.length === 0}
                aria-label={t('editor.redo')}
                title={`${t('editor.redo')} (Ctrl+Y)`}
                data-testid="redo"
              >
                <Redo2 size={16} />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-bg p-6">
            <PreviewCanvas project={project} folder={folder} />
          </div>
          <div className="border-t border-border bg-surface px-4 py-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => s.setPlaying(!playing)}
                data-testid="play"
                aria-label={playing ? t('editor.pause') : t('editor.play')}
                className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg"
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <span className="font-mono text-sm tabular-nums" data-testid="timecode">
                {formatTimecode(time)} / {formatTimecode(duration)}
              </span>
              <div className="mx-2 h-5 w-px bg-border" />
              <button
                type="button"
                className={toolButton}
                onClick={() => s.splitAtPlayhead()}
                data-testid="split"
                title={`${t('editor.split')} (S)`}
              >
                <Scissors size={16} /> {t('editor.split')}
              </button>
              <button
                type="button"
                className={toolButton}
                onClick={() => s.deleteSelection()}
                disabled={!selection || (selection.kind === 'clip' && edit.clips.length < 2)}
                data-testid="delete"
                title={`${t('editor.delete')} (Delete)`}
              >
                <Trash2 size={16} /> {t('editor.delete')}
              </button>
              {clip && (
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  {t('editor.speed')}
                  <select
                    value={clip.clip.speed}
                    data-testid="clip-speed"
                    onChange={(e) => s.setClipSpeed(clip.clip.id, Number(e.target.value))}
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-text"
                  >
                    {SPEEDS.map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="ml-auto text-xs text-muted">{t('editor.shortcuts')}</span>
            </div>
            <Timeline />
          </div>
        </div>
        <aside className="w-80 shrink-0 border-l border-border bg-surface">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
