import { create } from 'zustand'
import {
  BEAUTY_PRESET,
  LiveCaptionBuffer,
  mergeComments,
  type LiveComment,
  type StudioLayout,
} from '@lumora/core'
import type { GuestRoom, LiveConfig, LiveEnded, LiveSecretsStatus, LiveStatus } from '@shared/ipc'
import { lumora } from '../api'
import { getCameraStream, getDesktopStream, getMicStream, stopStream } from '../lib/media'
import { ipcErrorMessage } from '../lib/prefs'
import { Broadcaster, CaptionChunker } from './broadcaster'
import { GuestHub, type GuestInfo } from './guest-hub'
import { HOST_ID, StudioEngine } from './studio'

export type LivePhase = 'idle' | 'starting' | 'live' | 'stopping'

interface LiveStore {
  engine: StudioEngine | null
  config: LiveConfig | null
  secrets: LiveSecretsStatus | null
  cameraId: string | null
  micId: string | null
  hostOnStage: boolean
  hostName: string
  sharing: boolean
  layout: StudioLayout
  banner: string
  showBanner: boolean
  showNames: boolean
  /** Mức làm đẹp mặt cho webcam host (0 = tắt, 1 = mạnh nhất). */
  beautyLevel: number
  room: GuestRoom | null
  guests: GuestInfo[]
  stage: Record<string, boolean>
  phase: LivePhase
  status: LiveStatus | null
  ended: LiveEnded | null
  error: string | null
  comments: LiveComment[]
  commentError: string | null
  commentsRunning: boolean
  featuredId: string | null
  captionsOn: boolean
  captionLanguage: string

  init(): Promise<void>
  setConfig(patch: Partial<LiveConfig>): Promise<void>
  setSecret(
    name: Parameters<ReturnType<typeof lumora>['setLiveSecret']>[0],
    value: string,
  ): Promise<void>
  setDevices(cameraId: string | null, micId: string | null): Promise<void>
  setHostOnStage(on: boolean): void
  setHostName(name: string): void
  shareScreen(sourceId: string | null): Promise<void>
  setStudio(
    patch: Partial<
      Pick<LiveStore, 'layout' | 'banner' | 'showBanner' | 'showNames' | 'beautyLevel'>
    >,
  ): void
  openRoom(): Promise<void>
  closeRoom(): Promise<void>
  setGuestStage(id: string, on: boolean): void
  kickGuest(id: string): void
  goLive(): Promise<void>
  stopLive(): Promise<void>
  toggleComments(platforms: ('youtube' | 'facebook')[]): Promise<void>
  feature(comment: LiveComment | null): void
  setCaptions(on: boolean, language?: string): void
}

let hub: GuestHub | null = null
let broadcaster: Broadcaster | null = null
let hostStream: MediaStream | null = null
let chunker: CaptionChunker | null = null
const captionBuffer = new LiveCaptionBuffer()

function syncStudio(get: () => LiveStore) {
  const { engine, layout, banner, showBanner, showNames, featuredId, comments, beautyLevel } = get()
  if (!engine) return
  engine.state = {
    ...engine.state,
    layout,
    banner,
    showBanner,
    showNames,
    featured: comments.find((c) => c.id === featuredId) ?? null,
    hostBeauty: {
      smooth: BEAUTY_PRESET.smooth * 1.2 * beautyLevel,
      brighten: BEAUTY_PRESET.brighten * 1.2 * beautyLevel,
      warmth: BEAUTY_PRESET.warmth * 1.2 * beautyLevel,
    },
  }
}

