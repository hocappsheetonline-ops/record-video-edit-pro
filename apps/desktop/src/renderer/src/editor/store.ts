import { create } from 'zustand'
import {
  buildCursorTrack,
  cameraFollowTrack,
  clipPositions,
  createDefaultEdit,
  DEFAULT_ZOOM_SCALE,
  generateAutoZooms,
  newZoomId,
  normalizeZooms,
  outputDuration,
  outputToSource,
  removeClip,
  setClipSpeed,
  sourceDuration,
  splitAt,
  trimAtPlayhead,
  type CursorTrack,
  type EditState,
  type InputEvent,
  type Project,
  type Size,
  type AudioClip,
  DEFAULT_OVERLAY_MS,
  newOverlayId,
  templateStyle,
  type Overlay,
  DEFAULT_EFFECT_MS,
  MIN_REGION_MS,
  newEffectId,
  type EffectKind,
  type EffectRegion,
  cutPoints,
  DEFAULT_TRANSITION_MS,
  pruneTransitions,
  type TransitionKind,
  type Filmstrip,
  MIN_AUDIO_CLIP_MS,
  newAudioClipId,
  type SoundEffectId,
  type Transcript,
  type Waveform,
  audioFxKey,
  isDefaultFx,
  overlayAudioClips,
  type AudioFx,
  insertFreeze,
  setFreezeDuration,
  DEFAULT_LOOK,
  type Clip,
  type Look,
  DEFAULT_ANIM,
  NO_ANIM,
  editPose,
  overlayPose,
  keyframeAt,
  removeKeyframe,
  setKeyframe,
  type Pose,
  canReverse,
  type SpeedCurve,
} from '@lumora/core'
import type { AudioAsset, MediaAsset } from '@shared/ipc'
import { lumora } from '../api'

/** `transition`: id là clip đứng trước chỗ nối. `camera`: bong bóng webcam (id rỗng). */
export type Selection = {
  kind: 'clip' | 'zoom' | 'audio' | 'transition' | 'effect' | 'overlay' | 'camera'
  id: string
} | null

interface EditorStore {
  folder: string | null
  project: Project | null
  edit: EditState | null
  events: InputEvent[]
  transcript: Transcript | null
  /** Dạng sóng âm thanh (tải sau, không chặn việc mở trình chỉnh sửa). */
  waveform: Waveform | null
  /** Ảnh thu nhỏ cho dải phim trên timeline (tải sau). */
  filmstrip: Filmstrip | null
  /** Yêu cầu mở một tab của bảng bên phải (n tăng mỗi lần yêu cầu, kể cả cùng tab). */
  tabRequest: { tab: string; n: number }
  /**
   * File âm thanh đã lọc tạp âm / hiệu ứng (theo `fxKeyOf`): tên file khi xong, 'pending' khi đang
   * xử lý, 'error' khi lỗi. Xem trước dùng file đã xử lý khi có.
   */
  fxFiles: Record<string, string>
  /**
   * File đảo ngược của clip phát ngược, theo `revKeyOf(clip)`: tên file theo track, hoặc
   * 'pending' / 'error'.
   */
  revFiles: Record<string, ReversedFiles | 'pending' | 'error'>
  /** AI xóa phông: chưa nạp / đang nạp / sẵn sàng / máy không chạy được. */
  aiStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** Giữ nút "nghe bản gốc": xem trước tạm bỏ hiệu ứng âm thanh. */
  bypassFx: boolean
  /** Đang ghi lồng tiếng và tắt tiếng bản gốc trong lúc ghi. */
  muteOriginal: boolean
  /** Cài đặt giọng AI dùng chung (tốc độ 0.7–1.2, độ ổn định 0–1). */
  voiceOptions: { speed: number; stability: number }
  /** Dạng sóng của các file nhạc/hiệu ứng đã thêm (theo tên file). */
  assetPeaks: Record<string, Waveform | null>
  cursor: CursorTrack | null
  follow: CursorTrack | null
  /** Kích thước gốc của video màn hình. */
  videoSize: Size
  /** Thời điểm trên video xuất (ms). */
  time: number
  playing: boolean
  selection: Selection
  past: EditState[]
  future: EditState[]
  loadError: string | null

