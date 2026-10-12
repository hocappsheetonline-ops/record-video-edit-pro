import { useEffect, useRef } from 'react'
import { getMicStream, stopStream } from '../lib/media'

/** Thanh hiển thị mức âm lượng micro để người dùng biết micro đang nhận tiếng. */
export function MicMeter({ deviceId }: { deviceId: string }) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let frame = 0
    let cancelled = false
    void getMicStream(deviceId).then(
      (s) => {
        if (cancelled) return stopStream(s)
        stream = s
        context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 512
        context.createMediaStreamSource(s).connect(analyser)
        const data = new Float32Array(analyser.fftSize)
        const tick = () => {
          analyser.getFloatTimeDomainData(data)
          const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
          if (barRef.current) barRef.current.style.width = `${Math.min(100, rms * 400)}%`
          frame = requestAnimationFrame(tick)
        }
        tick()
      },
      () => undefined,
    )
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      void context?.close()
      stopStream(stream)
    }
  }, [deviceId])

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div
        ref={barRef}
        className="h-full w-0 rounded-full bg-success transition-[width] duration-75"
      />
    </div>
  )
}
