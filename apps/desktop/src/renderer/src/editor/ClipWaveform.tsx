import { memo } from 'react'
import { waveformSlice, type Clip, type Waveform } from '@lumora/core'

/** Số cột: khoảng 1 cột cho mỗi 60ms nguồn, đủ mịn khi timeline dài mà vẫn nhẹ. */
function barCount(clip: Clip): number {
  return Math.max(4, Math.min(800, Math.ceil((clip.sourceEnd - clip.sourceStart) / 60)))
}

/**
 * Dạng sóng âm thanh vẽ đối xứng lên/xuống bên trong clip video, theo đúng đoạn nguồn của clip
 * (đã cắt, đổi tốc độ thì clip co giãn và sóng co giãn theo).
 */
/** Vẽ các cột dạng sóng đối xứng lên/xuống (một path SVG, giãn theo khung chứa). */
export function WaveBars({ bars, testId }: { bars: readonly number[]; testId?: string }) {
  const d = bars
    .map((v, i) => {
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
 * Dạng sóng âm thanh vẽ đối xứng lên/xuống bên trong clip video, theo đúng đoạn nguồn của clip
 * (đã cắt, đổi tốc độ thì clip co giãn và sóng co giãn theo).
 */
export const ClipWaveform = memo(function ClipWaveform({
  clip,
  waveform,
}: {
  clip: Clip
  waveform: Waveform
}) {
  const bars = waveformSlice(waveform, clip.sourceStart, clip.sourceEnd, barCount(clip))
  return <WaveBars bars={bars} testId="clip-waveform" />
})
