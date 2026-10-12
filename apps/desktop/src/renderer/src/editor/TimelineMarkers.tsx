import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock, LockOpen, Volume2, VolumeX } from 'lucide-react'
import { MARKER_COLORS, TRACK_CONTROLS, type Marker, type TimelineRow } from '@lumora/core'
import { openContextMenu } from './ContextMenu'
import { useEditorStore } from './store'

/** Cờ marker trên thước timeline: bấm để nhảy, kéo để dời, bấm đúp để đổi tên. */
export function MarkerFlags({ duration, pxPerMs }: { duration: number; pxPerMs: number }) {
  const { t } = useTranslation()
  const markers = useEditorStore((s) => s.edit?.markers ?? [])
  const [editing, setEditing] = useState<string | null>(null)
  const drag = useRef<{ id: string; originX: number; origin: number; moved: boolean } | null>(null)
  const store = useEditorStore.getState

  const down = (e: ReactPointerEvent, m: Marker) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { id: m.id, originX: e.clientX, origin: m.t, moved: false }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.originX
    if (!d.moved && Math.abs(dx) < 3) return
    d.moved = true
    const next = Math.round(Math.min(duration, Math.max(0, d.origin + dx / pxPerMs)))
    store().updateMarker(d.id, { t: next }, `marker-${d.id}`)
  }
  const up = (m: Marker) => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) store().setTime(m.t)
  }

  return (
    <>
      {markers.map((m) => (
        <div
          key={m.id}
          data-testid="timeline-marker"
          data-label={m.label}
          className="absolute top-0 z-10 flex h-full -translate-x-px cursor-grab items-start"
          style={{ left: `${(m.t / duration) * 100}%` }}
          onPointerDown={(e) => down(e, m)}
          onPointerMove={move}
          onPointerUp={() => up(m)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditing(m.id)
          }}
          onContextMenu={(e) =>
            openContextMenu(e, [
              {
                label: t('editor.markers.rename'),
                testId: 'menu-marker-rename',
                onClick: () => setEditing(m.id),
              },
              ...MARKER_COLORS.map((color) => ({
                label: t(`editor.markers.colors.${color.slice(1)}`),
                testId: `menu-marker-color-${color.slice(1)}`,
                onClick: () => store().updateMarker(m.id, { color }),
              })),
              null,
              {
                label: t('editor.menu.delete'),
                testId: 'menu-marker-delete',
                danger: true,
                onClick: () => store().removeMarker(m.id),
              },
            ])
          }
          title={m.label}
        >
          <span className="h-full w-0.5" style={{ background: m.color }} />
          {editing === m.id ? (
            <input
              autoFocus
              defaultValue={m.label}
              data-testid="marker-rename"
              aria-label={t('editor.markers.rename')}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                store().updateMarker(m.id, { label: e.target.value.slice(0, 100) })
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditing(null)
                e.stopPropagation()
              }}
              className="ml-0.5 h-5 w-32 rounded border border-accent bg-surface px-1 text-[11px] text-text outline-none"
            />
          ) : (
            <span
              className="ml-px max-w-28 truncate rounded-r px-1 text-[10px] font-medium leading-4 text-black"
              style={{ background: m.color }}
            >
              {m.label || '▶'}
            </span>
          )}
        </div>
      ))}
    </>
  )
}

const ICONS = {
  hidden: [Eye, EyeOff],
  muted: [Volume2, VolumeX],
  locked: [LockOpen, Lock],
} as const

/** Nút ẩn / tắt tiếng / khóa ở đầu hàng timeline. */
export function TrackControls({ row }: { row: TimelineRow }) {
  const { t } = useTranslation()
  const state = useEditorStore((s) => s.edit?.tracks[row])
  if (!state) return null
  return (
    <span className="ml-auto flex shrink-0 items-center">
      {TRACK_CONTROLS[row].map((control) => {
        const on = state[control]
        const [Off, On] = ICONS[control]
        const Icon = on ? On : Off
        const label = t(`editor.trackControls.${control}${on ? 'On' : ''}`)
        return (
          <button
            key={control}
            type="button"
            data-testid={`track-${row}-${control}`}
            aria-pressed={on}
            aria-label={label}
            data-tooltip={label}
            onClick={() => useEditorStore.getState().setTrack(row, { [control]: !on })}
            className={`flex size-5 items-center justify-center rounded hover:bg-surface-2 ${
              on ? 'text-accent' : 'text-muted/70 hover:text-text'
            }`}
          >
            <Icon size={12} aria-hidden />
          </button>
        )
      })}
    </span>
  )
}