  load(folder: string): Promise<void>
  reset(): void
  /** Đổi bản chỉnh sửa. `coalesce`: các thay đổi liên tiếp cùng khóa (kéo thanh trượt) chỉ tính một bước hoàn tác. */
  change(recipe: (edit: EditState) => EditState, coalesce?: string): void
  undo(): void
  redo(): void
  setTime(ms: number): void
  setPlaying(playing: boolean): void
  select(selection: Selection): void
  setVideoSize(size: Size): void
  setTranscript(transcript: Transcript | null): void
  splitAtPlayhead(): void
  /** Phím A / D: xóa phần clip bên trái / bên phải đầu phát (giống CapCut). */
  trimAtPlayhead(side: 'left' | 'right'): void
  /** Đặt (hoặc bỏ khi `kind` null) chuyển tiếp ở chỗ nối sau clip `afterClip`. */
  setTransition(afterClip: string, kind: TransitionKind | null, durationMs?: number): void
  applyTransitionToAll(kind: TransitionKind | null, durationMs: number): void
  /** Thêm nhạc từ máy tại đầu phát. Trả về false nếu người dùng hủy. */
  addMusic(): Promise<boolean>
  /** Thêm hiệu ứng âm thanh có sẵn tại đầu phát. */
  addSoundEffect(id: SoundEffectId): Promise<void>
  /** Đọc câu bằng giọng AI rồi thêm tại `at` (mặc định: đầu phát) như một hiệu ứng âm thanh. */
  addSpeech(text: string, voiceId: string, at?: number): Promise<void>
  /**
   * Kịch bản lồng tiếng: mỗi dòng đọc bằng giọng AI thành một đoạn "Lồng tiếng" nối tiếp nhau
   * từ đầu phát (cách nhau `gapMs`); tùy chọn thêm phụ đề chữ đúng thời gian từng đoạn.
   * `onProgress(done, total)` báo tiến độ. Trả về số đoạn đã thêm.
   */
  addNarration(
    lines: readonly string[],
    voiceId: string,
    options?: {
      captions?: boolean
      gapMs?: number
      onProgress?: (done: number, total: number) => void
    },
  ): Promise<number>
  updateAudioClip(id: string, patch: Partial<AudioClip>, coalesce?: string): void
  loadAssetPeaks(file: string): void
  /** Bắt đầu xử lý hiệu ứng âm thanh cho file (nếu chưa có); an toàn khi gọi nhiều lần. */
  ensureFx(file: string, fx: AudioFx): void
  /** Tạo file đảo ngược cho clip (ở nền); trả về khi xong (hoặc lỗi). */
  ensureReversed(clip: Pick<Clip, 'sourceStart' | 'sourceEnd'>): Promise<ReversedFiles | null>
  /** Bật / tắt phát ngược (chỉ clip nằm trong một đoạn quay, không quá 2 phút). */
  setClipReversed(id: string, on: boolean): boolean
  /** Đường cong tốc độ (undefined = về tốc độ cố định). */
  setSpeedCurve(id: string, curve: SpeedCurve | undefined, coalesce?: string): void
  setBypassFx(on: boolean): void
  setMuteOriginal(on: boolean): void
  setVoiceOptions(patch: Partial<EditorStore['voiceOptions']>): void
  /** Thêm bản lồng tiếng vừa ghi tại thời điểm `at` (ms). */
  addVoiceover(data: ArrayBuffer, at: number, name: string): Promise<void>
  /** Tách tiếng của video meme ra thành đoạn âm thanh riêng trên hàng Âm thanh. */
  detachOverlayAudio(id: string): void
  requestTab(tab: string): void
  /** Thêm hiệu ứng hình tại đầu phát (mặc định 2 giây) và chọn nó. */
  addEffect(kind: EffectKind): void
  updateEffect(id: string, patch: Partial<EffectRegion>, coalesce?: string): void
  /** Thêm chữ / emoji / ảnh tại đầu phát (3 giây) và chọn nó. */
  addOverlay(init: Partial<Overlay> & Pick<Overlay, 'kind'>): void
  updateOverlay(id: string, patch: Partial<Overlay>, coalesce?: string): void
  /**
   * Sửa vị trí / cỡ / góc / độ mờ của lớp tại đầu phát: có keyframe thì sửa (hoặc thêm) keyframe ở
   * đó, chưa có thì sửa giá trị gốc.
   */
  updateOverlayPose(id: string, patch: Partial<Pose>, coalesce?: string): void
  /** Bật / tắt keyframe của lớp tại đầu phát. */
  toggleKeyframe(id: string): void
  clearKeyframes(id: string): void
  /** Thêm ảnh / GIF / video meme (đã chép vào dự án) tại đầu phát. */
  addMediaOverlay(asset: MediaAsset): void
  deleteSelection(): void
  setClipSpeed(id: string, speed: number): void
  /** Sửa một clip (bộ lọc, cắt / lật / xoay…). */
  updateClip(id: string, patch: Partial<Clip>, coalesce?: string): void
  /** Chèn khung hình đứng yên tại đầu phát và chọn nó. */
  freezeAtPlayhead(): void
  setFreezeDuration(id: string, ms: number): void
  /** Đặt bộ lọc / điều chỉnh cho đối tượng đang chọn (clip, ảnh / video meme) hoặc cả video. */
  setLook(look: Look, coalesce?: string): void
  addZoomAtPlayhead(): void
  regenerateZooms(): void
}

