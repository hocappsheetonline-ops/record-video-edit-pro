import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { overlaysAt, type Project } from '@lumora/core'
import { overlayBox } from './overlay-draw'
import { PreviewEngine } from './preview'
import { useEditorStore } from './store'

type Drag = { id: string; offX: number; offY: number }

export function PreviewCanvas({ project, folder }: { project: Project; folder: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new PreviewEngine(canvas, project, folder)
    return () => engine.dispose()
  }, [project, folder])

  /** Toạ độ con trỏ theo điểm ảnh của khung hình (canvas hiển thị đúng tỉ lệ khung). */
  const toFrame = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  // Bấm vào chữ / sticker / ảnh đang hiện để chọn và kéo đổi vị trí (giống CapCut).
  const onPointerDown = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current
    const { edit, time, select, requestTab } = useEditorStore.getState()
    const ctx = canvas?.getContext('2d')
    if (!canvas || !edit || !ctx) return
    const p = toFrame(e)
    for (const o of [...overlaysAt(edit.overlays, time)].reverse()) {
      const box = overlayBox(ctx, o, canvas.width, canvas.height)
      const angle = (-o.rotation * Math.PI) / 180
      const dx = p.x - box.cx
      const dy = p.y - box.cy
      const lx = dx * Math.cos(angle) - dy * Math.sin(angle)
      const ly = dx * Math.sin(angle) + dy * Math.cos(angle)
      if (Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2) {
        e.preventDefault()
        canvas.setPointerCapture?.(e.pointerId)
        select({ kind: 'overlay', id: o.id })
        requestTab('stickers')
        drag.current = { id: o.id, offX: dx, offY: dy }
        return
      }
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current
    if (!drag.current || !canvas) return
    const p = toFrame(e)
    const { id, offX, offY } = drag.current
    useEditorStore.getState().updateOverlay(
      id,
      {
        x: Math.min(1, Math.max(0, (p.x - offX) / canvas.width)),
        y: Math.min(1, Math.max(0, (p.y - offY) / canvas.height)),
      },
      `ov-move-${id}`,
    )
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      className="max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl"
    />
  )
}
