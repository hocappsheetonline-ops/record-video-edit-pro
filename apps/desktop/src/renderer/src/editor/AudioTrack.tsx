import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Mic, Music2, Sparkle, type LucideIcon } from 'lucide-react'
import {
  audioClipBars,
  clipBeats,
  detectBeats,
  dragAudioClip,
  isDefaultFx,
  type AudioClip,
} from '@lumora/core'
import { WaveBars } from './ClipWaveform'
import { openContextMenu } from './ContextMenu'
import { snapDelta } from './snap'
import { useEditorStore } from './store'
import { itemMenu } from './timeline-menus'
import { assignLanes } from './timeline-math'

type Drag = { id: string; mode: 'move' | 'start' | 'end'; originX: number; origin: AudioClip }

/**
 * Màu và biểu tượng từng loại (khối màu đặc, sóng trắng mờ như CapCut): nhạc (xanh lá),
 * hiệu ứng (xanh dương), lồng tiếng (cam).
 */
const KIND: Record<AudioClip['kind'], { className: string; icon: LucideIcon }> = {
  music: { className: 'bg-emerald-700/90 text-white/70', icon: Music2 },
  sfx: { className: 'bg-sky-700/90 text-white/70', icon: Sparkle },
  voice: { className: 'bg-orange-700/90 text-white/70', icon: Mic },
}

/** Hàng "Âm thanh" trên timeline: nhạc nền và hiệu ứng, kéo để di chuyển, kéo mép để cắt. */
export function AudioTrack({
  duration,
  pxPerMs,
  onSeek,
}: {
  duration: number
  pxPerMs: number
  onSeek: (e: ReactPointerEvent) => void
}) {
  const clips = useEditorStore((s) => s.edit?.audioClips ?? [])
  const selectedItems = useEditorStore((s) => s.selected)
  const locked = useEditorStore((s) => s.edit?.tracks.audio.locked ?? false)
  const selectedIds = new Set(selectedItems.filter((x) => x.kind === 'audio').map((x) => x.id))
  const { t: tr } = useTranslation()
  const peaks = useEditorStore((s) => s.assetPeaks)
  const [drag, setDrag] = useState<Drag | null>(null)
  const store = useEditorStore.getState

  useEffect(() => {
    for (const clip of clips) store().loadAssetPeaks(clip.file)
  }, [clips, store])

  const down = (e: ReactPointerEvent, clip: AudioClip, mode: Drag['mode']) => {
    if (e.button !== 0) return
    if (locked) return
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      store().toggleSelect({ kind: 'audio', id: clip.id })
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (!store().isSelected('audio', clip.id) || store().selected.length <= 1)
      store().select({ kind: 'audio', id: clip.id })
    setDrag({ id: clip.id, mode, originX: e.clientX, origin: clip })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const raw = (e.clientX - drag.originX) / pxPerMs
    const span = { start: drag.origin.start, end: drag.origin.start + drag.origin.duration }
    const delta = snapDelta(span, drag.mode, raw, pxPerMs, drag.id, e.altKey)
    const next = dragAudioClip(drag.origin, drag.mode, delta, duration)
    store().updateAudioClip(drag.id, next, `audio-drag-${drag.id}`)
  }

  const lanes = assignLanes(clips.map((c) => ({ start: c.start, end: c.start + c.duration })))
  // Nhịp của từng bài nhạc (tính một lần theo dạng sóng của file).
  const beats = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const [file, wave] of Object.entries(peaks))
      if (wave) map[file] = detectBeats(wave.peaks, wave.bucketMs)
    return map
  }, [peaks])
  return (
    <div
      className="relative h-full flex-1"
      onPointerDown={onSeek}
      onPointerMove={move}
      onPointerUp={() => {
        setDrag(null)
        store().setSnapLine(null)
      }}
      data-testid="audio-track"
    >
      {clips.map((clip, index) => {
        const lane = lanes[index] ?? 0
        const selected = selectedIds.has(clip.id)
        const wave = peaks[clip.file]
        const bars = wave
          ? audioClipBars(clip, wave, Math.max(4, Math.min(600, Math.ceil(clip.duration / 60))))
          : []
        const kind = KIND[clip.kind]
        const Icon = kind.icon
        const marks = clip.kind === 'music' ? clipBeats(clip, beats[clip.file] ?? []) : []
        return (
          <div
            key={clip.id}
            data-testid="timeline-audio"
            data-kind={clip.kind}
            onPointerDown={(e) => down(e, clip, 'move')}
            onContextMenu={(e) => !locked && openContextMenu(e, itemMenu(tr, 'audio', clip.id))}
            data-selected={selected}
            data-sel-kind="audio"
            data-sel-id={clip.id}
            className={`absolute flex cursor-grab items-center overflow-hidden rounded-md border-2 text-[11px] ${
              kind.className
            } ${selected ? 'border-white' : 'border-transparent hover:border-white/40'}`}
            style={{
              top: lane * 40 + 2,
              height: 36,
              left: `${(clip.start / duration) * 100}%`,
              width: `${(Math.min(clip.duration, duration - clip.start) / duration) * 100}%`,
            }}
          >
            {bars.length > 0 && <WaveBars bars={bars} />}
            {marks.map((t) => (
              <span
                key={t}
                data-testid="beat-mark"
                className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-white/70"
                style={{ left: `${((t - clip.start) / clip.duration) * 100}%` }}
              />
            ))}
            <span className="relative ml-2 flex min-w-0 items-center gap-1 rounded bg-black/45 px-1 text-white">
              <Icon size={11} aria-hidden className="shrink-0" />
              <span className="truncate">{clip.name}</span>
              {!isDefaultFx(clip.fx) && (
                <span
                  className="rounded bg-white/20 px-0.5 text-[9px] uppercase"
                  data-testid="audio-fx-badge"
                >
                  FX
                </span>
              )}
            </span>
            <span
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/30"
              onPointerDown={(e) => down(e, clip, 'start')}
            />
            <span
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/30"
              onPointerDown={(e) => down(e, clip, 'end')}
            />
          </div>
        )
      })}
    </div>
  )
}
