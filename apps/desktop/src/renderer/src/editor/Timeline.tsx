import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clipDuration,
  clipPositions,
  normalizeZooms,
  outputDuration,
  outputToSource,
  sourceDuration,
  type ZoomRegion,
} from '@lumora/core'
import { ClipWaveform } from './ClipWaveform'
import { useEditorStore } from './store'
import { formatTimecode, tickInterval, zoomOutputIntervals } from './timeline-math'

const LABEL_W = 72

type Drag = { id: string; mode: 'move' | 'start' | 'end'; originX: number; origin: ZoomRegion }

export function Timeline() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const waveform = useEditorStore((s) => s.waveform)
  const project = useEditorStore((s) => s.project)
  const time = useEditorStore((s) => s.time)
  const selection = useEditorStore((s) => s.selection)
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const scrubbing = useRef(false)
  const [width, setWidth] = useState(800)
  const hasEdit = edit !== null

  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth || 800))
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasEdit])

  if (!edit || !project) return null
  const duration = Math.max(1, outputDuration(edit.clips))
  const pxPerMs = width / duration
  const tick = tickInterval(duration, width)
  const ticks = Array.from({ length: Math.floor(duration / tick) + 1 }, (_, i) => i * tick)
  const store = useEditorStore.getState

  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    return ((clientX - rect.left) / rect.width) * duration
  }

  const seek = (e: ReactPointerEvent) => {
    store().setPlaying(false)
    store().setTime(timeAt(e.clientX))
  }

  const onZoomDown = (e: ReactPointerEvent, zoom: ZoomRegion, mode: Drag['mode']) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    store().select({ kind: 'zoom', id: zoom.id })
    setDrag({ id: zoom.id, mode, originX: e.clientX, origin: zoom })
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
    <div className="select-none text-xs" data-testid="timeline">
      <div className="flex">
        <div style={{ width: LABEL_W }} />
        <div
          className="relative h-6 flex-1 cursor-pointer border-b border-border text-muted"
          onPointerDown={(e) => {
            scrubbing.current = true
            ;(e.target as Element).setPointerCapture(e.pointerId)
            seek(e)
          }}
          onPointerMove={(e) => scrubbing.current && seek(e)}
          onPointerUp={() => (scrubbing.current = false)}
          data-testid="timeline-ruler"
        >
          {ticks.map((ms) => (
            <span
              key={ms}
              className="absolute top-1 -translate-x-1/2 tabular-nums"
              style={{ left: `${(ms / duration) * 100}%` }}
            >
              {tick < 1000 ? formatTimecode(ms) : formatTimecode(ms).replace(/\.\d$/, '')}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-1 flex flex-col gap-1.5">
        <div className="flex items-center">
          <div style={{ width: LABEL_W }} className="text-muted">
            {t('editor.tracks.clips')}
          </div>
          <div ref={trackRef} className="relative h-12 flex-1" onPointerDown={seek}>
            {clipPositions(edit.clips).map(({ clip, outputStart }, i) => {
              const selected = selection?.kind === 'clip' && selection.id === clip.id
              return (
                <button
                  key={clip.id}
                  type="button"
                  data-testid="timeline-clip"
                  data-selected={selected}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    store().select({ kind: 'clip', id: clip.id })
                    seek(e)
                  }}
                  className={`absolute top-0 h-full overflow-hidden rounded-md border px-2 text-left ${
                    selected
                      ? 'border-accent bg-accent/40'
                      : 'border-violet-500/40 bg-violet-500/20 hover:bg-violet-500/30'
                  }`}
                  style={{
                    left: `${(outputStart / duration) * 100}%`,
                    width: `calc(${(clipDuration(clip) / duration) * 100}% - 2px)`,
                  }}
                >
                  {waveform && <ClipWaveform clip={clip} waveform={waveform} />}
                  <span className="relative font-medium">{i + 1}</span>
                  {clip.speed !== 1 && (
                    <span className="relative ml-1 rounded bg-black/40 px-1">{clip.speed}×</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center">
          <div style={{ width: LABEL_W }} className="text-muted">
            {t('editor.tracks.zooms')}
          </div>
          <div
            className="relative h-8 flex-1"
            onPointerDown={seek}
            onPointerMove={onZoomMove}
            onPointerUp={onZoomUp}
          >
            {edit.zooms.flatMap((zoom) =>
              zoomOutputIntervals(zoom, edit.clips).map((interval, k) => {
                const selected = selection?.kind === 'zoom' && selection.id === zoom.id
                return (
                  <div
                    key={`${zoom.id}-${k}`}
                    data-testid="timeline-zoom"
                    onPointerDown={(e) => onZoomDown(e, zoom, 'move')}
                    className={`absolute top-0 flex h-full cursor-grab items-center justify-center rounded-md border text-[11px] ${
                      selected
                        ? 'border-amber-300 bg-amber-400/50'
                        : 'border-amber-400/40 bg-amber-400/20 hover:bg-amber-400/30'
                    }`}
                    style={{
                      left: `${(interval.start / duration) * 100}%`,
                      width: `${((interval.end - interval.start) / duration) * 100}%`,
                    }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md bg-amber-300/60"
                      onPointerDown={(e) => onZoomDown(e, zoom, 'start')}
                    />
                    {zoom.scale.toFixed(1)}×
                    <span
                      className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md bg-amber-300/60"
                      onPointerDown={(e) => onZoomDown(e, zoom, 'end')}
                    />
                  </div>
                )
              }),
            )}
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500"
          data-testid="playhead"
          style={{
            left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${Math.min(1, time / duration)})`,
          }}
        />
      </div>
    </div>
  )
}
