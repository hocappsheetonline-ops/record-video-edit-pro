import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Download,
  Grid3x3,
  ImageDown,
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
import { AiStatusBadge } from '../components/AiStatusBadge'
import { PageHeader } from '../components/PageHeader'
import { TITLE_BAR_SLOT } from '../components/TitleBar'
import { ExportPanel } from '../editor/ExportPanel'
import { MediaBrowser } from '../editor/MediaBrowser'
import { PreviewCanvas } from '../editor/PreviewCanvas'
import { PropertiesPanel } from '../editor/PropertiesPanel'
import { ContextMenuLayer } from '../editor/ContextMenu'
import { Onboarding, ShortcutsDialog } from '../editor/HelpUi'
import { JobsButton, ToastLayer } from '../editor/JobsUi'
import { useJobs } from '../editor/jobs'
import { useEditorStore } from '../editor/store'
import { Timeline } from '../editor/Timeline'
import { formatTimecode } from '../editor/timeline-math'
import { Splitter } from '../editor/ui'
import { useAppStore } from '../store/app'

/** Kích thước các bảng (px): mặc định, giới hạn và khóa lưu trong localStorage. */
const PANES = {
  library: { key: 'lumora.libraryWidth', size: 360, min: 280, max: 640 },
  props: { key: 'lumora.propsWidth', size: 300, min: 240, max: 560 },
  timeline: { key: 'lumora.timelineHeight', size: 300, min: 200 },
} as const
/** Thanh chia rộng 6px; khung xem trước luôn giữ ít nhất 360px khi cửa sổ còn đủ chỗ. */
const SPLITTER = 6
const PLAYER_MIN = 360

type Panes = { library: number; props: number }
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
        target.tagName === 'TEXTAREA' ||
        // Ô văn bản lời thoại (Delete cắt chữ, không xóa mục trên timeline).
        target.getAttribute('role') === 'textbox'
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

function readSize(pane: { key: string; size: number; min: number }): number {
  try {
    const v = Number(localStorage.getItem(pane.key))
    return Number.isFinite(v) && v >= pane.min ? v : pane.size
  } catch {
    return pane.size
  }
}

function saveSize(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.round(v)))
  } catch {
    // Không lưu được (chế độ riêng tư…) thì chỉ giữ trong phiên này.
  }
}

/** Chỗ còn lại cho một bảng bên sau khi trừ bảng bên kia, hai thanh chia và khung xem trước. */
const sideRoom = (other: number) => window.innerWidth - other - 2 * SPLITTER - PLAYER_MIN
const clampLibrary = (w: number, props: number) =>
  Math.max(PANES.library.min, Math.min(PANES.library.max, sideRoom(props), w))
const clampProps = (w: number, library: number) =>
  Math.max(PANES.props.min, Math.min(PANES.props.max, sideRoom(library), w))
const clampTimeline = (h: number) =>
  Math.max(PANES.timeline.min, Math.min(window.innerHeight * 0.6, h))

/** Cửa sổ hẹp: thư viện nhường chỗ trước, rồi tới bảng thuộc tính. */
function fitPanes(p: Panes): Panes {
  const library = clampLibrary(p.library, p.props)
  const props = clampProps(p.props, library)
  return library === p.library && props === p.props ? p : { library, props }
}

const readPanes = (): Panes =>
  fitPanes({ library: readSize(PANES.library), props: readSize(PANES.props) })
const readTimelineHeight = () => clampTimeline(readSize(PANES.timeline))

/**
 * Chiều rộng hai bảng bên và chiều cao timeline: kéo thanh chia để đổi, nhấp đúp để về
 * mặc định, nhớ cho lần sau. Độ lệch kéo tính từ lúc bắt đầu bấm nên nhớ giá trị lúc đó.
 */