const HISTORY_LIMIT = 100
let lastCoalesce: { key: string; at: number } | null = null

function tracksFor(project: Project, events: InputEvent[], edit: EditState) {
  const cursor = buildCursorTrack(
    events,
    project.segments,
    project.source.captureRect,
    edit.cursor.smoothing,
  )
  return { cursor, follow: cameraFollowTrack(cursor, edit.motion.cameraSpeed) }
}

const initial = {
  folder: null,
  project: null,
  edit: null,
  events: [],
  transcript: null,
  waveform: null,
  filmstrip: null,
  assetPeaks: {},
  tabRequest: { tab: '', n: 0 },
  fxFiles: {},
  revFiles: {},
  aiStatus: 'idle' as EditorStore['aiStatus'],
  bypassFx: false,
  muteOriginal: false,
  voiceOptions: { speed: 1, stability: 0.5 },
  cursor: null,
  follow: null,
  videoSize: { width: 1920, height: 1080 },
  time: 0,
  playing: false,
  selection: null,
  past: [],
  future: [],
  loadError: null,
}

/** Đặt file âm thanh vừa thêm vào timeline tại đầu phát và chọn nó. */
export type ReversedFiles = Partial<Record<'screen' | 'camera' | 'mic' | 'system', string>>
/** Khóa của clip phát ngược trong `revFiles` (theo khoảng nguồn). */
export const revKeyOf = (clip: Pick<Clip, 'sourceStart' | 'sourceEnd'>) =>
  `${Math.round(clip.sourceStart)}-${Math.round(clip.sourceEnd)}`

/** Khóa của một file + bộ hiệu ứng trong `fxFiles`. */
export const fxKeyOf = (file: string, fx: AudioFx) => `${file}|${audioFxKey(fx)}`

function insertAudio(asset: AudioAsset, kind: AudioClip['kind'], at?: number) {
  const { edit, time } = useEditorStore.getState()
  if (!edit) return
  const total = outputDuration(edit.clips)
  const start = Math.min(at ?? time, Math.max(0, total - MIN_AUDIO_CLIP_MS))
  const clip: AudioClip = {
    id: newAudioClipId(),
    file: asset.file,
    name: asset.name,
    kind,
    start,
    offset: 0,
    // Nhạc nền: phủ đến hết video (lặp nếu cần); hiệu ứng: đúng độ dài file.
    duration: Math.max(
      MIN_AUDIO_CLIP_MS,
      kind === 'music' ? total - start : Math.min(asset.durationMs, total - start),
    ),
    sourceDuration: asset.durationMs,
    volume: kind === 'music' ? 0.5 : 1,
    fadeIn: 0,
    fadeOut: kind === 'music' ? 1500 : 0,
    loop: kind === 'music',
  }
  useEditorStore.getState().change((e) => ({ ...e, audioClips: [...e.audioClips, clip] }))
  useEditorStore.setState({ selection: { kind: 'audio', id: clip.id } })
}

/** Khoảng lặng giữa các câu của kịch bản lồng tiếng. */
export const NARRATION_GAP_MS = 250

/** Phụ đề cho một câu lồng tiếng (mẫu chữ "Phụ đề", ở cuối khung hình). */
function narrationCaption(text: string): Omit<Overlay, 'id' | 'start' | 'end'> {
  return {
    kind: 'text',
    x: 0.5,
    y: 0.86,
    size: 0.06,
    rotation: 0,
    anim: { ...NO_ANIM },
    text,
    style: 'meme',
    textStyle: templateStyle('subtitle'),
    color: '#ffffff',
    file: '',
    aspect: 1,
    mediaOffset: 0,
    sourceDuration: 0,
    hasAudio: false,
    volume: 1,
    keyColor: '',
    keyStrength: 0.4,
  }
}

