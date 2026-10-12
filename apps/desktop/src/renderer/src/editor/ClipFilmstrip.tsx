import { memo, useEffect, useRef, useState } from 'react'
import { thumbAt, type Clip, type Filmstrip } from '@lumora/core'
import { mediaUrl } from '../lib/media'

/** Theo dõi chiều rộng thật của phần tử (px) để biết cần bao nhiêu ảnh thu nhỏ. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Dải phim kiểu CapCut: các ảnh thu nhỏ nối nhau lấp đầy chiều rộng clip, mỗi ảnh lấy đúng khung
 * hình ở vị trí đó của clip (theo thời gian nguồn đã cắt).
 */
export const ClipFilmstrip = memo(function ClipFilmstrip({
  clip,
  filmstrip,
  folder,
  height,
}: {
  clip: Clip
  filmstrip: Filmstrip
  folder: string
  height: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tileW = (filmstrip.thumb.width / filmstrip.thumb.height) * height
  const count = width > 0 ? Math.ceil(width / tileW) : 0
  const span = clip.sourceEnd - clip.sourceStart
  return (
    <div ref={ref} className="absolute inset-0 flex overflow-hidden" data-testid="clip-filmstrip">
      {Array.from({ length: count }, (_, i) => {
        // Mỗi ô lấy khung hình ở mép trái của nó (ô đầu = khung đầu clip), giống CapCut.
        const at = clip.sourceStart + Math.min(1, (i * tileW) / width) * span
        const hit = thumbAt(filmstrip, at)
        if (!hit) return null
        return (
          <div
            key={i}
            data-testid="filmstrip-tile"
            className="h-full shrink-0"
            style={{
              width: tileW,
              backgroundImage: `url("${mediaUrl(folder, hit.sheet.file)}")`,
              backgroundSize: `${hit.sheet.columns * tileW}px ${hit.sheet.rows * height}px`,
              backgroundPosition: `${-hit.column * tileW}px ${-hit.row * height}px`,
            }}
          />
        )
      })}
    </div>
  )
})
