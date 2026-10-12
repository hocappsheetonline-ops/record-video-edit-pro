import {
  containRect,
  coverCrop,
  studioSlots,
  type LiveComment,
  type Rect,
  type Size,
  type StudioLayout,
} from '@lumora/core'

export interface StudioState {
  layout: StudioLayout
  banner: string
  showBanner: boolean
  showNames: boolean
  featured: LiveComment | null
  caption: string
  background: string
}

interface Participant {
  id: string
  name: string
  video: HTMLVideoElement
  audioEl: HTMLAudioElement | null
  stream: MediaStream
  onStage: boolean
  gain: GainNode
  source: MediaStreamAudioSourceNode | null
  /** Bản trộn "mix-minus" gửi cho khách: mọi người trừ chính họ. */
  minus: MediaStreamAudioDestinationNode | null
}

export const HOST_ID = 'host'

function makeVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  return video
}

function rounded(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.min(radius, r.width / 2, r.height / 2)
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.width, r.height, rad)
}

/**
 * Bộ ghép cảnh của studio: vẽ màn hình chia sẻ, host, khách, banner, bình luận nổi bật và phụ đề
 * lên canvas 30 lần/giây; trộn âm thanh người trên sóng thành âm thanh chương trình.
 */
export class StudioEngine {
  readonly canvas: HTMLCanvasElement
  readonly audio: AudioContext
  private readonly program: MediaStreamAudioDestinationNode
  private readonly participants = new Map<string, Participant>()
  private screen: {
    video: HTMLVideoElement
    stream: MediaStream
    source: MediaStreamAudioSourceNode | null
  } | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private videoStream: MediaStream | null = null
  state: StudioState = {
    layout: 'grid',
    banner: '',
    showBanner: false,
    showNames: true,
    featured: null,
    caption: '',
    background: '#111827',
  }
  /** Hàm lấy phụ đề hiện tại (gọi mỗi khung hình). */
  captionSource: (() => string) | null = null

  constructor(
    readonly size: Size,
    readonly fps = 30,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = size.width
    this.canvas.height = size.height
    this.audio = new AudioContext({ sampleRate: 48_000 })
    this.program = this.audio.createMediaStreamDestination()
    this.timer = setInterval(() => this.render(), 1000 / fps)
  }

  private addParticipant(
    id: string,
    name: string,
    stream: MediaStream,
    monitor: boolean,
  ): Participant {
    const video = makeVideo()
    video.srcObject = stream
    void video.play().catch(() => undefined)
    // Chromium chỉ đưa âm thanh WebRTC vào WebAudio khi luồng đang được một thẻ audio phát.
    let audioEl: HTMLAudioElement | null = null
    if (monitor && stream.getAudioTracks().length > 0) {
      audioEl = document.createElement('audio')
      audioEl.srcObject = stream
      void audioEl.play().catch(() => undefined)
    }
    const gain = this.audio.createGain()
    gain.gain.value = 0
    gain.connect(this.program)
    const participant: Participant = {
      id,
      name,
      video,
      audioEl,
      stream,
      onStage: false,
      gain,
      source: null,
      minus: null,
    }
    this.attachAudio(participant)
    this.participants.set(id, participant)
    return participant
  }

  private attachAudio(p: Participant) {
    p.source?.disconnect()
    p.source = null
    if (p.stream.getAudioTracks().length > 0) {
      p.source = this.audio.createMediaStreamSource(p.stream)
      p.source.connect(p.gain)
    }
  }

  /** Webcam và micro của host. */
  setHost(stream: MediaStream, name: string) {
    const existing = this.participants.get(HOST_ID)
    const onStage = existing?.onStage ?? true
    if (existing) this.removeParticipant(HOST_ID)
    this.addParticipant(HOST_ID, name, stream, false)
    this.setOnStage(HOST_ID, onStage)
    this.rewireMinus()
  }

  addGuest(id: string, name: string) {
    if (this.participants.has(id)) return
    this.addParticipant(id, name, new MediaStream(), true)
    this.participants.get(id)!.minus = this.audio.createMediaStreamDestination()
    this.rewireMinus()
  }

