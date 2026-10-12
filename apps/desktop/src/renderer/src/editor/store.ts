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
} from '@lumora/core'
import type { AudioAsset } from '@shared/ipc'
import { lumora } from '../api'

/** `transition`: id là clip đứng trước chỗ nối. */
export type Selection = {
  kind: 'clip' | 'zoom' | 'audio' | 'transition' | 'effect'
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
  updateAudioClip(id: string, patch: Partial<AudioClip>, coalesce?: string): void
  loadAssetPeaks(file: string): void
  requestTab(tab: string): void
  /** Thêm hiệu ứng hình tại đầu phát (mặc định 2 giây) và chọn nó. */
  addEffect(kind: EffectKind): void
  updateEffect(id: string, patch: Partial<EffectRegion>, coalesce?: string): void
  deleteSelection(): void
  setClipSpeed(id: string, speed: number): void
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
function insertAudio(asset: AudioAsset, kind: AudioClip['kind']) {
  const { edit, time } = useEditorStore.getState()
  if (!edit) return
  const total = outputDuration(edit.clips)
  const start = Math.min(time, Math.max(0, total - MIN_AUDIO_CLIP_MS))
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
    if (selection.kind === 'effect') {
      get().change((e) => ({ ...e, effects: e.effects.filter((x) => x.id !== selection.id) }))
    } else if (selection.kind === 'audio') {
      get().change((e) => ({ ...e, audioClips: e.audioClips.filter((c) => c.id !== selection.id) }))
    } else if (selection.kind === 'clip') {
      get().change((e) =>
        e.clips.length > 1 ? { ...e, clips: removeClip(e.clips, selection.id) } : e,
      )
    } else {
      get().change((e) => ({ ...e, zooms: e.zooms.filter((z) => z.id !== selection.id) }))
    }
    set({ selection: null })
  },

  setClipSpeed(id, speed) {
    get().change((e) => ({ ...e, clips: setClipSpeed(e.clips, id, speed) }))
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
