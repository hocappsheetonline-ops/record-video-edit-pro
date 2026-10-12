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
  type CursorTrack,
  type EditState,
  type InputEvent,
  type Project,
  type Size,
  type Transcript,
  type Waveform,
} from '@lumora/core'
import { lumora } from '../api'

export type Selection = { kind: 'clip' | 'zoom'; id: string } | null

interface EditorStore {
  folder: string | null
  project: Project | null
  edit: EditState | null
  events: InputEvent[]
  transcript: Transcript | null
  /** Dạng sóng âm thanh (tải sau, không chặn việc mở trình chỉnh sửa). */
  waveform: Waveform | null
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
  deleteSelection(): void
  setClipSpeed(id: string, speed: number): void
  addZoomAtPlayhead(): void
  regenerateZooms(): void
}

const HISTORY_LIMIT = 100
let lastCoalesce: { key: string; at: number } | null = null

function tracksFor(project: Project, events: InputEvent[], smoothing: number) {
  const cursor = buildCursorTrack(events, project.segments, project.source.captureRect, smoothing)
  return { cursor, follow: cameraFollowTrack(cursor) }
}

const initial = {
  folder: null,
  project: null,
  edit: null,
  events: [],
  transcript: null,
  waveform: null,
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
    const tracks = tracksFor(
      project,
      events,
      (saved ?? createDefaultEdit(project)).cursor.smoothing,
    )
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
  },

  reset() {
    lastCoalesce = null
    set({ ...initial })
  },

  change(recipe, coalesce) {
    const { edit, project, events } = get()
    if (!edit || !project) return
    const next = recipe(edit)
    if (next === edit) return
    const now = Date.now()
    const merge = coalesce && lastCoalesce?.key === coalesce && now - lastCoalesce.at < 1500
    lastCoalesce = coalesce ? { key: coalesce, at: now } : null
    const past = merge ? get().past : [...get().past, edit].slice(-HISTORY_LIMIT)
    const patch: Partial<EditorStore> = { edit: next, past, future: [] }
    if (next.cursor.smoothing !== edit.cursor.smoothing)
      Object.assign(patch, tracksFor(project, events, next.cursor.smoothing))
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
      ...tracksFor(project, events, prev.cursor.smoothing),
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
      ...tracksFor(project, events, next.cursor.smoothing),
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
    get().change((e) => ({ ...e, clips: splitAt(e.clips, get().time) }))
  },

  deleteSelection() {
    const { selection } = get()
    if (!selection) return
    if (selection.kind === 'clip') {
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
