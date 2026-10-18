import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  cameraRect,
  overlaysAt,
  posedOverlay,
  placementAt,
  placementCorner,
  type EditState,
  type Project,
} from '@lumora/core'
import { overlayBox } from './overlay-draw'
import { PreviewEngine } from './preview'
import { useEditorStore } from './store'

type Point = { x: number; y: number }
type Drag =
  | { kind: 'overlay'; id: string; offX: number; offY: number }
  | { kind: 'camera'; offX: number; offY: number }
  | {
      kind: 'resize'
      target: 'overlay' | 'camera'
      id: string
      center: Point
      d0: number
      size0: number
      /** Vùng che: kéo góc đổi cả chiều rộng lẫn chiều cao (không giữ tỉ lệ). */
      free?: { rotation: number }
    }
  | { kind: 'rotate'; id: string; center: Point }

/** Khung chọn (pixel khung hình) của mục đang chọn. */
interface Box {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
  target: 'overlay' | 'camera'
  id: string
}

const hasCameraTrack = (project: Project) => project.segments.some((s) => !!s.tracks.camera)

/** Bong bóng webcam (pixel khung hình) nếu đang hiện dạng bong bóng. */
function cameraBox(edit: EditState, project: Project, width: number, height: number) {
  if (!edit.camera.visible || edit.camera.layout !== 'bubble' || !hasCameraTrack(project))
    return null
  return cameraRect({ width, height }, edit.camera.size, { x: edit.camera.x, y: edit.camera.y })
}

function selectedBox(canvas: HTMLCanvasElement, project: Project): Box | null {
  const { edit, selection, time } = useEditorStore.getState()
  const ctx = canvas.getContext('2d')
  if (!edit || !selection || !ctx) return null
  if (selection.kind === 'camera') {
    const r = cameraBox(edit, project, canvas.width, canvas.height)
    return r
      ? {
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
          w: r.width,
          h: r.height,
          rotation: 0,
          target: 'camera',
          id: '',
        }
      : null
  }
  if (selection.kind !== 'overlay') return null
  const found = overlaysAt(edit.overlays, time).find((x) => x.id === selection.id)
  if (!found) return null
  const o = posedOverlay(found, time)
  const b = overlayBox(ctx, o, canvas.width, canvas.height)
  return { ...b, rotation: o.rotation, target: 'overlay', id: o.id }
}

/**
 * Khung xem trước. Bấm vào chữ / sticker / video meme / webcam để chọn, kéo để dời, kéo góc để đổi
 * cỡ, kéo nút tròn phía trên để xoay (giống CapCut). Bấm chỗ trống để bỏ chọn.
 */