export const useLiveStore = create<LiveStore>((set, get) => ({
  engine: null,
  config: null,
  secrets: null,
  cameraId: null,
  micId: null,
  hostOnStage: true,
  hostName: 'Host',
  sharing: false,
  layout: 'grid',
  banner: '',
  showBanner: false,
  showNames: true,
  beautyLevel: 0,
  room: null,
  guests: [],
  stage: {},
  phase: 'idle',
  status: null,
  ended: null,
  error: null,
  comments: [],
  commentError: null,
  commentsRunning: false,
  featuredId: null,
  captionsOn: false,
  captionLanguage: '',

  async init() {
    const api = lumora()
    const [config, secrets] = await Promise.all([api.getLiveConfig(), api.getLiveSecrets()])
    let engine = get().engine
    const size =
      config.resolution === 1080 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 }
    if (!engine || (get().phase === 'idle' && engine.size.width !== size.width)) {
      engine?.dispose()
      engine = new StudioEngine(size, 30)
      engine.captionSource = () => (get().captionsOn ? captionBuffer.text(Date.now()) : '')
    }
    set({ config, secrets, engine })
    syncStudio(get)
  },

  async setConfig(patch) {
    const config = await lumora().updateLiveConfig(patch)
    set({ config, secrets: await lumora().getLiveSecrets() })
    if (patch.resolution && get().phase === 'idle') await get().init()
  },

  async setSecret(name, value) {
    set({ secrets: await lumora().setLiveSecret(name, value) })
  },

  async setDevices(cameraId, micId) {
    const { engine } = get()
    set({ cameraId, micId })
    if (!engine) return
    stopStream(hostStream)
    const tracks: MediaStreamTrack[] = []
    if (cameraId)
      tracks.push(...((await getCameraStream(cameraId).catch(() => null))?.getTracks() ?? []))
    if (micId)
      tracks.push(...((await getMicStream(micId, 'voice').catch(() => null))?.getTracks() ?? []))
    hostStream = new MediaStream(tracks)
    engine.setHost(hostStream, get().hostName || 'Host')
    engine.setOnStage(HOST_ID, get().hostOnStage)
  },

  setHostOnStage(on) {
    get().engine?.setOnStage(HOST_ID, on)
    set({ hostOnStage: on })
  },

  setHostName(name) {
    get().engine?.rename(HOST_ID, name || 'Host')
    set({ hostName: name })
  },

  async shareScreen(sourceId) {
    const { engine } = get()
    if (!engine) return
    if (!sourceId) {
      engine.setScreen(null)
      return set({ sharing: false })
    }
    engine.setScreen(await getDesktopStream(sourceId, 30))
    set({ sharing: true, layout: get().layout === 'grid' ? 'screen' : get().layout })
    syncStudio(get)
  },

  setStudio(patch) {
    set(patch)
    syncStudio(get)
  },

  async openRoom() {
    const { engine } = get()
    if (!engine) return
    const room = await lumora().openGuestRoom()
    hub?.close()
    hub = new GuestHub(engine, room, (guests) =>
      set({ guests, stage: Object.fromEntries(guests.map((g) => [g.id, engine.isOnStage(g.id)])) }),
    )
    await hub.connect()
    set({ room })
  },

  async closeRoom() {
    hub?.close()
    hub = null
    await lumora().closeGuestRoom()
    set({ room: null, guests: [], stage: {} })
  },

  setGuestStage(id, on) {
    hub?.setOnStage(id, on)
  },

  kickGuest(id) {
    hub?.kick(id)
  },

  async goLive() {
    const { engine } = get()
    if (!engine || get().phase !== 'idle') return
    set({ phase: 'starting', error: null, ended: null, status: null })
    try {
      await lumora().startLive({ ...engine.size, fps: engine.fps })
      broadcaster = new Broadcaster(lumora())
      broadcaster.start(engine.programStream())
      set({ phase: 'live' })
    } catch (e) {
      set({ phase: 'idle', error: ipcErrorMessage(e) })
    }
  },

  async stopLive() {
    if (get().phase !== 'live') return
    set({ phase: 'stopping' })
    await broadcaster?.stop()
    broadcaster = null
    const ended = await lumora()
      .stopLive()
      .catch((e: unknown) => ({ error: ipcErrorMessage(e), folder: null }))
    set({ phase: 'idle', ended, status: null })
  },

  async toggleComments(platforms) {
    if (get().commentsRunning) {
      await lumora().stopComments()
      return set({ commentsRunning: false })
    }
    set({ commentError: null, commentsRunning: true })
    await lumora().startComments(platforms)
  },

  feature(comment) {
    set({ featuredId: comment?.id ?? null })
    syncStudio(get)
  },

  setCaptions(on, language) {
    chunker?.stop()
    chunker = null
    const lang = language ?? get().captionLanguage
    set({ captionsOn: on, captionLanguage: lang })
    if (!on || !hostStream || hostStream.getAudioTracks().length === 0) return
    const audioOnly = new MediaStream(hostStream.getAudioTracks())
    chunker = new CaptionChunker(audioOnly, (data) => {
      void lumora()
        .transcribeLiveChunk(data, lang)
        .then((text) => captionBuffer.push(text, Date.now()))
        .catch((e) => set({ error: ipcErrorMessage(e) }))
    })
    chunker.start()
  },
}))

/** Đăng ký nhận sự kiện từ main (trạng thái phát, bình luận). Gọi một lần khi mở trang. */
export function subscribeLiveEvents(): () => void {
  const api = lumora()
  const offs = [
    api.onLiveStatus((status) => {
      if (useLiveStore.getState().phase === 'live') useLiveStore.setState({ status })
    }),
    // Buổi phát kết thúc (do người dùng hoặc FFmpeg dừng vì lỗi).
    api.onLiveEnded((ended) => {
      if (useLiveStore.getState().phase === 'idle') return
      void broadcaster?.stop()
      broadcaster = null
      useLiveStore.setState({ phase: 'idle', ended, status: null })
    }),
    api.onLiveComments((incoming) =>
      useLiveStore.setState((s) => ({ comments: mergeComments(s.comments, incoming) })),
    ),
    api.onLiveCommentError((message) =>
      useLiveStore.setState({ commentError: message, commentsRunning: false }),
    ),
  ]
  return () => offs.forEach((off) => off())
}
