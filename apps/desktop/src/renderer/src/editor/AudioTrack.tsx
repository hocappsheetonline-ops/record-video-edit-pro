import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { audioClipBars, dragAudioClip, type AudioClip } from '@lumora/core'
import { WaveBars } from './ClipWaveform'
import { useEditorStore } from './store'
import { assignLanes } from './timeline-math'

type Drag = { id: string; mode: 'move' | 'start' | 'end'; originX: number; origin: AudioClip }

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
  const selection = useEditorStore((s) => s.selection)
  const peaks = useEditorStore((s) => s.assetPeaks)
  const [drag, setDrag] = useState<Drag | null>(null)
  const store = useEditorStore.getState

  useEffect(() => {
    for (const clip of clips) store().loadAssetPeaks(clip.file)
  }, [clips, store])

  const down = (e: ReactPointerEvent, clip: AudioClip, mode: Drag['mode']) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    store().select({ kind: 'audio', id: clip.id })
    setDrag({ id: clip.id, mode, originX: e.clientX, origin: clip })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const next = dragAudioClip(
      drag.origin,
      drag.mode,
      (e.clientX - drag.originX) / pxPerMs,
      duration,
    )
    store().updateAudioClip(drag.id, next, `audio-drag-${drag.id}`)
  }

  const lanes = assignLanes(clips.map((c) => ({ start: c.start, end: c.start + c.duration })))
  return (
    <div
      className="relative h-full flex-1"
      onPointerDown={onSeek}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
      data-testid="audio-track"
    >
      {clips.map((clip, index) => {
        const lane = lanes[index] ?? 0
        const selected = selection?.kind === 'audio' && selection.id === clip.id
        const wave = peaks[clip.file]
        const bars = wave
          ? audioClipBars(clip, wave, Math.max(4, Math.min(600, Math.ceil(clip.duration / 60))))
          : []
        const color = clip.kind === 'music' ? 'emerald' : 'sky'
        return (
          <div
            key={clip.id}
            data-testid="timeline-audio"
            data-kind={clip.kind}
            onPointerDown={(e) => down(e, clip, 'move')}
            className={`absolute flex cursor-grab items-center overflow-hidden rounded-md border-2 text-[11px] ${
              color === 'emerald'
                ? 'bg-emerald-500/25 text-emerald-300'
                : 'bg-sky-500/25 text-sky-300'
            } ${selected ? 'border-white' : 'border-transparent hover:border-white/40'}`}
            style={{
              top: lane * 40 + 2,
              height: 36,
              left: `${(clip.start / duration) * 100}%`,
              width: `${(Math.min(clip.duration, duration - clip.start) / duration) * 100}%`,
            }}
          >
            {bars.length > 0 && <WaveBars bars={bars} />}
            <span className="relative ml-2 truncate rounded bg-black/50 px-1 text-white">
              {clip.kind === 'music' ? '♪' : '✦'} {clip.name}
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
