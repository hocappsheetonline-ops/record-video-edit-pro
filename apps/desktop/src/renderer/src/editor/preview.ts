import {
  audioClipGain,
  audioClipMediaTime,
  clipGain,
  isDefaultFx,
  mediaTime,
  outputDuration,
  outputToSource,
  overlayMediaTime,
  segmentAt,
  sourceSegments,
  type AudioFx,
  type EditState,
  type Overlay,
  type Project,
  type Size,
  type SourceSegment,
  type TrackKind,
} from '@lumora/core'
import { mediaUrl } from '../lib/media'
import { drawScene, videoElementSource } from './draw'
import { imageSource } from './overlay-draw'
import { OverlayImages } from './overlay-images'
import { computeScene } from './scene'
import { fxKeyOf, useEditorStore } from './store'

type MediaEl = HTMLVideoElement | HTMLAudioElement
const RESYNC_S = 0.25

/** Phát thẻ media, bỏ qua lỗi (trình duyệt chặn tự phát, thẻ đã bị gỡ…). */
function safePlay(el: HTMLMediaElement) {
  try {
    void el.play()?.catch(() => undefined)
  } catch {
    // Môi trường không hỗ trợ phát (vd. khi chạy test): bỏ qua.
  }
}

/**
 * Xem trước khi chỉnh sửa: dùng thẻ video/audio có sẵn (giải mã phần cứng, phát mượt),
 * đồng hồ riêng chạy theo timeline đã cắt, và vẽ mỗi khung bằng đúng hàm dùng khi xuất.
 */
export class PreviewEngine {
  private readonly segments: SourceSegment[]
  private readonly media = new Map<string, MediaEl>()
  /** File gốc của từng thẻ media (theo `${đoạn}:${track}`). */
  private readonly mediaFiles = new Map<string, string>()
  private frame = 0
  private lastTick = 0
  private disposed = false

