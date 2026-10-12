import { memo, useEffect, useRef, useState } from 'react'
import { VolumeX } from 'lucide-react'
import { clipGain, waveformSlice, type Clip, type Waveform } from '@lumora/core'

/** Mỗi cột rộng 2px, cách nhau 1px (kiểu CapCut): sắc nét ở mọi mức phóng timeline. */
const BAR_PITCH_PX = 3

/** Số cột: theo chiều rộng thật của clip; chưa đo được thì ~1 cột cho mỗi 60ms nguồn. */
function barCount(clip: Clip, width: number): number {
  if (width > 0) return Math.max(4, Math.min(1200, Math.floor(width / BAR_PITCH_PX)))
  return Math.max(4, Math.min(800, Math.ceil((clip.sourceEnd - clip.sourceStart) / 60)))
}

/**
 * Vẽ các cột dạng sóng (một path SVG, giãn theo khung chứa). `align="center"`: đối xứng lên/xuống;
 * `align="bottom"`: mọc từ đáy lên như dải âm thanh dưới clip video của CapCut.
 */
export function WaveBars({
  bars,
  testId,
  align = 'center',
}: {
  bars: readonly number[]
  testId?: string
  align?: 'center' | 'bottom'
}) {
  const d = bars
    .map((v, i) => {
      if (align === 'bottom') {
        const h = Math.max(4, v * 100)
        return `M${i + 0.17} ${100 - h}h0.66v${h}h-0.66z`
      }
      const h = Math.max(1.5, v * 46)
      return `M${i + 0.15} ${50 - h}h0.7v${h * 2}h-0.7z`
    })
    .join('')
  return (
    <svg
      data-testid={testId}
      data-bars={bars.length}
      aria-hidden
      viewBox={`0 0 ${Math.max(1, bars.length)} 100`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/**
 * Dạng sóng âm thanh bên trong clip video, theo đúng đoạn nguồn của clip (đã cắt, đổi tốc độ
 * thì clip co giãn và sóng co giãn theo). Clip tắt tiếng thì sóng mờ đi kèm biểu tượng loa tắt.
 */
export const ClipWaveform = memo(function ClipWaveform({
  clip,
  waveform,
}: {
  clip: Clip
  waveform: Waveform
}) {
  const ref = useRef<HTMLDivElement>(null)
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
  const muted = clipGain(clip, 'mic') === 0 && clipGain(clip, 'system') === 0
  const bars = waveformSlice(waveform, clip.sourceStart, clip.sourceEnd, barCount(clip, width))
  return (
    <div
      ref={ref}
      className={`absolute inset-x-0.5 inset-y-0 ${muted ? 'opacity-35' : ''}`}
      data-muted={muted || undefined}
    >
      <WaveBars bars={bars} testId="clip-waveform" align="bottom" />
      {muted && (
        <VolumeX
          size={12}
          aria-hidden
          data-testid="clip-waveform-muted"
          className="absolute left-1 top-1/2 -translate-y-1/2 text-white"
        />
      )}
    </div>
  )
})
