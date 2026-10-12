import type {
  AppSettings,
  CutSuggestion,
  Transcript,
  EditState,
  InputEvent,
  KeyStatus,
  KeyValidationResult,
  Project,
  Rect,
  RecordingOptions,
  SecretKey,
  TrackKind,
} from '@lumora/core'

/** Tên các kênh IPC giữa main process và giao diện. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  secretsStatus: 'secrets:status',
  secretsSave: 'secrets:save',
  secretsDelete: 'secrets:delete',
  secretsTest: 'secrets:test',
  appInfo: 'app:info',
  captureSources: 'recording:sources',
  recorderCapabilities: 'recording:capabilities',
  pickRegion: 'recording:pick-region',
  submitRegion: 'recording:submit-region',
  startRecording: 'recording:start',
  activeSession: 'recording:active-session',
  beginSegment: 'recording:begin-segment',
  trackStarted: 'recording:track-started',
  writeChunk: 'recording:chunk',
  endSegment: 'recording:end-segment',
  finishRecording: 'recording:finish',
  cancelRecording: 'recording:cancel',
  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsDelete: 'projects:delete',
  projectsReveal: 'projects:reveal',
  projectsGetEdit: 'projects:get-edit',
  projectsSaveEdit: 'projects:save-edit',
  projectsGetEvents: 'projects:get-events',
  exportStart: 'export:start',
  exportWrite: 'export:write',
  exportFinish: 'export:finish',
  exportCancel: 'export:cancel',
  revealFile: 'files:reveal',
  aiTranscribe: 'ai:transcribe',
  aiGetTranscript: 'ai:get-transcript',
  aiSuggestCuts: 'ai:suggest-cuts',
  aiSummarize: 'ai:summarize',
  aiTranslate: 'ai:translate',
  saveExportText: 'export:save-text',
} as const

/** Sự kiện main process gửi xuống giao diện. */
export const EVENTS = {
  recordingCommand: 'recording:command',
  recordingFinished: 'recording:finished',
  recordingError: 'recording:error',
} as const

export interface AppInfo {
  name: string
  version: string
  platform: string
  /** false khi hệ điều hành không hỗ trợ mã hóa (khi đó không cho lưu API key). */
  encryptionAvailable: boolean
}

export type SecretsStatus = Record<SecretKey, KeyStatus>

export interface DisplaySource {
  id: string
  /** Tên màn hình do hệ điều hành cung cấp (có thể rỗng). */
  label: string
  /** Vị trí và kích thước theo tọa độ logic (DIP). */
  bounds: Rect
  scaleFactor: number
  primary: boolean
  /** Ảnh xem trước dạng data URL, rỗng nếu không lấy được. */
  thumbnail: string
}

export interface WindowSource {
  id: string
  name: string
  thumbnail: string
}

export interface CaptureSources {
  displays: DisplaySource[]
  windows: WindowSource[]
}

export interface RecorderCapabilities {
  /** `ffmpeg`: quay màn hình ẩn con trỏ; `browser`: dùng bộ quay của Electron (có con trỏ). */
  screenEngine: 'ffmpeg' | 'browser'
  backend: string | null
  encoder: string | null
  /** Thu âm thanh hệ thống (loopback) — chỉ có trên Windows. */
  systemAudio: boolean
}

/** Thông tin cửa sổ thanh điều khiển cần để ghi các track phía giao diện. */
export interface ActiveSession {
  options: RecordingOptions
  rendererTracks: TrackKind[]
  /** Nguồn desktopCapturer cho track `screen` khi giao diện tự quay màn hình/cửa sổ. */
  screenSourceId: string | null
}

export interface SegmentStart {
  index: number
  rendererTracks: TrackKind[]
}

export type RecordingCommand = 'stop' | 'toggle-pause'

export interface ProjectSummary {
  folder: string
  id: string
  name: string
  createdAt: string
  durationMs: number
  sourceKind: Project['source']['kind']
  hasThumbnail: boolean
}

export interface AiSummary {
  titles: string[]
  description: string
  hashtags: string[]
  /** Chương theo thời gian nguồn (ms). */
  chapters: { start: number; title: string }[]
}

export interface ExportResult {
  path: string
  fileName: string
}

export type Unsubscribe = () => void

/** API mà preload cung cấp cho giao diện qua `window.lumora`. */
export interface LumoraApi {
  getAppInfo(): Promise<AppInfo>
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getSecretsStatus(): Promise<SecretsStatus>
  saveSecret(key: SecretKey, value: string): Promise<SecretsStatus>
  deleteSecret(key: SecretKey): Promise<SecretsStatus>
  /** Kiểm tra key bằng cách gọi API thật. Nếu không truyền `value` thì kiểm tra key đã lưu. */
  testSecret(key: SecretKey, value?: string): Promise<KeyValidationResult>

  getCaptureSources(): Promise<CaptureSources>
  getRecorderCapabilities(): Promise<RecorderCapabilities>
  /** Mở lớp phủ trên màn hình để kéo chọn vùng. Trả về vùng (DIP, tương đối với màn hình) hoặc null. */
  pickRegion(displayId: string): Promise<Rect | null>
  submitRegion(region: Rect | null): Promise<void>
  startRecording(options: RecordingOptions): Promise<void>

  getActiveSession(): Promise<ActiveSession | null>
  beginSegment(): Promise<SegmentStart>
  trackStarted(index: number, kind: TrackKind, startedAt: number): Promise<void>
  writeChunk(index: number, kind: TrackKind, data: ArrayBuffer): Promise<void>
  endSegment(): Promise<void>
  finishRecording(): Promise<void>
  cancelRecording(): Promise<void>
  onRecordingCommand(listener: (command: RecordingCommand) => void): Unsubscribe
  onRecordingFinished(listener: (folder: string) => void): Unsubscribe
  onRecordingError(listener: (message: string) => void): Unsubscribe

  listProjects(): Promise<ProjectSummary[]>
  getProject(folder: string): Promise<Project | null>
  deleteProject(folder: string): Promise<ProjectSummary[]>
  revealProject(folder: string): Promise<void>

  /** Bản chỉnh sửa đã lưu (edit.json), hoặc null nếu chưa chỉnh sửa lần nào. */
  getEdit(folder: string): Promise<EditState | null>
  saveEdit(folder: string, edit: EditState): Promise<void>
  getEvents(folder: string): Promise<InputEvent[]>
  startExport(folder: string): Promise<string>
  writeExport(id: string, position: number, data: ArrayBuffer): Promise<void>
  finishExport(id: string, folder: string, edit: EditState): Promise<ExportResult>
  cancelExport(id: string): Promise<void>
  /** Mở thư mục chứa một file đã xuất (chỉ trong thư mục dự án). */
  revealFile(path: string): Promise<void>

  /** Nhận dạng giọng nói (ElevenLabs). `language`: mã ISO hoặc rỗng để tự nhận diện. */
  transcribe(folder: string, language: string): Promise<Transcript>
  getTranscript(folder: string): Promise<Transcript | null>
  suggestCuts(folder: string): Promise<CutSuggestion[]>
  summarize(folder: string): Promise<AiSummary>
  translateLines(
    lines: { id: string; text: string }[],
    target: string,
  ): Promise<{ id: string; text: string }[]>
  /** Lưu file văn bản (phụ đề SRT/VTT, mô tả...) vào thư mục exports của dự án. */
  saveExportText(folder: string, fileName: string, content: string): Promise<ExportResult>
}
