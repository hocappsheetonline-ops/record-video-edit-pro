import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Download,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  X,
} from 'lucide-react'
import { ASPECTS, outputDuration, type Aspect } from '@lumora/core'
import { lumora } from '../api'
import { PageHeader } from '../components/PageHeader'
import { ExportPanel } from '../editor/ExportPanel'
import { MediaBrowser } from '../editor/MediaBrowser'
import { PreviewCanvas } from '../editor/PreviewCanvas'
import { PropertiesPanel } from '../editor/PropertiesPanel'
import { ContextMenuLayer } from '../editor/ContextMenu'
import { useEditorStore } from '../editor/store'
import { Timeline } from '../editor/Timeline'
import { formatTimecode } from '../editor/timeline-math'
import { useAppStore } from '../store/app'

const TIMELINE_KEY = 'lumora.timelineHeight'
const iconButton =
  'flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40'

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

/** Hộp thoại xuất video đang mở: tạm tắt phím tắt của trình chỉnh sửa. */
let modalOpen = false

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        modalOpen ||
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
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault()
        s.redo()
      } else if (mod && e.key.toLowerCase() === 'c') {
        if (s.copySelection()) e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        s.cutSelection()
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        s.paste()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        s.duplicateSelection()
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.selectAll()
      } else if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        s.jumpMarker(1)
      } else if (!mod && e.shiftKey && e.key.toLowerCase() === 'm') {
        s.jumpMarker(-1)
      } else if (!mod && e.key.toLowerCase() === 'm') {
        s.addMarkerAtPlayhead()
      } else if (!mod && e.key.toLowerCase() === 'n') {
        s.setSnapping(!s.snapping)
      } else if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        s.rippleDeleteSelection()
      } else if (!mod && e.key.toLowerCase() === 's') {
        s.splitAtPlayhead()
      } else if (!mod && e.key.toLowerCase() === 'a') {
        s.trimAtPlayhead('left')
      } else if (!mod && e.key.toLowerCase() === 'd') {
        s.trimAtPlayhead('right')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        s.deleteSelection()
      } else if (e.key === 'Escape') {
        s.select(null)
      } else if (e.key === 'Home') {
        s.setTime(0)
      } else if (e.key === 'End' && s.edit) {
        s.setTime(outputDuration(s.edit.clips))
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

function readHeight(): number {
  try {
    const v = Number(localStorage.getItem(TIMELINE_KEY))
    return Number.isFinite(v) && v >= 200 ? v : 300
  } catch {
    return 300
  }
}

/** Thanh điều khiển dưới khung xem trước: thời gian, phát/dừng, nhảy, tỉ lệ khung, toàn màn hình. */
function PlayerBar({ onFullscreen }: { onFullscreen: () => void }) {
  const { t } = useTranslation()
  const time = useEditorStore((s) => s.time)
  const playing = useEditorStore((s) => s.playing)
  const edit = useEditorStore((s) => s.edit)
  if (!edit) return null
  const s = useEditorStore.getState()
  const duration = outputDuration(edit.clips)
  const frame = 1000 / edit.export.fps
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t border-border bg-surface px-3">
      <span className="w-40 font-mono text-xs tabular-nums" data-testid="timecode">
        <span className="text-text">{formatTimecode(time)}</span>
        <span className="text-muted"> / {formatTimecode(duration)}</span>
      </span>
      <div className="flex flex-1 items-center justify-center gap-1">
        <button
          type="button"
          className={iconButton}
          aria-label={t('editor.player.start')}
          data-tooltip={t('editor.player.start')}
          data-shortcut="Home"
          onClick={() => s.setTime(0)}
        >
          <SkipBack size={16} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label={t('editor.player.prevFrame')}
          data-tooltip={t('editor.player.prevFrame')}
          data-shortcut="←"
          onClick={() => {
            s.setPlaying(false)
            s.setTime(time - frame)
          }}
        >
          <StepBack size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => s.setPlaying(!playing)}
          data-testid="play"
          aria-label={playing ? t('editor.pause') : t('editor.play')}
          data-tooltip={playing ? t('editor.pause') : t('editor.play')}
          data-shortcut="Space"
          className="mx-1 flex size-9 items-center justify-center rounded-full bg-text text-bg hover:scale-105"
        >
          {playing ? (
            <Pause size={17} aria-hidden />
          ) : (
            <Play size={17} className="ml-0.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label={t('editor.player.nextFrame')}
          data-tooltip={t('editor.player.nextFrame')}
          data-shortcut="→"
          onClick={() => {
            s.setPlaying(false)
            s.setTime(time + frame)
          }}
        >
          <StepForward size={16} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label={t('editor.player.end')}
          data-tooltip={t('editor.player.end')}
          data-shortcut="End"
          onClick={() => s.setTime(duration)}
        >
          <SkipForward size={16} aria-hidden />
        </button>
      </div>
      <div className="flex w-40 items-center justify-end gap-1">
        <select
          value={edit.frame.aspect}
          aria-label={t('editor.frame.aspect')}
          data-testid="player-aspect"
          onChange={(e) =>
            s.change((x) => ({
              ...x,
              frame: {
                ...x.frame,
                aspect: e.target.value as Aspect,
                fill: e.target.value === '9:16',
              },
            }))
          }
          className="rounded-md border border-border bg-surface-2 px-1.5 py-1 text-xs"
        >
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a === 'source' ? t('editor.frame.source') : a}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={iconButton}
          aria-label={t('editor.player.fullscreen')}
          data-tooltip={t('editor.player.fullscreen')}
          onClick={onFullscreen}
        >
          <Maximize2 size={15} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** Hộp thoại xuất video. Luôn được giữ trong trang (chỉ ẩn đi) để đóng lại vẫn không mất tiến độ. */
function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    modalOpen = true
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      modalOpen = false
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return (
    <div
      hidden={!open}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        data-testid="export-dialog"
        className="flex max-h-full w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 id="export-title" className="text-sm font-semibold">
            {t('editor.export.title')}
          </h2>
          <button
            type="button"
            className={iconButton}
            aria-label={t('editor.export.close')}
            data-testid="export-close"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="overflow-y-auto p-4">
          <ExportPanel />
        </div>
      </div>
    </div>
  )
}

export function EditorPage() {
  const { t } = useTranslation()
  const folder = useAppStore((s) => s.editorFolder)
  const setPage = useAppStore((s) => s.setPage)
  const project = useEditorStore((s) => s.project)
  const edit = useEditorStore((s) => s.edit)
  const loadError = useEditorStore((s) => s.loadError)
  const [exporting, setExporting] = useState(false)
  const [timelineHeight, setTimelineHeight] = useState(readHeight)
  const playerRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<{ y: number; h: number } | null>(null)
  const closeExport = useCallback(() => setExporting(false), [])
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

  const saveHeight = (h: number) => {
    try {
      localStorage.setItem(TIMELINE_KEY, String(Math.round(h)))
    } catch {
      // Không lưu được (chế độ riêng tư…) thì chỉ giữ trong phiên này.
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg" data-testid="editor">
      <ContextMenuLayer />
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
          onClick={() => setPage('projects')}
          data-testid="editor-back"
        >
          <ChevronLeft size={16} aria-hidden />
          {t('nav.projects')}
        </button>
        <span className="h-5 w-px bg-border" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium" data-testid="editor-title">
          {project.name}
        </h1>
        <span className="hidden text-xs text-muted md:block" data-testid="autosave">
          {t('editor.autosave')}
        </span>
        <button
          type="button"
          data-testid="export-open"
          onClick={() => {
            useEditorStore.getState().setPlaying(false)
            setExporting(true)
          }}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110"
        >
          <Download size={16} aria-hidden />
          {t('editor.export.open')}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[360px] shrink-0 border-r border-border bg-surface">
          <MediaBrowser />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col" aria-label={t('editor.player.title')}>
          <div
            ref={playerRef}
            className="relative flex min-h-0 flex-1 items-center justify-center bg-[#050507] p-4"
          >
            <PreviewCanvas project={project} folder={folder} />
          </div>
          <PlayerBar onFullscreen={() => void playerRef.current?.requestFullscreen?.()} />
        </section>
        <aside className="w-[320px] shrink-0 border-l border-border bg-surface">
          <PropertiesPanel />
        </aside>
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('editor.timeline.resize')}
        className="h-1.5 shrink-0 cursor-row-resize border-t border-border bg-surface hover:bg-accent/40"
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture(e.pointerId)
          resizing.current = { y: e.clientY, h: timelineHeight }
        }}
        onPointerMove={(e) => {
          if (!resizing.current) return
          const h = resizing.current.h - (e.clientY - resizing.current.y)
          setTimelineHeight(Math.max(200, Math.min(window.innerHeight * 0.6, h)))
        }}
        onPointerUp={() => {
          resizing.current = null
          saveHeight(timelineHeight)
        }}
      />
      <div className="shrink-0 bg-surface" style={{ height: timelineHeight }}>
        <Timeline />
      </div>
      <ExportDialog open={exporting} onClose={closeExport} />
    </div>
  )
}