  addGuestTrack(id: string, track: MediaStreamTrack) {
    const p = this.participants.get(id)
    if (!p) return
    p.stream.addTrack(track)
    p.video.srcObject = p.stream
    void p.video.play().catch(() => undefined)
    if (track.kind === 'audio') {
      if (!p.audioEl) {
        p.audioEl = document.createElement('audio')
        p.audioEl.srcObject = p.stream
        void p.audioEl.play().catch(() => undefined)
      }
      this.attachAudio(p)
    }
  }

  removeParticipant(id: string) {
    const p = this.participants.get(id)
    if (!p) return
    p.source?.disconnect()
    p.gain.disconnect()
    p.video.srcObject = null
    if (p.audioEl) p.audioEl.srcObject = null
    this.participants.delete(id)
    this.rewireMinus()
  }

  setOnStage(id: string, onStage: boolean) {
    const p = this.participants.get(id)
    if (!p) return
    p.onStage = onStage
    p.gain.gain.setTargetAtTime(onStage ? 1 : 0, this.audio.currentTime, 0.05)
  }

  rename(id: string, name: string) {
    const p = this.participants.get(id)
    if (p) p.name = name
  }

  isOnStage(id: string): boolean {
    return this.participants.get(id)?.onStage ?? false
  }

  /** Hình của một người (để hiện thu nhỏ trong danh sách). */
  videoOf(id: string): HTMLVideoElement | null {
    return this.participants.get(id)?.video ?? null
  }

  /** Nối lại các bản trộn mix-minus: mỗi khách nghe mọi người khác (kể cả khi chưa lên sóng thì nghe chương trình). */
  private rewireMinus() {
    for (const target of this.participants.values()) {
      if (!target.minus) continue
      for (const source of this.participants.values()) {
        try {
          source.gain.disconnect(target.minus)
        } catch {
          // chưa từng nối
        }
        if (source.id !== target.id) source.gain.connect(target.minus)
      }
    }
  }

  setScreen(stream: MediaStream | null) {
    if (this.screen) {
      this.screen.source?.disconnect()
      this.screen.stream.getTracks().forEach((t) => t.stop())
      this.screen = null
    }
    if (!stream) return
    const video = makeVideo()
    video.srcObject = stream
    void video.play().catch(() => undefined)
    let source: MediaStreamAudioSourceNode | null = null
    if (stream.getAudioTracks().length > 0) {
      source = this.audio.createMediaStreamSource(stream)
      source.connect(this.program)
    }
    this.screen = { video, stream, source }
  }

  /** Gắn canvas chương trình vào một khung trên trang; trả về hàm gỡ ra. */
  attach(container: HTMLElement): () => void {
    const canvas = this.canvas
    canvas.className = 'h-full w-full rounded-lg bg-black object-contain'
    canvas.dataset.testid = 'live-program'
    container.appendChild(canvas)
    return () => {
      if (canvas.parentElement === container) container.removeChild(canvas)
    }
  }

  get hasScreen(): boolean {
    return this.screen !== null
  }

  /** Luồng chương trình (hình + tiếng) để phát đi. */
  programStream(): MediaStream {
    this.videoStream ??= this.canvas.captureStream(this.fps)
    return new MediaStream([
      ...this.videoStream.getVideoTracks(),
      ...this.program.stream.getAudioTracks(),
    ])
  }

  /** Hình chương trình và âm thanh mix-minus gửi cho một khách. */
  guestFeed(id: string): { video: MediaStreamTrack | null; audio: MediaStreamTrack | null } {
    this.videoStream ??= this.canvas.captureStream(this.fps)
    return {
      video: this.videoStream.getVideoTracks()[0] ?? null,
      audio: this.participants.get(id)?.minus?.stream.getAudioTracks()[0] ?? null,
    }
  }

  /** Những người đang trên sóng, host luôn đứng đầu. */
  stagePeople(): Participant[] {
    return [...this.participants.values()]
      .filter((p) => p.onStage)
      .sort((a, b) => (a.id === HOST_ID ? -1 : b.id === HOST_ID ? 1 : 0))
  }