export function PreviewCanvas({ project, folder }: { project: Project; folder: string }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  /** Vị trí / tỉ lệ thu nhỏ của canvas trên màn hình (để đặt khung chọn). */
  const [metrics, setMetrics] = useState({
    left: 0,
    top: 0,
    scale: 0,
    width: 0,
    height: 0,
    canvasW: 0,
    canvasH: 0,
  })
  const guides = useEditorStore((s) => s.guides)
  const zoom = useEditorStore((s) => s.previewZoom)
  const [hover, setHover] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new PreviewEngine(canvas, project, folder)
    return () => engine.dispose()
  }, [project, folder])

  // Cập nhật khung chọn khi bản chỉnh sửa / lựa chọn / thời điểm / cỡ khung thay đổi.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const update = () => {
      setBox(selectedBox(canvas, project))
      setMetrics({
        left: canvas.offsetLeft,
        top: canvas.offsetTop,
        scale: canvas.width > 0 ? canvas.offsetWidth / canvas.width : 0,
        width: canvas.offsetWidth,
        height: canvas.offsetHeight,
        canvasW: canvas.width,
        canvasH: canvas.height,
      })
    }
    update()
    const unsubscribe = useEditorStore.subscribe((s, prev) => {
      if (
        s.edit !== prev.edit ||
        s.selection !== prev.selection ||
        s.time !== prev.time ||
        s.videoSize !== prev.videoSize ||
        s.guides !== prev.guides ||
        s.previewZoom !== prev.previewZoom ||
        s.lowPreview !== prev.lowPreview
      )
        update()
    })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(canvas)
    return () => {
      unsubscribe()
      observer?.disconnect()
    }
  }, [project])

  /** Toạ độ con trỏ theo điểm ảnh của khung hình (canvas hiển thị đúng tỉ lệ khung). */
  const toFrame = (e: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  /** Mục nằm dưới con trỏ: lớp nổi trên cùng trước, rồi tới webcam. */
  const hitTest = (p: Point) => {
    const canvas = canvasRef.current
    const { edit, time } = useEditorStore.getState()
    const ctx = canvas?.getContext('2d')
    if (!canvas || !edit || !ctx) return null
    for (const o of [...overlaysAt(edit.overlays, time)]
      .reverse()
      .map((x) => posedOverlay(x, time))) {
      const b = overlayBox(ctx, o, canvas.width, canvas.height)
      const angle = (-o.rotation * Math.PI) / 180
      const dx = p.x - b.cx
      const dy = p.y - b.cy
      const lx = dx * Math.cos(angle) - dy * Math.sin(angle)
      const ly = dx * Math.sin(angle) + dy * Math.cos(angle)
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2)
        return { kind: 'overlay' as const, id: o.id, offX: dx, offY: dy }
    }
    const cam = cameraBox(edit, project, canvas.width, canvas.height)
    if (
      cam &&
      p.x >= cam.x &&
      p.x <= cam.x + cam.width &&
      p.y >= cam.y &&
      p.y <= cam.y + cam.height
    )
      return {
        kind: 'camera' as const,
        offX: p.x - (cam.x + cam.width / 2),
        offY: p.y - (cam.y + cam.height / 2),
      }
    return null
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const hit = hitTest(toFrame(e))
    const { select } = useEditorStore.getState()
    if (!hit) {
      select(null)
      return
    }
    e.preventDefault()
    canvas.setPointerCapture?.(e.pointerId)
    select(hit.kind === 'overlay' ? { kind: 'overlay', id: hit.id } : { kind: 'camera', id: '' })
    drag.current = hit
    setDragging(true)
  }

  const startHandle = (e: ReactPointerEvent, mode: 'resize' | 'rotate') => {
    if (!box) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const center = { x: box.cx, y: box.cy }
    setDragging(true)
    if (mode === 'rotate') {
      drag.current = { kind: 'rotate', id: box.id, center }
      return
    }
    const p = toFrame(e)
    const { edit, time } = useEditorStore.getState()
    const target = edit?.overlays.find((o) => o.id === box.id)
    const size0 =
      box.target === 'camera'
        ? (edit?.camera.size ?? 0.2)
        : target
          ? posedOverlay(target, time).size
          : 0.1
    drag.current = {
      kind: 'resize',
      target: box.target,
      id: box.id,
      center,
      d0: Math.max(4, Math.hypot(p.x - center.x, p.y - center.y)),
      size0,
      ...(target?.kind === 'blur' ? { free: { rotation: target.rotation } } : {}),
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current
    const d = drag.current
    if (!canvas) return
    const p = toFrame(e)
    if (!d) {
      setHover(hitTest(p) !== null)
      return
    }
    const store = useEditorStore.getState()
    const output = { width: canvas.width, height: canvas.height }
    if (d.kind === 'overlay') {
      store.updateOverlayPose(
        d.id,
        {
          x: Math.min(1, Math.max(0, (p.x - d.offX) / canvas.width)),
          y: Math.min(1, Math.max(0, (p.y - d.offY) / canvas.height)),
        },
        `ov-move-${d.id}`,
      )
    } else if (d.kind === 'camera') {
      const size = store.edit?.camera.size ?? 0.2
      const place = placementAt(output, size, { x: p.x - d.offX, y: p.y - d.offY })
      const corner = placementCorner(place)
      store.change(
        (edit) => ({
          ...edit,
          camera: { ...edit.camera, ...place, ...(corner ? { position: corner } : {}) },
        }),
        'cam-move',
      )
    } else if (d.kind === 'resize') {
      const ratio = Math.hypot(p.x - d.center.x, p.y - d.center.y) / d.d0
      if (d.free) {
        // Góc kéo tới đâu, vùng che rộng / cao tới đó (tính trong hệ tọa độ đã xoay của lớp).
        const a = (-d.free.rotation * Math.PI) / 180
        const dx = p.x - d.center.x
        const dy = p.y - d.center.y
        const w = Math.max(8, 2 * Math.abs(dx * Math.cos(a) - dy * Math.sin(a)))
        const h = Math.max(8, 2 * Math.abs(dx * Math.sin(a) + dy * Math.cos(a)))
        const size = Math.min(4, Math.max(0.03, h / canvas.height))
        store.updateOverlayPose(d.id, { size }, `ov-size-${d.id}`)
        store.updateOverlay(
          d.id,
          { aspect: Math.min(20, Math.max(0.05, w / h)) },
          `ov-size-${d.id}`,
        )
      } else if (d.target === 'overlay') {
        const size = Math.min(4, Math.max(0.03, d.size0 * ratio))
        store.updateOverlayPose(d.id, { size }, `ov-size-${d.id}`)
      } else {
        const size = Math.min(0.6, Math.max(0.08, d.size0 * ratio))
        // Giữ nguyên tâm bong bóng khi đổi cỡ.
        const place = placementAt(output, size, d.center)
        store.change(
          (edit) => ({ ...edit, camera: { ...edit.camera, size, ...place } }),
          'cam-size',
        )
      }
    } else {
      const angle = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI + 90
      let rotation = ((angle + 540) % 360) - 180
      // Hít vào các góc thẳng cho dễ đặt.
      for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(rotation - snap) < 4) rotation = snap
      store.updateOverlayPose(d.id, { rotation: Math.round(rotation) }, `ov-rot-${d.id}`)
    }
  }

  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }

  const { left, top, scale } = metrics
  return (
    <>
      {guides !== 'none' && metrics.width > 0 && (
        <PreviewGuides
          mode={guides}
          left={left}
          top={top}
          width={metrics.width}
          height={metrics.height}
        />
      )}
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-zoom={zoom}
        style={{
          cursor: dragging ? 'grabbing' : hover ? 'move' : 'default',
          // Tỉ lệ cố định: cỡ theo khung hình xem trước 720p (100% = 1 điểm ảnh khung / 1px).
          ...(zoom !== 'fit' && metrics.canvasW > 0
            ? {
                width: (metrics.canvasW * zoom) / 100,
                height: (metrics.canvasH * zoom) / 100,
                maxWidth: 'none',
                maxHeight: 'none',
              }
            : {}),
        }}
        className="max-h-full max-w-full shrink-0 touch-none bg-black object-contain shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      />
      {box && scale > 0 && (
        <div
          data-testid="selection-box"
          data-target={box.target}
          className="pointer-events-none absolute border border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{
            left: left + (box.cx - box.w / 2) * scale,
            top: top + (box.cy - box.h / 2) * scale,
            width: box.w * scale,
            height: box.h * scale,
            transform: `rotate(${box.rotation}deg)`,
          }}
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span
              key={corner}
              data-testid={`handle-${corner}`}
              aria-label={t('editor.preview.resize')}
              onPointerDown={(e) => startHandle(e, 'resize')}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              className="pointer-events-auto absolute size-2.5 rounded-sm border border-accent bg-white"
              style={{
                left: corner.endsWith('w') ? -5 : undefined,
                right: corner.endsWith('e') ? -5 : undefined,
                top: corner.startsWith('n') ? -5 : undefined,
                bottom: corner.startsWith('s') ? -5 : undefined,
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              }}
            />
          ))}
          {box.target === 'overlay' && (
            <span
              data-testid="handle-rotate"
              aria-label={t('editor.preview.rotate')}
              onPointerDown={(e) => startHandle(e, 'rotate')}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              className="pointer-events-auto absolute -top-6 left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full border border-accent bg-white"
            />
          )}
        </div>
      )}
    </>
  )
}