/** Yêu cầu tạo file đảo ngược đang chạy (dùng chung khi gọi trùng). */
const revRequests = new Map<string, Promise<ReversedFiles | 'error'>>()

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...initial,

  async load(folder) {
    set({ ...initial, folder })
    const api = lumora()
    const [project, events, saved, transcript] = await Promise.all([
      api.getProject(folder),
      api.getEvents(folder),
      api.getEdit(folder),
      api.getTranscript(folder).catch(() => null),
    ])
    if (get().folder !== folder) return
    if (!project) return set({ loadError: 'not_found' })
    let edit = saved
    const tracks = tracksFor(project, events, saved ?? createDefaultEdit(project))
    if (!edit) {
      // Lần đầu mở: tự tạo các đoạn zoom từ click chuột và lúc gõ phím.
      edit = createDefaultEdit(
        project,
        generateAutoZooms(tracks.cursor, sourceDuration(project.segments)),
      )
    }
    const rect = project.source.captureRect
    set({
      project,
      events,
      transcript,
      edit,
      ...tracks,
      videoSize: rect ? { width: rect.width, height: rect.height } : { width: 1920, height: 1080 },
    })
    // Lần đầu FFmpeg cần vài giây để đọc âm thanh; timeline hiện sóng khi xong.
    void api
      .getWaveform(folder)
      .then((waveform) => {
        if (get().folder === folder) set({ waveform })
      })
      .catch(() => undefined)
    void api
      .getFilmstrip(folder)
      .then((filmstrip) => {
        if (get().folder === folder) set({ filmstrip })
      })
      .catch(() => undefined)
    // Clip phát ngược: chuẩn bị file đảo ngược để xem trước.
    for (const clip of edit.clips) if (clip.reversed) void get().ensureReversed(clip)
  },

  reset() {
    lastCoalesce = null
    set({ ...initial })
  },

  change(recipe, coalesce) {
    const { edit, project, events } = get()
    if (!edit || !project) return
    let next = recipe(edit)
    if (next === edit) return
    // Clip đổi (cắt, xóa, A/D): bỏ chuyển tiếp ở chỗ nối không còn tồn tại.
    if (next.clips !== edit.clips)
      next = { ...next, transitions: pruneTransitions(next.clips, next.transitions) }
    const now = Date.now()
    const merge = coalesce && lastCoalesce?.key === coalesce && now - lastCoalesce.at < 1500
    lastCoalesce = coalesce ? { key: coalesce, at: now } : null
    const past = merge ? get().past : [...get().past, edit].slice(-HISTORY_LIMIT)
    const patch: Partial<EditorStore> = { edit: next, past, future: [] }
    if (
      next.cursor.smoothing !== edit.cursor.smoothing ||
      next.motion.cameraSpeed !== edit.motion.cameraSpeed
    )
      Object.assign(patch, tracksFor(project, events, next))
    const duration = outputDuration(next.clips)
    if (get().time > duration) patch.time = duration
    set(patch)
  },

  undo() {
    const { past, edit, future, project, events } = get()
    const prev = past[past.length - 1]
    if (!prev || !edit || !project) return
    lastCoalesce = null
    set({
      edit: prev,
      past: past.slice(0, -1),
      future: [edit, ...future],
      ...tracksFor(project, events, prev),
    })
  },

  redo() {
    const { past, edit, future, project, events } = get()
    const next = future[0]
    if (!next || !edit || !project) return
    lastCoalesce = null
    set({
      edit: next,
      past: [...past, edit],
      future: future.slice(1),
      ...tracksFor(project, events, next),
    })
  },

  setTime(ms) {
    const edit = get().edit
    const max = edit ? outputDuration(edit.clips) : 0
    set({ time: Math.max(0, Math.min(max, ms)) })
  },

  setPlaying(playing) {
    set({ playing })
  },

  select(selection) {
    set({ selection })
  },

  setVideoSize(size) {
    const current = get().videoSize
    if (current.width !== size.width || current.height !== size.height) set({ videoSize: size })
  },

  setTranscript(transcript) {
    set({ transcript })
  },

  splitAtPlayhead() {
    const time = get().time
    get().change((e) => {
      const original = outputToSource(e.clips, time)?.position.clip.id
      const clips = splitAt(e.clips, time)
      if (!original || clips.length === e.clips.length) return { ...e, clips }
      // Chuyển tiếp sau clip cũ giờ nằm sau mảnh bên phải.
      const right = clips[clips.findIndex((c) => c.id === original) + 1]!
      return {
        ...e,
        clips,
        transitions: e.transitions.map((t) =>
          t.afterClip === original ? { ...t, afterClip: right.id } : t,
        ),
      }
    })
  },

  setTransition(afterClip, kind, durationMs) {
    get().change(
      (e) => {
        const rest = e.transitions.filter((t) => t.afterClip !== afterClip)
        if (!kind) return { ...e, transitions: rest }
        const old = e.transitions.find((t) => t.afterClip === afterClip)
        const duration = durationMs ?? old?.durationMs ?? DEFAULT_TRANSITION_MS
        return { ...e, transitions: [...rest, { afterClip, kind, durationMs: duration }] }
      },
      durationMs !== undefined ? `transition-${afterClip}` : undefined,
    )
  },

  applyTransitionToAll(kind, durationMs) {
    get().change((e) => ({
      ...e,
      transitions: kind
        ? cutPoints(e.clips).map((c) => ({ afterClip: c.afterClip, kind, durationMs }))
        : [],
    }))
  },

  trimAtPlayhead(side) {
    const { edit, time } = get()
    if (!edit) return
    const result = trimAtPlayhead(edit.clips, time, side)
    get().change((e) => ({ ...e, clips: result.clips }))
    set({ time: result.time, selection: null })
  },

  async addMusic() {
    const { folder } = get()
    if (!folder) return false
    const asset = await lumora().addAudioFile(folder)
    if (!asset) return false
    insertAudio(asset, 'music')
    return true
  },

  async addSoundEffect(id) {
    const { folder } = get()
    if (!folder) return
    insertAudio(await lumora().addSoundEffect(folder, id), 'sfx')
  },

  async ensureReversed(clip) {
    const { folder } = get()
    if (!folder) return null
    const key = revKeyOf(clip)
    const known = get().revFiles[key]
    if (known && known !== 'pending' && known !== 'error') return known
    if (known !== 'pending') {
      set({ revFiles: { ...get().revFiles, [key]: 'pending' } })
      revRequests.set(
        `${folder}|${key}`,
        lumora()
          .reverseClip(folder, clip.sourceStart, clip.sourceEnd)
          .then(
            (files) => files,
            () => 'error' as const,
          )
          .then((out) => {
            if (get().folder === folder) set({ revFiles: { ...get().revFiles, [key]: out } })
            return out
          }),
      )
    }
    const out = await revRequests.get(`${folder}|${key}`)
    return out && out !== 'error' ? out : null
  },

  setClipReversed(id, on) {
    const { edit, project } = get()
    const clip = edit?.clips.find((c) => c.id === id)
    if (!clip || !project) return false
    if (on && !canReverse(project.segments, clip)) return false
    get().updateClip(id, { reversed: on ? true : undefined })
    if (on) void get().ensureReversed(clip)
    return true
  },

  setSpeedCurve(id, curve, coalesce) {
    get().updateClip(id, { speedCurve: curve }, coalesce)
  },

  ensureFx(file, fx) {
    const { folder, fxFiles } = get()
    if (!folder || isDefaultFx(fx)) return
    const key = fxKeyOf(file, fx)
    if (fxFiles[key]) return
    set({ fxFiles: { ...fxFiles, [key]: 'pending' } })
    void lumora()
      .processAudio(folder, file, fx)
      .then(
        (out) => out,
        () => 'error',
      )
      .then((out) => {
        if (get().folder === folder) set({ fxFiles: { ...get().fxFiles, [key]: out } })
      })
  },

  setBypassFx(on) {
    set({ bypassFx: on })
  },

  setVoiceOptions(patch) {
    set({ voiceOptions: { ...get().voiceOptions, ...patch } })
  },

  setMuteOriginal(on) {
    set({ muteOriginal: on })
  },

  async addVoiceover(data, at, name) {
    const { folder } = get()
    if (!folder) return
    const asset = await lumora().addVoiceover(folder, data)
    insertAudio({ ...asset, name }, 'voice', at)
  },

  detachOverlayAudio(id) {
    const { edit } = get()
    const o = edit?.overlays.find((x) => x.id === id)
    if (!edit || !o || o.kind !== 'video' || !o.hasAudio) return
    const [clip] = overlayAudioClips([o])
    if (!clip) return
    const audio: AudioClip = { ...clip, id: newAudioClipId(), name: o.text || clip.name }
    get().change((e) => ({
      ...e,
      overlays: e.overlays.map((x) => (x.id === id ? { ...x, hasAudio: false } : x)),
      audioClips: [...e.audioClips, audio],
    }))
    set({ selection: { kind: 'audio', id: audio.id } })
  },

  async addSpeech(text, voiceId, at) {
    const { folder } = get()
    if (!folder) return
    insertAudio(await lumora().speak(folder, text, voiceId, get().voiceOptions), 'sfx', at)
  },

  async addNarration(lines, voiceId, options = {}) {
    const { folder, edit, time } = get()
    const list = lines.map((l) => l.trim()).filter(Boolean)
    if (!folder || !edit || list.length === 0) return 0
    const gap = options.gapMs ?? NARRATION_GAP_MS
    // Đọc hết trước rồi mới thêm vào dự án (một bước hoàn tác; lỗi giữa chừng không để dở dang).
    const assets: AudioAsset[] = []
    for (const line of list) {
      assets.push(await lumora().speak(folder, line, voiceId, get().voiceOptions))
      options.onProgress?.(assets.length, list.length)
    }
    const total = outputDuration(get().edit?.clips ?? edit.clips)
    const audio: AudioClip[] = []
    const captions: Overlay[] = []
    let at = Math.min(time, Math.max(0, total - MIN_AUDIO_CLIP_MS))
    assets.forEach((asset, i) => {
      if (at > total - MIN_AUDIO_CLIP_MS) return
      const duration = Math.max(MIN_AUDIO_CLIP_MS, Math.min(asset.durationMs, total - at))
      audio.push({
        id: newAudioClipId(),
        file: asset.file,
        name: list[i]!.slice(0, 40),
        kind: 'voice',
        start: at,
        offset: 0,
        duration,
        sourceDuration: asset.durationMs,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
      })
      if (options.captions)
        captions.push({
          ...narrationCaption(list[i]!),
          id: newOverlayId(),
          start: at,
          end: at + duration,
        })
      at += duration + gap
    })
    if (audio.length === 0) return 0
    get().change((e) => ({
      ...e,
      audioClips: [...e.audioClips, ...audio],
      overlays: [...e.overlays, ...captions],
    }))
    set({ selection: { kind: 'audio', id: audio[0]!.id } })
    return audio.length
  },

  updateAudioClip(id, patch, coalesce) {
    get().change(
      (e) => ({
        ...e,
        audioClips: e.audioClips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }),
      coalesce,
    )
  },

  addEffect(kind) {
    const { edit, time } = get()
    if (!edit) return
    const total = outputDuration(edit.clips)
    const start = Math.min(time, Math.max(0, total - MIN_REGION_MS))
    const effect: EffectRegion = {
      id: newEffectId(),
      kind,
      start,
      end: Math.min(total, start + DEFAULT_EFFECT_MS),
      intensity: 0.7,
    }
    get().change((e) => ({ ...e, effects: [...e.effects, effect] }))
    set({ selection: { kind: 'effect', id: effect.id } })
  },

  updateEffect(id, patch, coalesce) {
    get().change(
      (e) => ({ ...e, effects: e.effects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      coalesce,
    )
  },

  addOverlay(init) {
    const { edit, time } = get()
    if (!edit) return
    const total = outputDuration(edit.clips)
    const start = Math.min(time, Math.max(0, total - 200))
    const video = init.kind === 'video'
    // Video meme dài đúng bằng phần còn lại của file (không vượt cuối video).
    const length = video
      ? Math.max(200, (init.sourceDuration ?? 0) - (init.mediaOffset ?? 0))
      : DEFAULT_OVERLAY_MS
    const overlay: Overlay = {
      id: newOverlayId(),
      start,
      end: Math.min(total, start + length),
      x: 0.5,
      y: init.kind === 'text' ? 0.15 : 0.5,
      size: video
        ? (init.aspect ?? 1) < 1
          ? 0.7
          : 0.45
        : init.kind === 'image'
          ? 0.35
          : init.kind === 'emoji'
            ? 0.18
            : init.kind === 'shape'
              ? 0.14
              : 0.09,
      rotation: 0,
      anim: video ? { ...NO_ANIM } : { ...DEFAULT_ANIM },
      text: '',
      style: 'meme',
      color: '#ffffff',
      file: '',
      aspect: 1,
      mediaOffset: 0,
      sourceDuration: 0,
      hasAudio: false,
      volume: 1,
      keyColor: '',
      keyStrength: 0.4,
      ...init,
    }
    get().change((e) => ({ ...e, overlays: [...e.overlays, overlay] }))
    set({ selection: { kind: 'overlay', id: overlay.id } })
  },

  updateOverlay(id, patch, coalesce) {
    get().change(
      (e) => ({
        ...e,
        overlays: e.overlays.map((o) => {
          if (o.id !== id) return o
          const next: Overlay = { ...o, ...patch }
          // Trường đặt về undefined (bỏ mặt nạ, bỏ lật…): xóa hẳn cho file gọn.
          for (const key of Object.keys(patch) as (keyof Overlay)[])
            if (patch[key] === undefined) delete next[key]
          return next
        }),
      }),
      coalesce,
    )
  },

  updateOverlayPose(id, patch, coalesce) {
    const { time } = get()
    get().change(
      (e) => ({
        ...e,
        overlays: e.overlays.map((o) => {
          if (o.id !== id) return o
          const r = editPose(basePose(o), o.keyframes, time - o.start, patch)
          return withPose(o, r.base, r.keyframes ?? o.keyframes)
        }),
      }),
      coalesce,
    )
  },

  toggleKeyframe(id) {
    const { time } = get()
    get().change((e) => ({
      ...e,
      overlays: e.overlays.map((o) => {
        if (o.id !== id) return o
        const local = time - o.start
        const hit = keyframeAt(o.keyframes, local)
        const keyframes = hit
          ? removeKeyframe(o.keyframes, hit.id)
          : setKeyframe(basePose(o), o.keyframes, local)
        // Bỏ keyframe cuối cùng: lớp đứng yên ở tư thế của keyframe đó.
        if (keyframes.length === 0 && hit) return withPose(o, hit, undefined)
        return { ...o, keyframes }
      }),
    }))
  },

  clearKeyframes(id) {
    const { time } = get()
    get().change((e) => ({
      ...e,
      overlays: e.overlays.map((o) =>
        o.id === id ? withPose(o, posedOverlayPose(o, time), undefined) : o,
      ),
    }))
  },

  addMediaOverlay(asset) {
    get().addOverlay({
      kind: asset.kind,
      file: asset.file,
      text: asset.name,
      aspect: asset.width / Math.max(1, asset.height),
      sourceDuration: asset.kind === 'video' ? asset.durationMs : 0,
      hasAudio: asset.hasAudio,
    })
  },

  requestTab(tab) {
    set({ tabRequest: { tab, n: get().tabRequest.n + 1 } })
  },

  loadAssetPeaks(file) {
    const { folder, assetPeaks } = get()
    if (!folder || file in assetPeaks) return
    set({ assetPeaks: { ...assetPeaks, [file]: null } })
    void lumora()
      .getAssetPeaks(folder, file)
      .then((peaks) => {
        if (get().folder === folder) set({ assetPeaks: { ...get().assetPeaks, [file]: peaks } })
      })
      .catch(() => undefined)
  },

  deleteSelection() {
    const { selection } = get()
    if (!selection) return
    if (selection.kind === 'overlay') {
      get().change((e) => ({ ...e, overlays: e.overlays.filter((o) => o.id !== selection.id) }))
    } else if (selection.kind === 'effect') {
      get().change((e) => ({ ...e, effects: e.effects.filter((x) => x.id !== selection.id) }))
    } else if (selection.kind === 'audio') {
      get().change((e) => ({ ...e, audioClips: e.audioClips.filter((c) => c.id !== selection.id) }))
    } else if (selection.kind === 'clip') {
      get().change((e) =>
        e.clips.length > 1 ? { ...e, clips: removeClip(e.clips, selection.id) } : e,
      )
    } else if (selection.kind === 'transition') {
      get().setTransition(selection.id, null)
    } else if (selection.kind === 'camera') {
      get().change((e) => ({ ...e, camera: { ...e.camera, visible: false } }))
    } else {
      get().change((e) => ({ ...e, zooms: e.zooms.filter((z) => z.id !== selection.id) }))
    }
    set({ selection: null })
  },

  setClipSpeed(id, speed) {
    get().change((e) => ({ ...e, clips: setClipSpeed(e.clips, id, speed) }))
  },

  updateClip(id, patch, coalesce) {
    get().change(
      (e) => ({
        ...e,
        clips: e.clips.map((c) => {
          if (c.id !== id) return c
          const next: Clip = { ...c, ...patch }
          // Giá trị rỗng: bỏ hẳn trường (file lưu gọn, clip dùng lại cài đặt chung).
          for (const key of [
            'look',
            'transform',
            'audio',
            'reversed',
            'speedCurve',
            'opacity',
          ] as const)
            if (key in patch && patch[key] === undefined) delete next[key]
          return next
        }),
      }),
      coalesce,
    )
  },

  freezeAtPlayhead() {
    const { edit, time } = get()
    if (!edit) return
    const result = insertFreeze(edit.clips, time)
    if (!result) return
    get().change((e) => ({ ...e, clips: result.clips }))
    set({ selection: { kind: 'clip', id: result.id } })
  },

  setFreezeDuration(id, ms) {
    get().change((e) => ({ ...e, clips: setFreezeDuration(e.clips, id, ms) }), `freeze-${id}`)
  },

  setLook(look, coalesce) {
    const { edit, selection } = get()
    if (!edit) return
    const target = lookTarget(edit, selection)
    if (target.kind === 'clip') get().updateClip(target.id, { look }, coalesce)
    else if (target.kind === 'overlay') get().updateOverlay(target.id, { look }, coalesce)
    else get().change((e) => ({ ...e, look }), coalesce)
  },

  addZoomAtPlayhead() {
    const { edit, project, time } = get()
    if (!edit || !project) return
    const hit = outputToSource(edit.clips, time)
    if (!hit) return
    const start = hit.source
    const id = newZoomId()
    get().change((e) => ({
      ...e,
      zooms: normalizeZooms(
        [
          ...e.zooms,
          {
            id,
            start,
            end: start + 2500,
            scale: DEFAULT_ZOOM_SCALE,
            mode: 'follow',
            x: 0.5,
            y: 0.5,
          },
        ],
        sourceDuration(project.segments),
      ),
    }))
    set({ selection: { kind: 'zoom', id } })
  },

  regenerateZooms() {
    const { cursor, project } = get()
    if (!cursor || !project) return
    get().change((e) => ({
      ...e,
      zooms: generateAutoZooms(cursor, sourceDuration(project.segments)),
    }))
  },
}))