function usePaneSizes() {
  const [panes, setPanes] = useState(readPanes)
  const [timelineHeight, setTimelineHeight] = useState(readTimelineHeight)
  const start = useRef<{ panes: Panes; timeline: number } | null>(null)
  useEffect(() => {
    saveSize(PANES.library.key, panes.library)
    saveSize(PANES.props.key, panes.props)
  }, [panes])
  useEffect(() => saveSize(PANES.timeline.key, timelineHeight), [timelineHeight])
  // Cửa sổ thu nhỏ: kẹp lại để khung xem trước không bị bóp.
  useEffect(() => {
    const fit = () => {
      setPanes(fitPanes)
      setTimelineHeight(clampTimeline)
    }
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const begin = () => (start.current ??= { panes, timeline: timelineHeight })
  const end = () => {
    start.current = null
  }
  return {
    panes,
    timelineHeight,
    library: {
      onDelta: (d: number) => {
        const s = begin().panes
        setPanes({ ...s, library: clampLibrary(s.library + d, s.props) })
      },
      onEnd: end,
      onReset: () => setPanes((p) => fitPanes({ ...p, library: PANES.library.size })),
    },
    props: {
      onDelta: (d: number) => {
        const s = begin().panes
        setPanes({ ...s, props: clampProps(s.props - d, s.library) })
      },
      onEnd: end,
      onReset: () => setPanes((p) => fitPanes({ ...p, props: PANES.props.size })),
    },
    timeline: {
      onDelta: (d: number) => setTimelineHeight(clampTimeline(begin().timeline - d)),
      onEnd: end,
      onReset: () => setTimelineHeight(clampTimeline(PANES.timeline.size)),
    },
  }
}

/** Thanh điều khiển dưới khung xem trước: thời gian, phát/dừng, nhảy, tỉ lệ khung, toàn màn hình. */
/**
 * Chụp khung hình đang xem (như nút "Snapshot" của CapCut): lưu PNG vào thư mục `exports` của dự án.
 * Dùng chính canvas xem trước nên thấy sao chụp vậy (kể cả chữ, nhãn dán, vùng che).
 */
async function saveSnapshot(player: HTMLElement | null, t: (k: string) => string) {
  const canvas = player?.querySelector('canvas')
  const folder = useEditorStore.getState().folder
  const jobs = useJobs.getState()
  if (!canvas || !folder) return
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('snapshot_failed')
    const result = await lumora().saveSnapshot(folder, await blob.arrayBuffer())
    jobs.toast(
      {
        kind: 'success',
        text: t('editor.player.snapshotSaved'),
        action: {
          label: t('editor.export.reveal'),
          run: () => void lumora().revealFile(result.path),
        },
      },
      6000,
    )
  } catch {
    jobs.toast({ kind: 'error', text: t('editor.player.snapshotFailed') })
  }
}

function PlayerBar({
  onFullscreen,
  onSnapshot,
}: {
  onFullscreen: () => void
  onSnapshot: () => void
}) {
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
          data-testid="snapshot"
          aria-label={t('editor.player.snapshot')}
          data-tooltip={t('editor.player.snapshot')}
          onClick={onSnapshot}
        >
          <ImageDown size={15} aria-hidden />
        </button>
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
  const sizes = usePaneSizes()
  const playerRef = useRef<HTMLDivElement>(null)
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
          <AiStatusBadge />
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
        <aside
          data-testid="pane-library"
          className="min-w-0 shrink-0 overflow-hidden border-r border-border bg-surface"
          style={{ width: sizes.panes.library }}
        >
          <MediaBrowser />
        </aside>
        <Splitter
          orientation="vertical"
          label={t('editor.panes.resizeLibrary')}
          testId="pane-resize-library"
          {...sizes.library}
        />
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
          <PlayerBar
            onFullscreen={() => void playerRef.current?.requestFullscreen?.()}
            onSnapshot={() => void saveSnapshot(playerRef.current, t)}
          />
        </section>
        <Splitter
          orientation="vertical"
          label={t('editor.panes.resizeProps')}
          testId="pane-resize-props"
          {...sizes.props}
        />
        <aside
          data-testid="pane-props"
          className="min-w-0 shrink-0 overflow-hidden border-l border-border bg-surface"
          style={{ width: sizes.panes.props }}
        >
          <PropertiesPanel />
        </aside>
      </div>

      <Splitter
        orientation="horizontal"
        label={t('editor.timeline.resize')}
        testId="pane-resize-timeline"
        {...sizes.timeline}
      />
      <div className="shrink-0 bg-surface" style={{ height: sizes.timelineHeight }}>
        <Timeline />
      </div>
      <ExportDialog open={exporting} onClose={closeExport} />
    </div>
  )
}
