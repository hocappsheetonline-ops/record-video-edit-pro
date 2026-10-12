import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { rectFromPoints, type Point, type Rect } from '@lumora/core'
import { lumora } from '../api'
import { useViewLanguage } from './useViewLanguage'

const MIN_SIZE = 16

/** Lớp phủ toàn màn hình: kéo chuột để khoanh vùng quay. Tọa độ tính theo DIP của màn hình. */
export function RegionPicker() {
  const { t } = useTranslation()
  useViewLanguage()
  const [anchor, setAnchor] = useState<Point | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const dragging = useRef(false)

  const valid = rect !== null && rect.width >= MIN_SIZE && rect.height >= MIN_SIZE
  const submit = (value: Rect | null) => void lumora().submitRegion(value)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') submit(null)
      if (e.key === 'Enter' && valid) submit(rect)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rect, valid])

  const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY })
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    setAnchor(point(e))
    setRect(rectFromPoints(point(e), point(e)))
  }
  const onMove = (e: PointerEvent) => {
    if (dragging.current && anchor) setRect(rectFromPoints(anchor, point(e)))
  }
  const onUp = () => {
    dragging.current = false
  }

  const dpr = window.devicePixelRatio || 1
  return (
    <div
      data-testid="region-picker"
      className="fixed inset-0 cursor-crosshair select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* Làm tối phần ngoài vùng chọn bằng viền đổ bóng rất lớn. */}
      <div
        className="pointer-events-none absolute border-2 border-violet-400"
        style={
          rect
            ? {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)',
              }
            : { inset: 0, border: 'none', background: 'rgba(0,0,0,0.45)' }
        }
      />
      {!rect && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-lg font-medium text-white drop-shadow">
          {t('region.hint')}
        </div>
      )}
      {rect && valid && (
        <div
          className="absolute flex items-center gap-2"
          style={{ left: rect.x, top: Math.max(8, rect.y + rect.height + 8) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="rounded-md bg-black/80 px-2 py-1 font-mono text-xs text-white">
            {Math.round(rect.width * dpr)} × {Math.round(rect.height * dpr)}
          </span>
          <button
            type="button"
            data-testid="region-confirm"
            onClick={() => submit(rect)}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            {t('region.confirm')}
          </button>
          <button
            type="button"
            onClick={() => submit(null)}
            className="rounded-md bg-black/70 px-3 py-1.5 text-sm text-white hover:bg-black/90"
          >
            {t('region.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