/** Vị trí clip đang chọn (để hiện tốc độ, nút xóa...). */
export function selectedClip(edit: EditState | null, selection: Selection) {
  if (!edit || selection?.kind !== 'clip') return null
  return clipPositions(edit.clips).find((p) => p.clip.id === selection.id) ?? null
}

/** Bộ lọc / điều chỉnh sẽ áp dụng cho đâu: clip đang chọn, ảnh / video meme đang chọn, hay cả video. */
export type LookTarget = { kind: 'all' } | { kind: 'clip' | 'overlay'; id: string }

export function lookTarget(edit: EditState, selection: Selection): LookTarget {
  if (selection?.kind === 'clip' && edit.clips.some((c) => c.id === selection.id))
    return { kind: 'clip', id: selection.id }
  if (
    selection?.kind === 'overlay' &&
    edit.overlays.some((o) => o.id === selection.id && (o.kind === 'image' || o.kind === 'video'))
  )
    return { kind: 'overlay', id: selection.id }
  return { kind: 'all' }
}

/** Bộ lọc đang có hiệu lực ở đối tượng đó (clip chưa có riêng thì dùng của cả video). */
export function currentLook(edit: EditState, target: LookTarget): Look {
  if (target.kind === 'clip') {
    const clip = edit.clips.find((c) => c.id === target.id)
    return clip?.look ?? edit.look ?? DEFAULT_LOOK
  }
  if (target.kind === 'overlay')
    return edit.overlays.find((o) => o.id === target.id)?.look ?? DEFAULT_LOOK
  return edit.look ?? DEFAULT_LOOK
}

const basePose = (o: Overlay): Pose => ({
  x: o.x,
  y: o.y,
  size: o.size,
  rotation: o.rotation,
  opacity: o.opacity ?? 1,
})

/** Ghi tư thế gốc + danh sách keyframe vào lớp (độ mờ 1 thì bỏ trường cho gọn). */
function withPose(o: Overlay, pose: Pose, keyframes: Overlay['keyframes']): Overlay {
  const next: Overlay = {
    ...o,
    x: pose.x,
    y: pose.y,
    size: pose.size,
    rotation: pose.rotation,
    opacity: pose.opacity,
    keyframes: keyframes?.length ? keyframes : undefined,
  }
  if (next.opacity === 1) delete next.opacity
  if (!next.keyframes) delete next.keyframes
  return next
}

const posedOverlayPose = (o: Overlay, time: number): Pose => overlayPose(o, time)
