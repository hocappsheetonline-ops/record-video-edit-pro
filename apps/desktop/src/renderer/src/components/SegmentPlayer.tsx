import { useEffect, useRef } from 'react'
import type { Segment, TrackKind } from '@lumora/core'
import { mediaUrl } from '../lib/media'
import { needsResync, syncedTime } from '../lib/sync'

type Media = HTMLVideoElement | HTMLAudioElement

/**
 * Phát một đoạn quay: video màn hình là track chính, webcam/micro/âm thanh máy chạy theo
 * và được căn lại theo thời điểm bắt đầu ghi của từng track.
 */
export function SegmentPlayer({ folder, segment }: { folder: string; segment: Segment }) {
  const screenRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const micRef = useRef<HTMLAudioElement>(null)
  const systemRef = useRef<HTMLAudioElement>(null)
  const { tracks } = segment
  const masterKind: TrackKind | null = tracks.screen ? 'screen' : tracks.camera ? 'camera' : null

  useEffect(() => {
    const elements: Record<TrackKind, Media | null> = {
      screen: screenRef.current,
      camera: cameraRef.current,
      mic: micRef.current,
      system: systemRef.current,
    }
    const master = masterKind ? elements[masterKind] : null
    const masterTrack = masterKind ? tracks[masterKind] : undefined
    if (!master || !masterTrack) return
    const followers = (Object.keys(tracks) as TrackKind[])
      .filter((k) => k !== masterKind)
      .map((k) => ({ el: elements[k], startedAt: tracks[k]!.startedAt }))
      .filter((f): f is { el: Media; startedAt: number } => !!f.el)

    let frame = 0
    const sync = (force: boolean) => {
      for (const { el, startedAt } of followers) {
        const target = syncedTime(master.currentTime, masterTrack.startedAt, startedAt)
        if (target < 0 || (Number.isFinite(el.duration) && target > el.duration)) {
          if (!el.paused) el.pause()
          continue
        }
        if (force || needsResync(el.currentTime, target)) el.currentTime = target
        if (master.paused && !el.paused) el.pause()
        if (!master.paused && el.paused) void el.play().catch(() => undefined)
        el.playbackRate = master.playbackRate
      }
    }
    const loop = () => {
      sync(false)
      if (!master.paused) frame = requestAnimationFrame(loop)
    }
    const onPlay = () => {
      cancelAnimationFrame(frame)
      loop()
    }
    const onPause = () => {
      cancelAnimationFrame(frame)
      sync(true)
    }
    const onSeeked = () => sync(true)
    master.addEventListener('play', onPlay)
    master.addEventListener('pause', onPause)
    master.addEventListener('seeked', onSeeked)
    master.addEventListener('ratechange', onSeeked)
    return () => {
      cancelAnimationFrame(frame)
      master.removeEventListener('play', onPlay)
      master.removeEventListener('pause', onPause)
      master.removeEventListener('seeked', onSeeked)
      master.removeEventListener('ratechange', onSeeked)
    }
  }, [masterKind, tracks])

  const src = (kind: TrackKind) => mediaUrl(folder, tracks[kind]!.file)

  return (
    <div className="relative overflow-hidden rounded-xl bg-black" data-testid="segment-player">
      {tracks.screen && (
        <video
          ref={screenRef}
          src={src('screen')}
          controls
          playsInline
          preload="metadata"
          data-testid="player-screen"
          className="aspect-video w-full"
        />
      )}
      {tracks.camera && (
        <video
          ref={cameraRef}
          src={src('camera')}
          controls={masterKind === 'camera'}
          muted
          playsInline
          preload="metadata"
          data-testid="player-camera"
          className={
            masterKind === 'camera'
              ? 'aspect-video w-full'
              : 'pointer-events-none absolute bottom-14 right-4 size-36 rounded-full border-2 border-white/80 object-cover shadow-xl'
          }
        />
      )}
      {tracks.mic && (
        <audio ref={micRef} src={src('mic')} preload="auto" data-testid="player-mic" />
      )}
      {tracks.system && (
        <audio ref={systemRef} src={src('system')} preload="auto" data-testid="player-system" />
      )}
    </div>
  )
}
