import { useEffect, useRef, useState } from 'react'
import { getCameraStream, stopStream } from '../lib/media'

/** Đổi webcam thì gắn `key` mới để component khởi tạo lại từ đầu. */
export function CameraPreview({ deviceId }: { deviceId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    getCameraStream(deviceId).then(
      (s) => {
        if (cancelled) return stopStream(s)
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      },
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
      stopStream(stream)
    }
  }, [deviceId])

  if (failed) return null
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      data-testid="camera-preview"
      className="aspect-video w-full rounded-lg bg-black object-cover"
    />
  )
}
