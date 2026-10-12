import {
  audioClipGain,
  audioClipMediaTime,
  mediaTime,
  outputDuration,
  outputToSource,
  segmentAt,
  sourceSegments,
  type EditState,
  type Project,
  type Size,
  type SourceSegment,
  type TrackKind,
} from '@lumora/core'
import { mediaUrl } from '../lib/media'
import { drawScene, videoElementSource } from './draw'
import { computeScene } from './scene'
import { useEditorStore } from './store'

type MediaEl = HTMLVideoElement | HTMLAudioElement
const RESYNC_S = 0.25

/**
 * Xem trước khi chỉnh sửa: dùng thẻ video/audio có sẵn (giải mã phần cứng, phát mượt),
 * đồng hồ riêng chạy theo timeline đã cắt, và vẽ mỗi khung bằng đúng hàm dùng khi xuất.
 */
export class PreviewEngine {
  private readonly segments: SourceSegment[]
  private readonly media = new Map<string, MediaEl>()
  private frame = 0
  private lastTick = 0
  private disposed = false

  /** Thẻ audio cho từng đoạn nhạc/hiệu ứng (theo id đoạn). */
  private readonly audioClips = new Map<string, HTMLAudioElement>()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly project: Project,
    private readonly folder: string,
  ) {
    this.segments = sourceSegments(project.segments)
    for (const item of this.segments) {
      for (const kind of ['screen', 'camera', 'mic', 'system'] as TrackKind[]) {
        const track = item.segment.tracks[kind]
        if (!track) continue
        const el = document.createElement(
          kind === 'screen' || kind === 'camera' ? 'video' : 'audio',
        )
        el.src = mediaUrl(folder, track.file)
        el.preload = 'auto'
        el.muted = kind === 'screen' || kind === 'camera'
        if (el instanceof HTMLVideoElement) el.playsInline = true
        el.addEventListener('loadeddata', () => this.requestDraw())
        el.addEventListener('seeked', () => this.requestDraw())
        if (kind === 'screen') {
          el.addEventListener('loadedmetadata', () => {
            const v = el as HTMLVideoElement
            if (v.videoWidth > 0)
              useEditorStore.getState().setVideoSize({ width: v.videoWidth, height: v.videoHeight })
          })
        }
        this.media.set(`${item.segment.index}:${kind}`, el)
      }
    }
    this.loop = this.loop.bind(this)
    this.frame = requestAnimationFrame(this.loop)
  }

  private needsDraw = true
  requestDraw() {
    this.needsDraw = true
  }

  /** Những gì quyết định khung hình lần vẽ trước; đổi bất kỳ cái nào (kể cả khi đang dừng) là vẽ lại. */
  private drawn: unknown[] = []
  private changedSinceDraw(): boolean {
    const s = useEditorStore.getState()
    const deps = [s.edit, s.time, s.videoSize, s.cursor, s.follow]
    return deps.some((d, i) => d !== this.drawn[i])
  }

  private el(segment: number, kind: TrackKind): MediaEl | undefined {
    return this.media.get(`${segment}:${kind}`)
  }

  private loop(now: number) {
    if (this.disposed) return
    const store = useEditorStore.getState()
    const { edit, playing } = store
    if (edit) {
      if (playing) {
        const dt = this.lastTick ? now - this.lastTick : 0
        const duration = outputDuration(edit.clips)
        const next = store.time + dt
        if (next >= duration) {
          store.setTime(duration)
          store.setPlaying(false)
        } else store.setTime(next)
        this.needsDraw = true
      }
      this.lastTick = playing ? now : 0
      this.sync(edit, useEditorStore.getState().time, playing)
      this.syncAudioClips(edit, useEditorStore.getState().time, playing)
      if (this.needsDraw || playing || this.changedSinceDraw())
        this.draw(edit, useEditorStore.getState().time)
    }
    this.frame = requestAnimationFrame(this.loop)
  }

  /** Giữ các thẻ media đúng vị trí: chỉ đoạn quay hiện tại phát, các đoạn khác dừng. */
  private sync(edit: EditState, time: number, playing: boolean) {
    const hit = outputToSource(edit.clips, time)
    const item = hit ? segmentAt(this.segments, hit.source) : null
    for (const [key, el] of this.media) {
      const [segText, kind] = key.split(':') as [string, TrackKind]
      const active = item && Number(segText) === item.segment.index
      const target = active && hit ? mediaTime(item, kind, hit.source) : null
      if (target === null || target < 0 || (Number.isFinite(el.duration) && target > el.duration)) {
        if (!el.paused) el.pause()
        continue
      }
      if (kind === 'mic') el.volume = Math.min(1, edit.audio.mic)
      if (kind === 'system') el.volume = Math.min(1, edit.audio.system)
      const speed = hit!.position.clip.speed
      if (el.playbackRate !== speed) el.playbackRate = speed
      const drift = Math.abs(el.currentTime - target)
      if (playing) {
        if (drift > RESYNC_S) el.currentTime = target
        if (el.paused) void el.play().catch(() => undefined)
      } else {
        if (!el.paused) el.pause()
        if (drift > 0.02) el.currentTime = target
      }
    }
  }

  /** Nhạc nền / hiệu ứng: phát đúng đoạn, đúng vị trí trong file, âm lượng theo fade. */
  private syncAudioClips(edit: EditState, time: number, playing: boolean) {
    const ids = new Set(edit.audioClips.map((c) => c.id))
    for (const [id, el] of this.audioClips) {
      if (ids.has(id)) continue
      el.pause()
      el.removeAttribute('src')
      this.audioClips.delete(id)
    }
    for (const clip of edit.audioClips) {
      let el = this.audioClips.get(clip.id)
      if (!el) {
        el = document.createElement('audio')
        el.preload = 'auto'
        el.src = mediaUrl(this.folder, clip.file)
        this.audioClips.set(clip.id, el)
      }
      const at = audioClipMediaTime(clip, time)
      if (!playing || at === null) {
        if (!el.paused) el.pause()
        continue
      }
      el.volume = Math.min(1, audioClipGain(clip, time))
      const target = at / 1000
      if (Math.abs(el.currentTime - target) > RESYNC_S) el.currentTime = target
      if (el.paused) void el.play().catch(() => undefined)
    }
  }

  private draw(edit: EditState, time: number) {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    this.needsDraw = false
    const store = useEditorStore.getState()
    this.drawn = [store.edit, store.time, store.videoSize, store.cursor, store.follow]
    const hit = outputToSource(edit.clips, time)
    const source = hit?.source ?? 0
    const item = segmentAt(this.segments, source)
    const size = this.outputSize()
    if (this.canvas.width !== size.width || this.canvas.height !== size.height) {
      this.canvas.width = size.width
      this.canvas.height = size.height
    }
    const screen = item ? this.el(item.segment.index, 'screen') : undefined
    const camera = item ? this.el(item.segment.index, 'camera') : undefined
    const scene = computeScene({
      edit,
      output: size,
      video: store.videoSize,
      source,
      cursor: store.cursor,
      follow: store.follow,
      hasCamera: !!camera,
    })
    drawScene(ctx, scene, {
      screen: screen instanceof HTMLVideoElement ? videoElementSource(screen) : null,
      camera: camera instanceof HTMLVideoElement ? videoElementSource(camera) : null,
    })
  }

  /** Xem trước ở độ phân giải vừa phải (cạnh ngắn 720) để nhẹ máy. */
  private outputSize(): Size {
    const { edit, videoSize } = useEditorStore.getState()
    const aspect = edit?.frame.aspect ?? '16:9'
    const ratio =
      aspect === '16:9'
        ? 16 / 9
        : aspect === '9:16'
          ? 9 / 16
          : aspect === '1:1'
            ? 1
            : aspect === '4:3'
              ? 4 / 3
              : videoSize.width / videoSize.height
    return ratio >= 1
      ? { width: Math.round(720 * ratio), height: 720 }
      : { width: 720, height: Math.round(720 / ratio) }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    for (const el of this.media.values()) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    this.media.clear()
    for (const el of this.audioClips.values()) {
      el.pause()
      el.removeAttribute('src')
    }
    this.audioClips.clear()
  }
}