  /** Ảnh / GIF meme của lớp nổi. */
  private readonly images: OverlayImages
  /** Thẻ audio cho từng đoạn nhạc/hiệu ứng (theo id đoạn). */
  private readonly audioClips = new Map<string, HTMLAudioElement>()
  /** Thẻ video cho từng video meme (theo id lớp), phát cả tiếng. */
  private readonly overlayVideos = new Map<string, HTMLVideoElement>()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly project: Project,
    private readonly folder: string,
  ) {
    this.segments = sourceSegments(project.segments)
    this.images = new OverlayImages(folder, () => this.requestDraw())
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
        this.mediaFiles.set(`${item.segment.index}:${kind}`, track.file)
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
    const deps = [s.edit, s.time, s.videoSize, s.cursor, s.follow, s.selection, s.playing]
    return deps.some((d, i) => d !== this.drawn[i])
  }

  /** File cần phát: bản đã lọc tạp âm / hiệu ứng nếu đã xử lý xong (và không giữ "nghe bản gốc"). */
  private playable(file: string, fx: AudioFx | undefined): string {
    if (!fx || isDefaultFx(fx)) return file
    const store = useEditorStore.getState()
    store.ensureFx(file, fx)
    if (store.bypassFx) return file
    const out = store.fxFiles[fxKeyOf(file, fx)]
    return out && out !== 'pending' && out !== 'error' ? out : file
  }

  /** Đổi nguồn của thẻ media khi cần (giữ nguyên nếu không đổi để không phát lại từ đầu). */
  private setSource(el: MediaEl, file: string) {
    const src = mediaUrl(this.folder, file)
    if (el.dataset.src === src) return
    const at = el.currentTime
    el.dataset.src = src
    el.src = src
    el.currentTime = at
    // Ghi lại các file âm thanh đang dùng (để kiểm tra / gỡ lỗi xem trước).
    this.canvas.dataset.audio = [...this.media.values(), ...this.audioClips.values()]
      .map((m) => m.dataset.src?.split('/').pop() ?? '')
      .filter(Boolean)
      .join(' ')
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
      this.syncOverlayVideos(edit.overlays, useEditorStore.getState().time, playing)
      if (this.needsDraw || playing || this.changedSinceDraw())
        this.draw(edit, useEditorStore.getState().time)
    }
    this.frame = requestAnimationFrame(this.loop)
  }

  /** Giữ các thẻ media đúng vị trí: chỉ đoạn quay hiện tại phát, các đoạn khác dừng. */
  private sync(edit: EditState, time: number, playing: boolean) {
    const hit = outputToSource(edit.clips, time)
    const item = hit ? segmentAt(this.segments, hit.source) : null
    // Khung hình đứng yên: hình dừng đúng khung, không có tiếng.
    const frozen = !!hit?.position.clip.freeze
    for (const [key, el] of this.media) {
      const [segText, kind] = key.split(':') as [string, TrackKind]
      // Track có lọc tạp âm / hiệu ứng: đổi sang bản đã xử lý ngay cả khi chưa tới lượt phát.
      if (kind === 'mic' || kind === 'system') {
        const file = this.mediaFiles.get(key)
        if (file)
          this.setSource(
            el,
            this.playable(file, kind === 'mic' ? edit.audio.micFx : edit.audio.systemFx),
          )
      }
      const active = item && Number(segText) === item.segment.index
      const target = active && hit ? mediaTime(item, kind, hit.source) : null
      const outOfRange =
        target === null || target < 0 || (Number.isFinite(el.duration) && target > el.duration)
      if (outOfRange || (frozen && (kind === 'mic' || kind === 'system'))) {
        if (!el.paused) el.pause()
        continue
      }
      // Âm lượng chung × âm lượng riêng của clip (tắt tiếng clip = 0); đang ghi lồng tiếng thì
      // có thể tắt tiếng bản gốc.
      if (kind === 'mic' || kind === 'system') {
        const muted = useEditorStore.getState().muteOriginal
        el.volume = muted ? 0 : Math.min(1, edit.audio[kind] * clipGain(hit!.position.clip, kind))
      }
      const speed = hit!.position.clip.speed
      if (el.playbackRate !== speed) el.playbackRate = speed
      const drift = Math.abs(el.currentTime - target)
      if (playing && !frozen) {
        if (drift > RESYNC_S) el.currentTime = target
        if (el.paused) safePlay(el)
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
        this.audioClips.set(clip.id, el)
      }
      this.setSource(el, this.playable(clip.file, clip.fx))
      const at = audioClipMediaTime(clip, time)
      if (!playing || at === null) {
        if (!el.paused) el.pause()
        continue
      }
      el.volume = Math.min(1, audioClipGain(clip, time))
      const target = at / 1000
      if (Math.abs(el.currentTime - target) > RESYNC_S) el.currentTime = target
      if (el.paused) safePlay(el)
    }
  }

  /** Video meme: đúng khung theo đầu phát (kể cả khi đang dừng / kéo), phát kèm tiếng. */
  private syncOverlayVideos(overlays: readonly Overlay[], time: number, playing: boolean) {
    const videos = overlays.filter((o) => o.kind === 'video')
    const ids = new Set(videos.map((o) => o.id))
    for (const [id, el] of this.overlayVideos) {
      if (ids.has(id)) continue
      el.pause()
      el.removeAttribute('src')
      el.load()
      this.overlayVideos.delete(id)
    }
    for (const o of videos) {
      const src = mediaUrl(this.folder, o.file)
      let el = this.overlayVideos.get(o.id)
      if (!el || el.dataset.src !== src) {
        el?.pause()
        el = document.createElement('video')
        // Cùng gốc với canvas nháp để đọc được điểm ảnh khi xóa phông.
        el.crossOrigin = 'anonymous'
        el.preload = 'auto'
        el.playsInline = true
        el.dataset.src = src
        el.src = src
        el.addEventListener('loadeddata', () => this.requestDraw())
        el.addEventListener('seeked', () => this.requestDraw())
        this.overlayVideos.set(o.id, el)
      }
      const active = time >= o.start && time < o.end
      if (!active) {
        if (!el.paused) el.pause()
        continue
      }
      el.muted = !o.hasAudio || o.volume <= 0
      el.volume = Math.min(1, o.volume)
      const target = overlayMediaTime(o, time) / 1000
      const drift = Math.abs(el.currentTime - target)
      if (playing) {
        if (drift > RESYNC_S) el.currentTime = target
        if (el.paused) safePlay(el)
        this.needsDraw = true
      } else {
        if (!el.paused) el.pause()
        if (drift > 0.02) el.currentTime = target
      }
    }
  }

  private draw(edit: EditState, time: number) {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    this.needsDraw = false
    const store = useEditorStore.getState()
    this.drawn = [
      store.edit,
      store.time,
      store.videoSize,
      store.cursor,
      store.follow,
      store.selection,
      store.playing,
    ]
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
      time,
      output: size,
      video: store.videoSize,
      source,
      cursor: store.cursor,
      follow: store.follow,
      hasCamera: !!camera,
    })
    for (const item of scene.overlays)
      if (item.overlay.kind === 'image') void this.images.load(item.overlay.file)
    // Lớp đang chọn khi tạm dừng: hiện đứng yên để thấy và chỉnh được.
    const { selection, playing } = store
    if (!playing && selection?.kind === 'overlay')
      scene.overlays = scene.overlays.map((item) =>
        item.overlay.id === selection.id ? { ...item, still: true } : item,
      )
    const overlayVideos = this.overlayVideos
    drawScene(ctx, scene, {
      screen: screen instanceof HTMLVideoElement ? videoElementSource(screen) : null,
      camera: camera instanceof HTMLVideoElement ? videoElementSource(camera) : null,
      overlayMedia: (o, local) => {
        if (o.kind !== 'video') return imageSource(this.images.frameAt(o.file, local))
        const el = overlayVideos.get(o.id)
        return el ? videoElementSource(el) : null
      },
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
    for (const el of this.overlayVideos.values()) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    this.overlayVideos.clear()
    this.images.dispose()
  }
}
