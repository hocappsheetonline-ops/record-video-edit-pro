import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  outputToSource,
  setCaptionTiming,
  sourceToOutput,
  type CaptionLine,
  type Clip,
} from '@lumora/core'
import { useEditorStore } from './store'

type Drag = {
  id: string
  mode: 'move' | 'start' | 'end'
  originX: number
  /** Vị trí trên video xuất lúc bắt đầu kéo. */
  start: number
  end: number
}

/** Khoảng trên video xuất của một dòng (bỏ phần đã bị cắt); null nếu bị cắt hết. */
export function captionRange(clips: readonly Clip[], line: CaptionLine) {
  let start: number | null = null
  let end: number | null = null
  for (let s = line.start; s <= line.end; s += 40) {
    const t = sourceToOutput(clips, s)
    if (t === null) continue
    start ??= t
    end = t
  }
  const last = sourceToOutput(clips, line.end)
  if (last !== null) end = last
  return start !== null && end !== null && end > start ? { start, end } : null
}

/** Hàng "Phụ đề" trên timeline: mỗi dòng một khối; kéo để dời, kéo mép để đổi thời gian. */
export function CaptionTrack({
  duration,
  pxPerMs,
  onSeek,
}: {
  duration: number
  pxPerMs: number
  onSeek: (e: ReactPointerEvent) => void
}) {
  const edit = useEditorStore((s) => s.edit)
  const time = useEditorStore((s) => s.time)
  const [drag, setDrag] = useState<Drag | null>(null)
  if (!edit) return null
  const { lines } = edit.captions
  const store = useEditorStore.getState

  const down = (
    e: ReactPointerEvent,
    id: string,
    mode: Drag['mode'],
    range: { start: number; end: number },
  ) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (mode === 'move') {
      store().setTime(range.start)
      store().requestTab('captions')
    }
    setDrag({ id, mode, originX: e.clientX, ...range })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const delta = (e.clientX - drag.originX) / pxPerMs
    if (Math.abs(delta) < 1) return
    const len = drag.end - drag.start
    let start = drag.start
    let end = drag.end
    if (drag.mode === 'move') {
      start = Math.min(Math.max(0, drag.start + delta), duration - len)
      end = start + len
    } else if (drag.mode === 'start') start = Math.max(0, drag.start + delta)
    else end = Math.min(duration, drag.end + delta)
    const s = outputToSource(edit.clips, start)?.source
    const t = outputToSource(edit.clips, Math.max(0, end - 1))?.source
    if (s === undefined || t === undefined) return
    store().change(
      (current) => ({
        ...current,
        captions: {
          ...current.captions,
          lines: setCaptionTiming(current.captions.lines, drag.id, s, t + 1),
        },
      }),
      `cap-drag-${drag.id}`,
    )
  }

  return (
    <div
      className="relative h-full flex-1"
      onPointerDown={onSeek}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
    >
      {lines.map((line) => {
        const range = captionRange(edit.clips, line)
        if (!range) return null
        const active = time >= range.start && time <= range.end
        return (
          <div
            key={line.id}
            data-testid="timeline-caption"
            onPointerDown={(e) => down(e, line.id, 'move', range)}
            title={line.text}
            className={`absolute top-0.5 flex h-6 cursor-grab items-center overflow-hidden rounded-md border-2 bg-sky-500/25 text-[11px] text-sky-100 ${
              active ? 'border-white/80' : 'border-transparent hover:border-white/40'
            }`}
            style={{
              left: `${(range.start / duration) * 100}%`,
              width: `${((range.end - range.start) / duration) * 100}%`,
            }}
          >
            <span className="truncate px-2">{line.text}</span>
            <span
              data-testid="timeline-caption-start"
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/30"
              onPointerDown={(e) => down(e, line.id, 'start', range)}
            />
            <span
              data-testid="timeline-caption-end"
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/30"
              onPointerDown={(e) => down(e, line.id, 'end', range)}
            />
          </div>
        )
      })}
    </div>
  )
}