  render() {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = this.size
    const s = this.state
    ctx.fillStyle = s.background
    ctx.fillRect(0, 0, width, height)
    const people = this.stagePeople()
    const slots = studioSlots(s.layout, this.size, people.length, this.hasScreen)
    const radius = height * 0.015

    if (slots.screen && this.screen) {
      const v = this.screen.video
      if (v.videoWidth > 0) {
        const r = containRect({ width: v.videoWidth, height: v.videoHeight }, slots.screen)
        ctx.save()
        rounded(ctx, r, radius)
        ctx.clip()
        ctx.drawImage(v, r.x, r.y, r.width, r.height)
        ctx.restore()
      }
    }

    people.forEach((p, i) => {
      const slot = slots.people[i]
      if (!slot) return
      ctx.save()
      rounded(ctx, slot, radius)
      ctx.fillStyle = '#1f2937'
      ctx.fill()
      ctx.clip()
      const v = p.video
      if (v.videoWidth > 0) {
        const crop = coverCrop({ width: v.videoWidth, height: v.videoHeight }, slot)
        ctx.drawImage(
          v,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          slot.x,
          slot.y,
          slot.width,
          slot.height,
        )
      } else {
        ctx.fillStyle = '#9ca3af'
        ctx.font = `600 ${Math.round(slot.height * 0.25)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          p.name.slice(0, 1).toUpperCase(),
          slot.x + slot.width / 2,
          slot.y + slot.height / 2,
        )
      }
      ctx.restore()
      if (s.showNames) this.nameTag(ctx, p.name, slot)
    })

    if (s.featured) this.commentCard(ctx, s.featured)
    if (s.showBanner && s.banner.trim()) this.banner(ctx, s.banner.trim())
    const caption = this.captionSource?.() ?? s.caption
    if (caption) this.captionBox(ctx, caption)
  }

  private nameTag(ctx: CanvasRenderingContext2D, name: string, slot: Rect) {
    const size = Math.max(12, Math.round(this.size.height * 0.022))
    ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`
    const w = ctx.measureText(name).width + size
    const h = size * 1.6
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    rounded(
      ctx,
      { x: slot.x + size * 0.5, y: slot.y + slot.height - h - size * 0.5, width: w, height: h },
      size * 0.3,
    )
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(name, slot.x + size, slot.y + slot.height - h / 2 - size * 0.5)
  }

  private banner(ctx: CanvasRenderingContext2D, text: string) {
    const { width, height } = this.size
    const size = Math.round(height * 0.035)
    const h = size * 2
    ctx.fillStyle = '#2563eb'
    ctx.fillRect(0, height - h, width, h)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(text, size, height - h / 2, width - size * 2)
  }

  private commentCard(ctx: CanvasRenderingContext2D, comment: LiveComment) {
    const { width, height } = this.size
    const size = Math.round(height * 0.03)
    const w = Math.min(width * 0.6, width - size * 4)
    const x = size * 2
    const h = size * 3.4
    const y = height - h - size * (this.state.showBanner && this.state.banner ? 3.4 : 1.5)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    rounded(ctx, { x, y, width: w, height: h }, size * 0.4)
    ctx.fill()
    ctx.fillStyle = comment.platform === 'youtube' ? '#dc2626' : '#2563eb'
    ctx.font = `700 ${Math.round(size * 0.8)}px "Segoe UI", system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(comment.author, x + size * 0.6, y + size * 0.4, w - size * 1.2)
    ctx.fillStyle = '#111827'
    ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(comment.text, x + size * 0.6, y + size * 1.6, w - size * 1.2)
  }

  private captionBox(ctx: CanvasRenderingContext2D, text: string) {
    const { width, height } = this.size
    const size = Math.round(height * 0.04)
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`
    const w = Math.min(width * 0.85, ctx.measureText(text).width + size)
    const x = (width - w) / 2
    const y = height * 0.06
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    rounded(ctx, { x, y, width: w, height: size * 1.6 }, size * 0.3)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, y + size * 0.8, w - size)
  }

  dispose() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const id of [...this.participants.keys()]) this.removeParticipant(id)
    this.setScreen(null)
    this.videoStream?.getTracks().forEach((t) => t.stop())
    void this.audio.close()
  }
}
