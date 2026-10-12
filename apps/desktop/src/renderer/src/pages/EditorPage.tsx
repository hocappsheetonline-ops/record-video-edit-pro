import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Download,
  Grid3x3,
  Keyboard,
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
import { TITLE_BAR_SLOT } from '../components/TitleBar'
import { ExportPanel } from '../editor/ExportPanel'
import { MediaBrowser } from '../editor/MediaBrowser'
import { PreviewCanvas } from '../editor/PreviewCanvas'
import { PropertiesPanel } from '../editor/PropertiesPanel'
import { ContextMenuLayer } from '../editor/ContextMenu'
import { Onboarding, ShortcutsDialog } from '../editor/HelpUi'
import { JobsButton, ToastLayer } from '../editor/JobsUi'
import { useEditorStore } from '../editor/store'
import { Timeline } from '../editor/Timeline'
import { formatTimecode } from '../editor/timeline-math'
import { useAppStore } from '../store/app'

const TIMELINE_KEY = 'lumora.timelineHeight'
const iconButton =
  'flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-text/8 hover:text-text disabled:opacity-40'

/** Tự lưu bản chỉnh sửa sau khi người dùng ngừng thao tác một chút; đồng thời học thói quen. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (!state.folder || !state.edit || state.edit === prev.edit || !prev.edit) return
      if (timer) clearTimeout(timer)
      const { folder, edit } = state
      timer = setTimeout(() => {
        void lumora().saveEdit(folder, edit)
        // Đạo diễn AI nhớ lựa chọn của người dùng (mẫu phụ đề, bộ lọc, khung hình…) cho lần sau.
        useEditorStore.getState().learnFromCurrentEdit()
      }, 600)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])
}

/** Trợ lý / Đạo diễn AI yêu cầu mở hộp thoại xuất (`exportRequest` tăng mỗi lần). */
function useExportRequest(open: () => void) {
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        if (state.exportRequest > 0 && state.exportRequest !== prev.exportRequest) open()
      }),
    [open],
  )
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
  const guides = useEditorStore((s) => s.guides)
  const zoom = useEditorStore((s) => s.previewZoom)
  const lowPreview = useEditorStore((s) => s.lowPreview)
  const time = useEditorStore((s) => s.time)
  const playing = useEditorStore((s) => s.playing)
  const edit = useEditorStore((s) => s.edit)
  if (!edit) return null
  const s = useEditorStore.getState()
  const duration = outputDuration(edit.clips)
  const frame = 1000 / edit.export.fps
  return (
    <div
      data-testid="player-bar"
      className="glass flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-1"
    >
      <span className="shrink-0 font-mono text-xs tabular-nums" data-testid="timecode">
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
          className="mx-1 flex size-9 items-center justify-center rounded-full bg-text text-bg shadow-sm transition-transform hover:scale-105 active:scale-95"
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
      <div className="ml-auto flex items-center justify-end gap-1">
        {lowPreview && (
          <span
            data-testid="preview-low"
            data-tooltip={t('editor.player.lowHint')}
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
          >
            {t('editor.player.low')}
          </span>
        )}
        <select
          value={String(zoom)}
          aria-label={t('editor.player.zoom')}
          data-tooltip={t('editor.player.zoom')}
          data-testid="preview-zoom"
          onChange={(e) =>
            s.setPreviewZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))
          }
          className="rounded-md border border-border bg-surface-2 py-1 pl-2 text-xs"
        >
          <option value="fit">{t('editor.player.fit')}</option>
          {[25, 50, 75, 100, 150, 200].map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${iconButton} ${guides !== 'none' ? 'text-accent' : ''}`}
          data-testid="guides-toggle"
          data-mode={guides}
          aria-label={t(`editor.player.guides.${guides}`)}
          data-tooltip={t(`editor.player.guides.${guides}`)}
          onClick={() =>
            s.setGuides(guides === 'none' ? 'thirds' : guides === 'thirds' ? 'safe' : 'none')
          }
        >
          <Grid3x3 size={15} aria-hidden />
        </button>
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
          className="rounded-md border border-border bg-surface-2 py-1 pl-2 text-xs"
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

/**
 * Tên dự án, nút Việc đang làm, phím tắt và Xuất nằm trên thanh tiêu đề cửa sổ (như CapCut).
 * Không có thanh tiêu đề (khi test từng trang) thì hiện thành một thanh riêng phía trên.
 */
function InTitleBar({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(() =>
    document.getElementById(TITLE_BAR_SLOT),
  )
  useEffect(() => {
    // Thanh tiêu đề gắn vào DOM cùng lượt với trang: tìm lại sau khi mọi thứ đã gắn.
    const found = document.getElementById(TITLE_BAR_SLOT)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chỉ chạy một lần sau khi gắn
    if (found) setSlot(found)
  }, [])
  if (slot) return createPortal(children, slot)
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      {children}
    </header>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        data-testid="export-dialog"
        className="glass-strong flex max-h-full w-[440px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const previewZoom = useEditorStore((s) => s.previewZoom)
  // Phím ? mở bảng phím tắt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key === '?' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT')
        setShortcutsOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [timelineHeight, setTimelineHeight] = useState(readHeight)
  const playerRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<{ y: number; h: number } | null>(null)
  const closeExport = useCallback(() => setExporting(false), [])
  const openExport = useCallback(() => {
    useEditorStore.getState().setPlaying(false)
    setExporting(true)
  }, [])
  useAutosave()
  useShortcuts()
  useExportRequest(openExport)

  useEffect(() => {
    if (folder) void useEditorStore.getState().load(folder)
    return () => {
      useEditorStore.getState().setPlaying(false)
      // Rời trình chỉnh sửa bình thường: gỡ khóa (không phải tắt đột ngột).
      if (folder)
        void lumora()
          .unlockProject(folder)
          .catch(() => undefined)
    }
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
      <ToastLayer />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Onboarding />
      <InTitleBar>
        <button
          type="button"
          className="app-no-drag flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-text/8 hover:text-text"
          onClick={() => setPage('projects')}
          data-testid="editor-back"
        >
          <ChevronLeft size={15} aria-hidden />
          {t('nav.projects')}
        </button>
        <h1
          className="min-w-0 flex-1 truncate text-center text-[13px] font-medium"
          data-testid="editor-title"
        >
          {project.name}
        </h1>
        <span className="hidden text-[11px] text-muted lg:block" data-testid="autosave">
          {t('editor.autosave')}
        </span>
        <span className="app-no-drag flex items-center gap-1">
          <JobsButton />
          <button
            type="button"
            data-testid="shortcuts-open"
            aria-label={t('editor.help.shortcuts')}
            data-tooltip={t('editor.help.shortcuts')}
            data-shortcut="?"
            onClick={() => setShortcutsOpen(true)}
            className={iconButton}
          >
            <Keyboard size={16} aria-hidden />
          </button>
          <button
            type="button"
            data-testid="export-open"
            onClick={openExport}
            className="mr-2 flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1 text-[13px] font-semibold text-accent-fg shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
          >
            <Download size={15} aria-hidden />
            {t('editor.export.open')}
          </button>
        </span>
      </InTitleBar>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[330px] shrink-0 border-r border-border bg-surface xl:w-[420px]">
          <MediaBrowser />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col" aria-label={t('editor.player.title')}>
          <div className="flex h-9 shrink-0 items-center border-b border-border bg-surface px-3 text-xs font-medium text-muted">
            {t('editor.player.title')}
          </div>
          <div
            ref={playerRef}
            data-testid="player-area"
            className={`relative flex min-h-0 flex-1 bg-[#050507] p-4 ${
              previewZoom === 'fit'
                ? 'items-center justify-center'
                : 'items-[safe_center] justify-[safe_center] overflow-auto'
            }`}
          >
            <PreviewCanvas project={project} folder={folder} />
          </div>
          <PlayerBar onFullscreen={() => void playerRef.current?.requestFullscreen?.()} />
        </section>
        <aside className="w-[280px] shrink-0 border-l border-border bg-surface xl:w-[320px]">
          <PropertiesPanel />
        </aside>
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('editor.timeline.resize')}
        className="h-1.5 shrink-0 cursor-row-resize border-t border-border bg-surface transition-colors hover:bg-accent/40"
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
