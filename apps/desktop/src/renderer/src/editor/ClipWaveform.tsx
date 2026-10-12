import { memo } from 'react'
import { waveformSlice, type Clip, type Waveform } from '@lumora/core'

/** Số điểm: khoảng 1 điểm cho mỗi 60ms nguồn, đủ mịn khi timeline dài mà vẫn nhẹ. */
function barCount(clip: Clip): number {
  return Math.max(4, Math.min(800, Math.ceil((clip.sourceEnd - clip.sourceStart) / 60)))
}

/** Làm mượt nhẹ (trung bình có trọng số 3 điểm) để đường bao liền mạch thay vì răng cưa. */
function smooth(values: readonly number[]): number[] {
  if (values.length < 3) return [...values]
  return values.map((v, i) => {
    const a = values[i - 1] ?? v
    const b = values[i + 1] ?? v
    return (a + 2 * v + b) / 4
  })
}

/** Nửa chiều cao (trên thang 0–50) của một điểm; luôn có một vạch mỏng ở chỗ im lặng. */
const half = (v: number) => Math.max(1.2, v * 47)

/**
 * Đường dẫn SVG của dạng sóng kiểu CapCut: một vùng tô liền, đối xứng qua trục giữa (y = 50),
 * đi qua đường bao trên rồi quay về theo đường bao dưới. Toạ độ x là chỉ số điểm (viewBox giãn
 * theo khung chứa).
 */
export function wavePath(bars: readonly number[]): string {
  const env = smooth(bars)
  const n = Math.max(1, env.length)
  const top = env.map((v, i) => `L${i + 0.5} ${(50 - half(v)).toFixed(1)}`).join('')
  const bottom = env
    .map((v, i) => `L${i + 0.5} ${(50 + half(v)).toFixed(1)}`)
    .reverse()
    .join('')
  return `M0 50${top}L${n} 50${bottom}Z`
}

/**
 * Dạng sóng âm thanh (giống CapCut): vùng tô liền đối xứng lên / xuống, màu lấy từ
 * `currentColor` của khung chứa, giãn theo chiều rộng và chiều cao của khung.
 */
export function WaveBars({ bars, testId }: { bars: readonly number[]; testId?: string }) {
  return (
    <svg
      data-testid={testId}
      data-bars={bars.length}
      aria-hidden
      viewBox={`0 0 ${Math.max(1, bars.length)} 100`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path d={wavePath(bars)} fill="currentColor" />
    </svg>
  )
}

/**
 * Dạng sóng của clip video, theo đúng đoạn nguồn của clip (đã cắt, đổi tốc độ thì clip co giãn
 * và sóng co giãn theo).
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
