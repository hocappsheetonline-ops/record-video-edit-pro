import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Captions,
  Flag,
  Magnet,
  Mic,
  Plus,
  Layers,
  Music2,
  Redo2,
  Palette,
  Rewind,
  Scissors,
  Snowflake,
  Sparkles,
  TrendingUp,
  Trash2,
  Undo2,
  Video,
  ZoomIn,
  ZoomOut,
  Search,
  type LucideIcon,
} from 'lucide-react'
import {
  clipDuration,
  cutPoints,
  clipPositions,
  lookLayers,
  normalizeZooms,
  outputDuration,
  outputToSource,
  sourceDuration,
  type ZoomRegion,
  type TimelineRow,
  thumbAt,
  type Filmstrip,
  type Clip,
} from '@lumora/core'
import { AudioTrack } from './AudioTrack'
import { CaptionTrack } from './CaptionTrack'
import { ClipFilmstrip } from './ClipFilmstrip'
import { EffectTrack } from './EffectTrack'
import { OverlayTrack } from './OverlayTrack'
import { ClipWaveform } from './ClipWaveform'
import { mediaUrl } from '../lib/media'
import { openContextMenu } from './ContextMenu'
import { HistoryButton, useUndoLabels } from './HistoryPanel'
import { runJob } from './jobs'
import { DRAG_TYPE, dropFiles, dropPayload, readPayload } from './library-drag'
import { useEditorStore, type SelItem } from './store'
import { clipMenu, emptyMenu } from './timeline-menus'
import { MarkerFlags, TrackControls } from './TimelineMarkers'
import { formatTimecode, laneCount, tickInterval, zoomOutputIntervals } from './timeline-math'

const HEADER_W = 148
/** Chiều cao dải ảnh thu nhỏ trong clip (px): clip cao 64px − viền 4px − dải sóng 16px. */
const FILM_H = 44
const MAX_ZOOM = 24

type Drag = { id: string; mode: 'move' | 'start' | 'end'; originX: number; origin: ZoomRegion }

