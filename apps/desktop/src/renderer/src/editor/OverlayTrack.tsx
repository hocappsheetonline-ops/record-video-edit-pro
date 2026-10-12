import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { dragOverlay, type Overlay, type OverlayKind } from '@lumora/core'
import { useEditorStore } from './store'
import { assignLanes } from './timeline-math'

type Drag = { id: string; mode: 'move' | 'start' | 'end'; originX: number; origin: Overlay }

/** Màu từng loại lớp trên timeline (giống CapCut: chữ, nhãn dán, ảnh, video khác màu). */
const KIND_STYLE: Record<OverlayKind, string> = {
  text: 'bg-amber-500/30 text-amber-50',
  emoji: 'bg-pink-500/30 text-pink-50',
  image: 'bg-teal-500/30 text-teal-50',
  video: 'bg-violet-500/40 text-violet-50',
  shape: 'bg-red-500/30 text-red-50',
}
const KIND_ICON: Record<OverlayKind, string> = {
  text: 'T',
  emoji: '',
  image: '🖼',
  video: '🎬',
  shape: '➜',
}

/** Hàng "Chữ & sticker" trên timeline: kéo để dời, kéo mép để đổi độ dài. */
export function OverlayTrack({
  duration,
  pxPerMs,
  onSeek,
}: {
  duration: number
  pxPerMs: number
  onSeek: (e: ReactPointerEvent) => void
}) {
  const { t } = useTranslation()
  const effects = useEditorStore((s) => s.edit?.overlays ?? [])
  const selection = useEditorStore((s) => s.selection)
  const [drag, setDrag] = useState<Drag | null>(null)
  const store = useEditorStore.getState

  const down = (e: ReactPointerEvent, fx: Overlay, mode: Drag['mode']) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    store().select({ kind: 'overlay', id: fx.id })
    setDrag({ id: fx.id, mode, originX: e.clientX, origin: fx })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const next = dragOverlay(drag.origin, drag.mode, (e.clientX - drag.originX) / pxPerMs, duration)
    store().updateOverlay(
      drag.id,
      {
        start: next.start,
        end: next.end,
        mediaOffset: next.mediaOffset,
        keyframes: next.keyframes,
      },
      `ov-drag-${drag.id}`,
    )
  }

  const lanes = assignLanes(effects)
  return (
    <div
      className="relative h-full flex-1"
      onPointerDown={onSeek}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
    >
      {effects.map((fx, index) => {
        const lane = lanes[index] ?? 0
        const selected = selection?.kind === 'overlay' && selection.id === fx.id
        const end = Math.min(fx.end, duration)
        if (end <= fx.start) return null
        return (
          <div
            key={fx.id}
            data-testid="timeline-overlay"
            data-kind={fx.kind}
            onPointerDown={(e) => down(e, fx, 'move')}
            data-selected={selected}
            className={`absolute flex cursor-grab items-center overflow-hidden rounded-md border-2 text-[11px] ${KIND_STYLE[fx.kind]} ${
              selected ? 'border-white' : 'border-transparent hover:border-white/40'
            }`}
            style={{
              top: lane * 32 + 2,
              height: 28,
              left: `${(fx.start / duration) * 100}%`,
              width: `${((end - fx.start) / duration) * 100}%`,
            }}
          >
            <span className="truncate px-2">
              {KIND_ICON[fx.kind]}{' '}
              {fx.kind === 'shape'
                ? t(`editor.shapes.${fx.shape ?? 'arrow'}`)
                : fx.text || t(`editor.props.${fx.kind}`)}
            </span>
            {/* Hình thoi ◇ tại mỗi keyframe: bấm để nhảy tới. */}
            {fx.keyframes?.map((k) => (
              <span
                key={k.id}
                data-testid="keyframe-mark"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  store().select({ kind: 'overlay', id: fx.id })
                  store().setTime(fx.start + k.t)
                }}
                className="absolute bottom-0.5 size-2 -translate-x-1/2 rotate-45 cursor-pointer border border-black/50 bg-white"
                style={{ left: `${(k.t / Math.max(1, end - fx.start)) * 100}%` }}
              />
            ))}
            <span
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/30"
              onPointerDown={(e) => down(e, fx, 'start')}
            />
            <span
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/30"
              onPointerDown={(e) => down(e, fx, 'end')}
            />
          </div>
        )
      })}
    </div>
  )
}
