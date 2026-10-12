import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { dragRegion, type EffectRegion } from '@lumora/core'
import { useEditorStore } from './store'

type Drag = { id: string; mode: 'move' | 'start' | 'end'; originX: number; origin: EffectRegion }

/** Hàng "Hiệu ứng" trên timeline: kéo để dời, kéo mép để đổi độ dài. */
export function EffectTrack({
  duration,
  pxPerMs,
  onSeek,
}: {
  duration: number
  pxPerMs: number
  onSeek: (e: ReactPointerEvent) => void
}) {
  const { t } = useTranslation()
  const effects = useEditorStore((s) => s.edit?.effects ?? [])
  const selection = useEditorStore((s) => s.selection)
  const [drag, setDrag] = useState<Drag | null>(null)
  const store = useEditorStore.getState

  const down = (e: ReactPointerEvent, fx: EffectRegion, mode: Drag['mode']) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    store().select({ kind: 'effect', id: fx.id })
    store().requestTab('effects')
    setDrag({ id: fx.id, mode, originX: e.clientX, origin: fx })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const next = dragRegion(drag.origin, drag.mode, (e.clientX - drag.originX) / pxPerMs, duration)
    store().updateEffect(drag.id, { start: next.start, end: next.end }, `fx-drag-${drag.id}`)
  }

  return (
    <div
      className="relative h-7 flex-1"
      onPointerDown={onSeek}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
    >
      {effects.map((fx) => {
        const selected = selection?.kind === 'effect' && selection.id === fx.id
        const end = Math.min(fx.end, duration)
        if (end <= fx.start) return null
        return (
          <div
            key={fx.id}
            data-testid="timeline-effect"
            data-kind={fx.kind}
            onPointerDown={(e) => down(e, fx, 'move')}
            className={`absolute top-0 flex h-full cursor-grab items-center justify-center overflow-hidden rounded-md border-2 bg-fuchsia-500/25 text-[11px] text-fuchsia-200 ${
              selected ? 'border-white' : 'border-transparent hover:border-white/40'
            }`}
            style={{
              left: `${(fx.start / duration) * 100}%`,
              width: `${((end - fx.start) / duration) * 100}%`,
            }}
          >
            <span className="truncate px-2">✨ {t(`editor.effects.kinds.${fx.kind}`)}</span>
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