/**
 * Đường gióng trên khung xem trước (không có trong video xuất): chia ba (bố cục), hoặc vùng an
 * toàn TikTok / Shorts — phần trên, dưới, cạnh phải thường bị chữ và nút của ứng dụng che.
 */
function PreviewGuides({
  mode,
  left,
  top,
  width,
  height,
}: {
  mode: 'thirds' | 'safe'
  left: number
  top: number
  width: number
  height: number
}) {
  const line = 'absolute bg-white/50 shadow-[0_0_0_0.5px_rgba(0,0,0,0.4)]'
  return (
    <div
      data-testid="preview-guides"
      data-mode={mode}
      className="pointer-events-none absolute z-10"
      style={{ left, top, width, height }}
    >
      {mode === 'thirds' ? (
        <>
          {[1, 2].map((i) => (
            <span
              key={`v${i}`}
              className={`${line} inset-y-0 w-px`}
              style={{ left: `${(i * 100) / 3}%` }}
            />
          ))}
          {[1, 2].map((i) => (
            <span
              key={`h${i}`}
              className={`${line} inset-x-0 h-px`}
              style={{ top: `${(i * 100) / 3}%` }}
            />
          ))}
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60" />
        </>
      ) : (
        <>
          {/* Vùng bị che: trên 12%, dưới 22%, phải 14%. */}
          <span className="absolute inset-x-0 top-0 bg-red-500/20" style={{ height: '12%' }} />
          <span className="absolute inset-x-0 bottom-0 bg-red-500/20" style={{ height: '22%' }} />
          <span
            className="absolute right-0 bg-red-500/20"
            style={{ top: '12%', bottom: '22%', width: '14%' }}
          />
          <span
            className="absolute border border-dashed border-white/70"
            style={{ top: '12%', bottom: '22%', left: '4%', right: '14%' }}
          />
        </>
      )}
    </div>
  )
}
