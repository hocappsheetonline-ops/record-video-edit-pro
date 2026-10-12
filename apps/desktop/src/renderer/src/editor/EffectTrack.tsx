import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { dragRegion, type EffectRegion } from '@lumora/core'
import { openContextMenu } from './ContextMenu'
import { snapDelta } from './snap'
import { useEditorStore } from './store'
import { itemMenu } from './timeline-menus'
import { assignLanes } from './timeline-math'

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
  const selectedItems = useEditorStore((s) => s.selected)
  const locked = useEditorStore((s) => s.edit?.tracks.effects.locked ?? false)
  const selectedIds = new Set(selectedItems.filter((x) => x.kind === 'effect').map((x) => x.id))
  const { t: tr } = useTranslation()
  const [drag, setDrag] = useState<Drag | null>(null)
  const store = useEditorStore.getState

  const down = (e: ReactPointerEvent, fx: EffectRegion, mode: Drag['mode']) => {
    if (e.button !== 0) return
    if (locked) return
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      store().toggleSelect({ kind: 'effect', id: fx.id })
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (!store().isSelected('effect', fx.id) || store().selected.length <= 1)
      store().select({ kind: 'effect', id: fx.id })
    setDrag({ id: fx.id, mode, originX: e.clientX, origin: fx })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const raw = (e.clientX - drag.originX) / pxPerMs
    const delta = snapDelta(drag.origin, drag.mode, raw, pxPerMs, drag.id, e.altKey)
    const next = dragRegion(drag.origin, drag.mode, delta, duration)
    store().updateEffect(drag.id, { start: next.start, end: next.end }, `fx-drag-${drag.id}`)
  }

  const lanes = assignLanes(effects)
  return (
    <div
      className="relative h-full flex-1"
      onPointerDown={onSeek}
      onPointerMove={move}
      onPointerUp={() => {
        setDrag(null)
        store().setSnapLine(null)
      }}
    >
      {effects.map((fx, index) => {
        const lane = lanes[index] ?? 0
        const selected = selectedIds.has(fx.id)
        const end = Math.min(fx.end, duration)
        if (end <= fx.start) return null
        return (
          <div
            key={fx.id}
            data-testid="timeline-effect"
            data-kind={fx.kind}
            onPointerDown={(e) => down(e, fx, 'move')}
            onContextMenu={(e) => !locked && openContextMenu(e, itemMenu(tr, 'effect', fx.id))}
            data-selected={selected}
            data-sel-kind="effect"
            data-sel-id={fx.id}
            className={`absolute flex cursor-grab items-center justify-center overflow-hidden rounded-md border-2 bg-fuchsia-500/25 text-[11px] text-fuchsia-200 ${
              selected ? 'border-white' : 'border-transparent hover:border-white/40'
            }`}
            style={{
              top: lane * 28 + 2,
              height: 24,
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