const toolButton =
  'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35'

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  testId,
  showLabel,
  pressed,
}: {
  icon: LucideIcon
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  testId?: string
  showLabel?: boolean
  /** Nút bật / tắt: hiện màu nhấn khi đang bật. */
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      className={`${toolButton} ${pressed ? 'text-accent' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      data-tooltip={label}
      data-shortcut={shortcut}
      data-testid={testId}
    >
      <Icon size={16} aria-hidden />
      {showLabel && <span>{label}</span>}
    </button>
  )
}

/** Thanh công cụ timeline (giống CapCut): hoàn tác, tách, cắt trái/phải, xóa, phóng to timeline. */
function TimelineToolbar({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  const { t } = useTranslation()
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const selection = useEditorStore((s) => s.selection)
  const clips = useEditorStore((s) => s.edit?.clips.length ?? 0)
  const snapping = useEditorStore((s) => s.snapping)
  const undoLabels = useUndoLabels()
  const selectedCount = useEditorStore((s) => s.selected.length)
  const s = useEditorStore.getState()
  const canDelete =
    selectedCount > 1 ||
    (!!selection && selection.kind !== 'camera' && !(selection.kind === 'clip' && clips < 2))
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border px-2">
      <ToolButton
        icon={Plus}
        label={t('editor.timeline.add')}
        onClick={() => useEditorStore.getState().requestTab('media')}
        testId="toolbar-add"
      />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton
        icon={Undo2}
        label={undoLabels.undo ? `${t('editor.undo')}: ${undoLabels.undo}` : t('editor.undo')}
        shortcut="Ctrl+Z"
        onClick={() => s.undo()}
        disabled={past.length === 0}
        testId="undo"
      />
      <ToolButton
        icon={Redo2}
        label={undoLabels.redo ? `${t('editor.redo')}: ${undoLabels.redo}` : t('editor.redo')}
        shortcut="Ctrl+Y"
        onClick={() => s.redo()}
        disabled={future.length === 0}
        testId="redo"
      />
      <HistoryButton className={toolButton} />
      <span className="mx-1.5 h-5 w-px bg-border" />
      <ToolButton
        icon={Scissors}
        label={t('editor.split')}
        shortcut="S"
        onClick={() => s.splitAtPlayhead()}
        testId="split"
      />
      <ToolButton
        icon={ArrowLeftToLine}
        label={t('editor.trimLeft')}
        shortcut="A"
        onClick={() => s.trimAtPlayhead('left')}
        testId="trim-left"
      />
      <ToolButton
        icon={ArrowRightToLine}
        label={t('editor.trimRight')}
        shortcut="D"
        onClick={() => s.trimAtPlayhead('right')}
        testId="trim-right"
      />
      <ToolButton
        icon={Snowflake}
        label={t('editor.freeze.add')}
        onClick={() => s.freezeAtPlayhead()}
        testId="freeze"
      />
      <ToolButton
        icon={Trash2}
        label={t('editor.delete')}
        shortcut="Delete"
        onClick={() => s.deleteSelection()}
        disabled={!canDelete}
        testId="delete"
      />
      <span className="mx-1.5 h-5 w-px bg-border" />
      <ToolButton
        icon={Search}
        label={t('editor.zoom.add')}
        onClick={() => s.addZoomAtPlayhead()}
        testId="toolbar-zoom-add"
      />
      <ToolButton
        icon={Flag}
        label={t('editor.markers.add')}
        shortcut="M"
        onClick={() => s.addMarkerAtPlayhead()}
        testId="toolbar-marker"
      />
      <ToolButton
        icon={Magnet}
        label={snapping ? t('editor.menu.snapOff') : t('editor.menu.snapOn')}
        shortcut="N"
        onClick={() => s.setSnapping(!snapping)}
        pressed={snapping}
        testId="toolbar-snap"
      />
      <span className="ml-auto hidden text-[11px] text-muted xl:block">
        {t('editor.shortcuts')}
      </span>
      <div className="ml-3 flex items-center gap-1.5">
        <ToolButton
          icon={Mic}
          label={t('editor.timeline.voiceover')}
          onClick={() => useEditorStore.getState().requestTab('audio', 'voice')}
          testId="toolbar-voiceover"
        />
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolButton
          icon={ZoomOut}
          label={t('editor.timeline.zoomOut')}
          onClick={() => setZoom(Math.max(1, zoom / 1.5))}
          disabled={zoom <= 1}
          testId="timeline-zoom-out"
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          aria-label={t('editor.timeline.zoom')}
          data-testid="timeline-zoom-slider"
          value={Math.log(zoom) / Math.log(MAX_ZOOM)}
          onChange={(e) => setZoom(MAX_ZOOM ** Number(e.target.value))}
          className="h-1 w-24 accent-accent"
        />
        <ToolButton
          icon={ZoomIn}
          label={t('editor.timeline.zoomIn')}
          onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.5))}
          disabled={zoom >= MAX_ZOOM}
          testId="timeline-zoom-in"
        />
      </div>
    </div>
  )
}

/** Rê chuột trên clip video: ảnh thu nhỏ của khung hình tại đó + thời gian (giống CapCut). */
function ClipHoverPreview({
  at,
  duration,
  clips,
  filmstrip,
  folder,
}: {
  at: number
  duration: number
  clips: Clip[]
  filmstrip: Filmstrip
  folder: string
}) {
  const hit = outputToSource(clips, at)
  const thumb = hit ? thumbAt(filmstrip, hit.source) : null
  if (!thumb) return null
  const h = 72
  const w = (filmstrip.thumb.width / filmstrip.thumb.height) * h
  return (
    <div
      data-testid="clip-hover"
      className="pointer-events-none absolute bottom-full z-30 mb-1 -translate-x-1/2 overflow-hidden rounded-md border border-white/70 bg-black shadow-xl"
      style={{ left: `${(at / duration) * 100}%` }}
    >
      <div
        style={{
          width: w,
          height: h,
          backgroundImage: `url("${mediaUrl(folder, thumb.sheet.file)}")`,
          backgroundSize: `${thumb.sheet.columns * w}px ${thumb.sheet.rows * h}px`,
          backgroundPosition: `${-thumb.column * w}px ${-thumb.row * h}px`,
        }}
      />
      <span className="block bg-black/80 px-1 text-center font-mono text-[10px] text-white">
        {formatTimecode(at)}
      </span>
    </div>
  )
}

/** Lỗi khi thả file / nhập video: mã lỗi thường gặp có lời giải thích riêng. */
function dropErrorText(t: (k: string) => string, message: string) {
  if (message.includes('import_no_video')) return t('editor.library.importNoVideo')
  if (message.includes('import_too_long')) return t('editor.library.importTooLong')
  return t('editor.library.importFailed')
}

/** Chiều cao một hàng con (px) của các hàng có thể xếp chồng. */
const LANE = { effects: 28, overlays: 32, audio: 40 }

function TrackHeader({
  icon: Icon,
  label,
  height,
  row,
}: {
  icon: LucideIcon
  label: string
  height: number
  row?: TimelineRow
}) {
  return (
    <div
      className="flex shrink-0 items-start gap-1.5 border-b border-border/60 pl-3 pr-1 pt-1.5 text-[11px] text-muted"
      style={{ height }}
    >
      <Icon size={14} aria-hidden className="mt-0.5 shrink-0" />
      <span className="mt-0.5 truncate">{label}</span>
      {row && <TrackControls row={row} />}
    </div>
  )
}

function Row({
  height,
  children,
  row,
}: {
  height: number
  children: ReactNode
  /** Hàng ẩn / tắt tiếng / khóa: làm mờ để dễ nhận ra. */
  row?: TimelineRow
}) {
  const state = useEditorStore((s) => (row ? s.edit?.tracks[row] : undefined))
  const dim = !!state && (state.hidden || state.muted)
  return (
    <div
      className={`flex items-stretch border-b border-border/60 ${dim ? 'opacity-40' : ''} ${
        state?.locked
          ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.03)_6px_12px)]'
          : ''
      }`}
      style={{ height }}
      data-row={row}
      data-dim={dim || undefined}
      data-locked={state?.locked || undefined}
    >
      {children}
    </div>
  )
}

export function Timeline() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const waveform = useEditorStore((s) => s.waveform)
  const filmstrip = useEditorStore((s) => s.filmstrip)
  const folder = useEditorStore((s) => s.folder)
  const project = useEditorStore((s) => s.project)
  const time = useEditorStore((s) => s.time)
  const playing = useEditorStore((s) => s.playing)
  const selection = useEditorStore((s) => s.selection)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const scrubbing = useRef(false)
  const [viewport, setViewport] = useState(800)
  const [zoom, setZoom] = useState(1)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  )
  const snapLine = useEditorStore((s) => s.snapLine)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [hoverAt, setHoverAt] = useState<number | null>(null)
  const [dropBusy, setDropBusy] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const clipsLocked = useEditorStore((s) => s.edit?.tracks.clips.locked ?? false)
  const hasEdit = edit !== null

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setViewport(el.clientWidth || 800))
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasEdit])

  const duration = edit ? Math.max(1, outputDuration(edit.clips)) : 1
  const width = Math.max(200, viewport - 16) * zoom
  const playheadX = Math.min(1, time / duration) * width

  // Đang phát mà đầu phát ra khỏi vùng nhìn thấy: cuộn theo (giống phần mềm dựng phim).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    if (playheadX < el.scrollLeft || playheadX > el.scrollLeft + el.clientWidth - 24)
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth * 0.1)
  }, [playheadX, playing])

  if (!edit || !project) return null
  const pxPerMs = width / duration
  // Khối trùng giờ xếp thành nhiều hàng con: hàng cao lên cho đủ chỗ (giống CapCut).
  const heights = {
    effects: laneCount(edit.effects) * LANE.effects + 4,
    overlays: laneCount(edit.overlays) * LANE.overlays + 4,
    captions: edit.captions.lines.length > 0 ? 30 : 0,
    zoom: 32,
    clips: 72,
    audio:
      laneCount(edit.audioClips.map((c) => ({ start: c.start, end: c.start + c.duration }))) *
        LANE.audio +
      4,
  }
  const tick = tickInterval(duration, width, 80)
  const ticks = Array.from({ length: Math.floor(duration / tick) + 1 }, (_, i) => i * tick)
  const store = useEditorStore.getState

  const timeAt = (clientX: number) => {
    const rect = contentRef.current!.getBoundingClientRect()
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration))
  }

  const seek = (e: ReactPointerEvent) => {
    store().setPlaying(false)
    store().setTime(timeAt(e.clientX))
  }

  /**
   * Kéo trên chỗ trống: vẽ khung chọn, nhả chuột thì chọn các khối giao với khung
   * (lớp phủ, hiệu ứng, âm thanh; bỏ qua hàng bị khóa). Giữ Ctrl để chọn thêm.
   */
  const startMarquee = (e: ReactPointerEvent) => {
    const content = contentRef.current
    if (!content || e.button !== 0) return
    const rect = content.getBoundingClientRect()
    const x0 = e.clientX - rect.left
    const y0 = e.clientY - rect.top
    const base = e.ctrlKey || e.metaKey ? store().selected : []
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const x1 = ev.clientX - rect.left
      const y1 = ev.clientY - rect.top
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 5) return
      moved = true
      setMarquee({ x0, y0, x1, y1 })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setMarquee(null)
      if (!moved) return
      const left = Math.min(x0, ev.clientX - rect.left) + rect.left
      const right = Math.max(x0, ev.clientX - rect.left) + rect.left
      const top = Math.min(y0, ev.clientY - rect.top) + rect.top
      const bottom = Math.max(y0, ev.clientY - rect.top) + rect.top
      const tracks = store().edit?.tracks
      const hits: SelItem[] = []
      content.querySelectorAll<HTMLElement>('[data-sel-kind]').forEach((el) => {
        const kind = el.dataset.selKind as SelItem['kind']
        const row = kind === 'overlay' ? 'overlays' : kind === 'effect' ? 'effects' : 'audio'
        if (tracks?.[row].locked) return
        const r = el.getBoundingClientRect()
        if (r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom)
          hits.push({ kind, id: el.dataset.selId! })
      })
      const seen = new Set(base.map((x) => `${x.kind}:${x.id}`))
      store().selectMany([...base, ...hits.filter((h) => !seen.has(`${h.kind}:${h.id}`))])
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Bấm chỗ trống trên một hàng: dời đầu phát và bỏ chọn; kéo để chọn bằng khung. */
  const seekAndDeselect = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    seek(e)
    if (!(e.ctrlKey || e.metaKey)) store().select(null)
    startMarquee(e)
  }

  // Phóng to quanh vị trí con trỏ chuột (Ctrl + lăn chuột), giữ điểm dưới chuột đứng yên.
  const zoomAround = (next: number, clientX?: number) => {
    const el = scrollRef.current
    const z = Math.max(1, Math.min(MAX_ZOOM, next))
    if (!el) return setZoom(z)
    const rect = el.getBoundingClientRect()
    const anchor = clientX === undefined ? playheadX - el.scrollLeft : clientX - rect.left
    const at = (el.scrollLeft + anchor) / width
    setZoom(z)
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, at * Math.max(200, viewport - 16) * z - anchor)
    })
  }

  const onZoomDown = (e: ReactPointerEvent, zoomRegion: ZoomRegion, mode: Drag['mode']) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    store().select({ kind: 'zoom', id: zoomRegion.id })
    setDrag({ id: zoomRegion.id, mode, originX: e.clientX, origin: zoomRegion })
  }

  const onZoomMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const deltaOut = (e.clientX - drag.originX) / pxPerMs
    // Đổi khoảng kéo trên timeline xuất sang thời gian nguồn theo tốc độ clip tại đó.
    const speed = outputToSource(edit.clips, timeAt(e.clientX))?.position.clip.speed ?? 1
    const delta = deltaOut * speed
    const total = sourceDuration(project.segments)
    const o = drag.origin
    let start = o.start
    let end = o.end
    if (drag.mode === 'move') {
      const shift = Math.min(Math.max(delta, -o.start), total - o.end)
      start += shift
      end += shift
    } else if (drag.mode === 'start') start = Math.min(o.end - 300, Math.max(0, o.start + delta))
    else end = Math.max(o.start + 300, Math.min(total, o.end + delta))
    store().change(
      (current) => ({
        ...current,
        zooms: current.zooms.map((z) => (z.id === drag.id ? { ...z, start, end } : z)),
      }),
      `zoom-drag-${drag.id}`,
    )
  }

  const onZoomUp = () => {
    if (!drag) return
    setDrag(null)
    store().change(
      (current) => ({
        ...current,
        zooms: normalizeZooms(current.zooms, sourceDuration(project.segments)),
      }),
      `zoom-drag-${drag.id}`,
    )
  }

  return (
    <div className="flex h-full select-none flex-col text-xs" data-testid="timeline">
      <TimelineToolbar zoom={zoom} setZoom={(z) => zoomAround(z)} />
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="shrink-0 border-r border-border bg-surface" style={{ width: HEADER_W }}>
          <div className="h-7 border-b border-border" />
          <TrackHeader
            icon={Sparkles}
            label={t('editor.tracks.effects')}
            height={heights.effects}
            row="effects"
          />
          <TrackHeader
            icon={Layers}
            label={t('editor.tracks.stickers')}
            height={heights.overlays}
            row="overlays"
          />
          {heights.captions > 0 && (
            <TrackHeader
              icon={Captions}
              label={t('editor.tracks.captions')}
              height={heights.captions}
              row="captions"
            />
          )}
          <TrackHeader icon={Search} label={t('editor.tracks.zooms')} height={heights.zoom} />
          <TrackHeader
            icon={Video}
            label={t('editor.tracks.clips')}
            height={heights.clips}
            row="clips"
          />
          <TrackHeader
            icon={Music2}
            label={t('editor.tracks.audio')}
            height={heights.audio}
            row="audio"
          />
        </div>
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          data-testid="timeline-scroll"
          onWheel={(e) => {
            if (!e.ctrlKey) return
            e.preventDefault()
            zoomAround(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX)
          }}
        >
          <div
            ref={contentRef}
            className="relative mx-2"
            style={{ width }}
            onContextMenu={(e) => openContextMenu(e, emptyMenu(t))}
            onDragOver={(e) => {
              const types = Array.from(e.dataTransfer.types)
              if (!types.includes(DRAG_TYPE) && !types.includes('Files')) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDropAt(timeAt(e.clientX))
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDropAt(null)
              const at = timeAt(e.clientX)
              const payload = readPayload(e)
              const files = Array.from(e.dataTransfer.files)
              const task = payload
                ? dropPayload(payload, at)
                : files.length > 0
                  ? runJob(t('editor.jobs.importFiles'), () => dropFiles(files, at))
                  : null
              if (!task) return
              setDropBusy(true)
              void Promise.resolve(task)
                .catch((err) => setDropError(String(err?.message ?? err)))
                .finally(() => setDropBusy(false))
            }}
          >
            <div
              className="relative h-7 cursor-pointer border-b border-border text-[10px] text-muted"
              onPointerDown={(e) => {
                scrubbing.current = true
                ;(e.target as Element).setPointerCapture(e.pointerId)
                seek(e)
              }}
              onPointerMove={(e) => scrubbing.current && seek(e)}
              onPointerUp={() => (scrubbing.current = false)}
              data-testid="timeline-ruler"
            >
              <MarkerFlags duration={duration} pxPerMs={pxPerMs} />
              {ticks.map((ms) => (
                <span
                  key={ms}
                  className="absolute bottom-0 flex h-full flex-col justify-between border-l border-border/80 pl-1 tabular-nums"
                  style={{ left: `${(ms / duration) * 100}%` }}
                >
                  <span className="pt-1">
                    {tick < 1000 ? formatTimecode(ms) : formatTimecode(ms).replace(/\.\d$/, '')}
                  </span>
                </span>
              ))}
            </div>

            <Row height={heights.effects} row="effects">
              <EffectTrack duration={duration} pxPerMs={pxPerMs} onSeek={seekAndDeselect} />
            </Row>
            <Row height={heights.overlays} row="overlays">
              <OverlayTrack duration={duration} pxPerMs={pxPerMs} onSeek={seekAndDeselect} />
            </Row>
            {heights.captions > 0 && (
              <Row height={heights.captions} row="captions">
                <CaptionTrack duration={duration} pxPerMs={pxPerMs} onSeek={seekAndDeselect} />
              </Row>
            )}
            <Row height={heights.zoom}>
              <div
                className="relative h-full flex-1"
                onPointerDown={seekAndDeselect}
                onPointerMove={onZoomMove}
                onPointerUp={onZoomUp}
              >
                {edit.zooms.flatMap((zoomRegion) =>
                  zoomOutputIntervals(zoomRegion, edit.clips).map((interval, k) => {
                    const selected = selection?.kind === 'zoom' && selection.id === zoomRegion.id
                    return (
                      <div
                        key={`${zoomRegion.id}-${k}`}
                        data-testid="timeline-zoom"
                        onPointerDown={(e) => onZoomDown(e, zoomRegion, 'move')}
                        className={`absolute top-0.5 bottom-0.5 flex cursor-grab items-center justify-center rounded-md border text-[11px] ${
                          selected
                            ? 'border-amber-200 bg-amber-400/55 text-white'
                            : 'border-amber-400/40 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30'
                        }`}
                        style={{
                          left: `${(interval.start / duration) * 100}%`,
                          width: `${((interval.end - interval.start) / duration) * 100}%`,
                        }}
                      >
                        <span
                          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md bg-amber-300/60"
                          onPointerDown={(e) => onZoomDown(e, zoomRegion, 'start')}
                        />
                        {zoomRegion.scale.toFixed(1)}×
                        <span
                          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md bg-amber-300/60"
                          onPointerDown={(e) => onZoomDown(e, zoomRegion, 'end')}
                        />
                      </div>
                    )
                  }),
                )}
              </div>
            </Row>
            <Row height={heights.clips} row="clips">
              <div
                className="relative flex-1 py-1"
                onPointerDown={seekAndDeselect}
                onPointerLeave={() => setHoverAt(null)}
              >
                {hoverAt !== null && filmstrip && folder && (
                  <ClipHoverPreview
                    at={hoverAt}
                    duration={duration}
                    clips={edit.clips}
                    filmstrip={filmstrip}
                    folder={folder}
                  />
                )}
                {clipPositions(edit.clips).map(({ clip, outputStart }, i) => {
                  const selected = selection?.kind === 'clip' && selection.id === clip.id
                  // Dải phim hiện đúng màu của bộ lọc (của clip, hoặc của cả video).
                  const tint = lookLayers(clip.look ?? edit.look)?.css
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      data-testid="timeline-clip"
                      data-selected={selected}
                      onPointerMove={(e) => setHoverAt(timeAt(e.clientX))}
                      data-freeze={clip.freeze ? true : undefined}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        e.stopPropagation()
                        if (!clipsLocked) store().select({ kind: 'clip', id: clip.id })
                        seek(e)
                      }}
                      onContextMenu={(e) =>
                        clipsLocked
                          ? openContextMenu(e, emptyMenu(t))
                          : openContextMenu(e, clipMenu(t, clip.id))
                      }
                      className={`absolute top-1 flex h-16 flex-col overflow-hidden rounded-md border-2 bg-surface-2 text-left ${
                        selected ? 'border-white' : 'border-transparent hover:border-white/40'
                      }`}
                      style={{
                        left: `${(outputStart / duration) * 100}%`,
                        width: `calc(${(clipDuration(clip) / duration) * 100}% - 2px)`,
                      }}
                    >
                      {/* Kiểu CapCut: dải ảnh thu nhỏ ở trên, dạng sóng âm thanh ở dưới. */}
                      <div
                        className={`relative min-h-0 flex-1 ${clip.freeze ? 'bg-sky-500/25' : 'bg-accent/25'}`}
                      >
                        {filmstrip && folder && (
                          <div className="absolute inset-0" style={{ filter: tint ?? 'none' }}>
                            <ClipFilmstrip
                              clip={clip}
                              filmstrip={filmstrip}
                              folder={folder}
                              height={FILM_H}
                            />
                          </div>
                        )}
                        <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 text-[11px] font-medium text-white">
                          {i + 1}
                          {clip.speed !== 1 &&
                            !clip.freeze &&
                            !clip.speedCurve &&
                            ` · ${clip.speed}×`}
                          {clip.speedCurve && (
                            <TrendingUp size={11} aria-hidden data-testid="clip-curve-badge" />
                          )}
                          {clip.reversed && (
                            <Rewind size={11} aria-hidden data-testid="clip-reverse-badge" />
                          )}
                          {clip.freeze && (
                            <Snowflake size={11} aria-hidden data-testid="clip-freeze-badge" />
                          )}
                          {clip.look && (
                            <Palette size={11} aria-hidden data-testid="clip-look-badge" />
                          )}
                        </span>
                      </div>
                      {/* Dải sóng âm kiểu CapCut: nền tối, sóng màu xanh nhạt tô liền. */}
                      <div
                        className="relative h-4 shrink-0 bg-[#0d1117] text-sky-300/90"
                        data-testid="clip-wave-band"
                      >
                        {waveform && !clip.freeze && (
                          <ClipWaveform clip={clip} waveform={waveform} />
                        )}
                      </div>
                    </button>
                  )
                })}
                {/* Nút ◆ ở mỗi chỗ nối giữa hai clip: chọn hiệu ứng chuyển tiếp. */}
                {cutPoints(edit.clips).map((cut) => {
                  const active = edit.transitions.some((x) => x.afterClip === cut.afterClip)
                  const selected =
                    selection?.kind === 'transition' && selection.id === cut.afterClip
                  return (
                    <button
                      key={cut.afterClip}
                      type="button"
                      data-testid="transition-marker"
                      data-active={active}
                      aria-label={t('editor.transition.marker')}
                      data-tooltip={t('editor.transition.marker')}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        store().select({ kind: 'transition', id: cut.afterClip })
                      }}
                      className={`absolute top-1/2 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-sm border-2 ${
                        active ? 'border-white bg-accent' : 'border-white/70 bg-surface'
                      } ${selected ? 'ring-2 ring-white' : ''}`}
                      style={{ left: `${(cut.at / duration) * 100}%` }}
                    />
                  )
                })}
              </div>
            </Row>
            <Row height={heights.audio} row="audio">
              <AudioTrack duration={duration} pxPerMs={pxPerMs} onSeek={seekAndDeselect} />
            </Row>

            {dropAt !== null && (
              <div
                data-testid="drop-line"
                className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-accent"
                style={{ left: `${(dropAt / duration) * 100}%` }}
              />
            )}
            {(dropBusy || dropError) && (
              <div
                data-testid={dropBusy ? 'drop-busy' : 'drop-error'}
                role={dropError ? 'alert' : undefined}
                onClick={() => setDropError(null)}
                className={`absolute left-2 top-8 z-30 rounded-md px-2 py-1 text-[11px] shadow ${
                  dropBusy ? 'bg-surface-2 text-text' : 'cursor-pointer bg-danger/90 text-white'
                }`}
              >
                {dropBusy ? t('editor.library.importingVideo') : dropErrorText(t, dropError!)}
              </div>
            )}
            {snapLine !== null && (
              <div
                data-testid="snap-line"
                className="pointer-events-none absolute inset-y-0 z-20 w-px bg-accent"
                style={{ left: `${(snapLine / duration) * 100}%` }}
              />
            )}
            {marquee && (
              <div
                data-testid="marquee"
                className="pointer-events-none absolute z-30 rounded-sm border border-accent bg-accent/15"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
            <div
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white"
              data-testid="playhead"
              style={{ left: playheadX }}
            >
              <span className="absolute -left-[5px] top-0 h-3 w-[11px] rounded-b-sm bg-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
