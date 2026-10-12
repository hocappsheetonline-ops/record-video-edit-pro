import type {
  AppSettings,
  AudioFx,
  Destination,
  Filmstrip,
  LiveComment,
  Waveform,
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
  projectsRename: 'projects:rename',
  projectsLock: 'projects:lock',
  projectsUnlock: 'projects:unlock',
  logRenderer: 'log:renderer',
  projectsDuplicate: 'projects:duplicate',
  projectsReveal: 'projects:reveal',
  projectsGetEdit: 'projects:get-edit',
  projectsSaveEdit: 'projects:save-edit',
  projectsGetEvents: 'projects:get-events',
  projectsWaveform: 'projects:waveform',
  projectsFilmstrip: 'projects:filmstrip',
  projectsSharePack: 'projects:share-pack',
  projectsImportPack: 'projects:import-pack',
  assetsAddAudio: 'assets:add-audio',
  assetsAddSfx: 'assets:add-sfx',
  assetsPeaks: 'assets:peaks',
  assetsAddImage: 'assets:add-image',
  assetsVoiceover: 'assets:voiceover',
  audioProcess: 'audio:process',
  clipReverse: 'clip:reverse',
  memesList: 'memes:list',
  memesImport: 'memes:import',
  memesRemove: 'memes:remove',
  memesUse: 'memes:use',
  memesAddPaths: 'memes:add-paths',
  exportStart: 'export:start',
  exportWrite: 'export:write',
  exportFinish: 'export:finish',
  exportCancel: 'export:cancel',
  revealFile: 'files:reveal',
  projectImportVideo: 'project:import-video',
  projectMerge: 'project:merge',
  aiTranscribe: 'ai:transcribe',
  aiGetTranscript: 'ai:get-transcript',
  aiSuggestCuts: 'ai:suggest-cuts',
  aiSummarize: 'ai:summarize',
  aiTranslate: 'ai:translate',
  aiVoices: 'ai:voices',
  aiSpeak: 'ai:speak',
  onlineSearch: 'online:search',
  onlineDownload: 'online:download',
  cacheInfo: 'cache:info',
  cacheClear: 'cache:clear',
  saveExportText: 'export:save-text',
  liveGetConfig: 'live:get-config',
  liveUpdateConfig: 'live:update-config',
  liveSecrets: 'live:secrets',
  liveSetSecret: 'live:set-secret',
  liveOpenRoom: 'live:open-room',
  liveCloseRoom: 'live:close-room',
  liveStart: 'live:start',
  liveWrite: 'live:write',
  liveStop: 'live:stop',
  liveCommentsStart: 'live:comments-start',
  liveCommentsStop: 'live:comments-stop',
  liveCaption: 'live:caption',
  updateState: 'update:state',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  openLogs: 'app:open-logs',
} as const

/** Sự kiện main process gửi xuống giao diện. */
export const EVENTS = {
  updateState: 'update:state-changed',
  liveStatus: 'live:status',
  liveEnded: 'live:ended',
  liveComments: 'live:comments',
  liveCommentError: 'live:comment-error',
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

/** Trạng thái tự cập nhật (GitHub Releases). */
export type UpdateState =
  | { state: 'unsupported' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

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
  /** Nguồn desktopCapturer (`screen:…`) để chia sẻ màn hình trong studio live. */
  sourceId?: string
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

export interface LiveConfig {
  destinations: Destination[]
  resolution: 720 | 1080
  /** kbps */
  videoBitrate: number
  /** Lưu một bản trong máy và tạo dự án để chỉnh sửa sau buổi live. */
  recordLocally: boolean
  /** Địa chỉ công khai (nếu có) để tạo link mời khách qua internet. */
  publicUrl: string
  youtubeVideoId: string
  facebookVideoId: string
}

export type LiveSecretName = `stream:${string}` | 'youtube-api-key' | 'facebook-token'

export interface LiveSecretsStatus {
  /** Đích phát nào đã có stream key. */
  streamKeys: Record<string, boolean>
  youtubeApiKey: boolean
  facebookToken: boolean
}

export interface GuestRoom {
  room: string
  hostKey: string
  port: number
  inviteUrls: string[]
}

export interface LiveStatus {
  seconds: number
  bitrate: number
  fps: number
  destinations: Record<string, { state: 'connecting' | 'live' | 'error'; message?: string }>
}

export interface LiveEnded {
  /** Lỗi khiến buổi phát dừng (null nếu dừng bình thường). */
  error: string | null
  /** Dự án tạo từ bản ghi trong máy (nếu bật). */
  folder: string | null
}

/** `full`: video + bản chỉnh sửa (gửi lần đầu). `edits`: chỉ bản chỉnh sửa (gửi qua lại). */
export type PackMode = 'full' | 'edits'

export interface PackImportResult {
  folder: string
  status: 'created' | 'updated'
  mode: PackMode
}

export interface AudioAsset {
  file: string
  name: string
  durationMs: number
}

/** Nguồn tìm trên kho online: video / ảnh Pixabay. */
export const ONLINE_SOURCES = ['pixabayVideo', 'pixabayImage'] as const
export type OnlineSource = (typeof ONLINE_SOURCES)[number]

/** Một kết quả tìm kiếm trên kho online (URL đều là của máy chủ kho, không chứa key). */
export interface OnlineItem {
  id: string
  source: 'pixabay'
  kind: 'gif' | 'video' | 'image' | 'sticker'
  title: string
  thumbUrl: string
  /** Bản nhỏ để phát thử khi rê chuột. */
  previewUrl: string
  downloadUrl: string
  width: number
  height: number
  durationMs: number
}

export interface OnlineSearch {
  items: OnlineItem[]
  /** Mã trang tiếp theo (null khi hết). */
  next: string | null
  /** Dòng ghi nguồn bắt buộc hiện dưới kết quả. */
  attribution: string
}

/** Ảnh / GIF / video meme đã chép vào dự án hoặc thư viện. */
export interface MediaAsset {
  file: string
  name: string
  width: number
  height: number
  kind: 'image' | 'video'
  /** Video: độ dài (ms) và có tiếng hay không. Ảnh: 0 / false. */
  durationMs: number
  hasAudio: boolean
}

/**
 * Nguồn gốc của mục tải từ kho online (để không tải lại và ghi nguồn). `tenor` chỉ còn ở các
 * file đã tải trước khi Tenor ngừng hoạt động; không tải thêm được nữa.
 */
export interface MemeOrigin {
  source: 'tenor' | 'pixabay'
  id: string
}

export interface MemeItem extends MediaAsset {
  /** Ảnh thu nhỏ (data URL). */
  thumb: string
  origin?: MemeOrigin
}

export type Unsubscribe = () => void

/** API mà preload cung cấp cho giao diện qua `window.lumora`. */
export interface LumoraApi {
  getAppInfo(): Promise<AppInfo>
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  installUpdate(): Promise<void>
  onUpdateState(listener: (state: UpdateState) => void): Unsubscribe
  /** Mở thư mục nhật ký lỗi (gửi kèm khi báo lỗi). */
  openLogs(): Promise<void>
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
  /** Đánh dấu dự án đang mở; `recovered` khi lần trước app tắt đột ngột lúc đang chỉnh sửa. */
  lockProject(folder: string): Promise<{ recovered: boolean }>
  unlockProject(folder: string): Promise<void>
  /** Ghi lỗi giao diện vào nhật ký (main.log). */
  reportError(message: string): Promise<void>
  /** Đổi tên hiển thị của dự án. */
  renameProject(folder: string, name: string): Promise<Project>
  /** Nhân đôi dự án; trả về thư mục của bản sao. */
  duplicateProject(folder: string, suffix: string): Promise<string>
  deleteProject(folder: string): Promise<ProjectSummary[]>
  revealProject(folder: string): Promise<void>

  /** Bản chỉnh sửa đã lưu (edit.json), hoặc null nếu chưa chỉnh sửa lần nào. */
  getEdit(folder: string): Promise<EditState | null>
  saveEdit(folder: string, edit: EditState): Promise<void>
  getEvents(folder: string): Promise<InputEvent[]>
  /** Dạng sóng âm thanh của bản quay (null nếu không có âm thanh). */
  getWaveform(folder: string): Promise<Waveform | null>
  /** Ảnh thu nhỏ của video màn hình cho dải phim trên timeline (null nếu không có). */
  getFilmstrip(folder: string): Promise<Filmstrip | null>
  /** Đóng gói dự án thành file .lumorapack (hỏi nơi lưu). null nếu người dùng hủy. */
  sharePack(folder: string, mode: PackMode): Promise<{ path: string; bytes: number } | null>
  /** Chọn và nhập file .lumorapack. null nếu người dùng hủy. */
  importPack(): Promise<PackImportResult | null>
  /** Chọn file nhạc trên máy và chép vào dự án. null nếu người dùng hủy. */
  addAudioFile(folder: string): Promise<AudioAsset | null>
  /** Tạo hiệu ứng âm thanh có sẵn trong dự án. */
  addSoundEffect(folder: string, id: string): Promise<AudioAsset>
  /** Dạng sóng của một file âm thanh đã thêm vào dự án. */
  getAssetPeaks(folder: string, file: string): Promise<Waveform | null>
  /** Chọn ảnh / GIF / video trên máy và chép vào dự án. null nếu người dùng hủy. */
  addImageFile(folder: string): Promise<MediaAsset | null>
  /** Thư viện meme của riêng bạn (dùng lại ở mọi dự án). */
  listMemes(): Promise<MemeItem[]>
  importMemes(): Promise<MemeItem[]>
  /** Thêm file kéo thả vào thư viện (đường dẫn lấy bằng `pathForFile`). */
  addMemePaths(paths: string[]): Promise<MemeItem[]>
  /** Đường dẫn thật của file kéo thả vào cửa sổ ('' nếu không có). */
  pathForFile(file: File): string
  removeMeme(file: string): Promise<MemeItem[]>
  useMeme(folder: string, file: string): Promise<MediaAsset>
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
  /** Lưu bản lồng tiếng vừa ghi (WebM) vào dự án. */
  addVoiceover(folder: string, data: ArrayBuffer): Promise<AudioAsset>
  /** Lọc tạp âm / hiệu ứng giọng cho một file trong dự án; trả về tên file đã xử lý. */
  processAudio(folder: string, file: string, fx: AudioFx): Promise<string>
  /** Tạo (nếu chưa có) file đảo ngược cho các track của clip; trả tên file theo track. */
  reverseClip(
    folder: string,
    sourceStart: number,
    sourceEnd: number,
  ): Promise<Partial<Record<'screen' | 'camera' | 'mic' | 'system', string>>>
  /**
   * Nhập video từ máy làm clip chính ở cuối dự án (`file` có sẵn khi kéo thả, không có thì mở hộp
   * thoại chọn file). Trả về dự án đã cập nhật, null nếu hủy.
   */
  importVideo(folder: string, file?: string): Promise<Project | null>
  /** Ghép bản quay `other` vào cuối dự án `folder`. Trả về dự án đã cập nhật. */
  mergeProject(folder: string, other: string): Promise<Project>
  /** Giọng đọc AI có trong tài khoản ElevenLabs. */
  listVoices(): Promise<{ id: string; name: string }[]>
  /** Đọc câu bằng giọng AI và chép vào dự án (meme sound, lời bình). */
  speak(
    folder: string,
    text: string,
    voiceId: string,
    options?: { speed?: number; stability?: number },
  ): Promise<AudioAsset>
  /** Tìm trên kho online (Pixabay). */
  onlineSearch(source: OnlineSource, q: string, next: string | null): Promise<OnlineSearch>
  /** Tải một kết quả vừa tìm được vào thư viện meme. */
  onlineDownload(source: 'pixabay', id: string): Promise<MemeItem>
  /** Dung lượng bộ nhớ đệm (byte). */
  cacheInfo(): Promise<number>
  cacheClear(): Promise<number>
  translateLines(
    lines: { id: string; text: string }[],
    target: string,
  ): Promise<{ id: string; text: string }[]>
  /** Lưu file văn bản (phụ đề SRT/VTT, mô tả...) vào thư mục exports của dự án. */
  saveExportText(folder: string, fileName: string, content: string): Promise<ExportResult>

  getLiveConfig(): Promise<LiveConfig>
  updateLiveConfig(patch: Partial<LiveConfig>): Promise<LiveConfig>
  getLiveSecrets(): Promise<LiveSecretsStatus>
  /** Lưu (hoặc xóa khi rỗng) stream key/token đã mã hóa. */
  setLiveSecret(name: LiveSecretName, value: string): Promise<LiveSecretsStatus>
  openGuestRoom(): Promise<GuestRoom>
  closeGuestRoom(): Promise<void>
  startLive(video: { width: number; height: number; fps: number }): Promise<void>
  writeLive(data: ArrayBuffer): Promise<void>
  stopLive(): Promise<LiveEnded>
  startComments(platforms: ('youtube' | 'facebook')[]): Promise<void>
  stopComments(): Promise<void>
  /** Nhận dạng một đoạn âm thanh ngắn (WebM) cho phụ đề trực tiếp. */
  transcribeLiveChunk(data: ArrayBuffer, language: string): Promise<string>
  onLiveStatus(listener: (status: LiveStatus) => void): Unsubscribe
  onLiveEnded(listener: (ended: LiveEnded) => void): Unsubscribe
  onLiveComments(listener: (comments: LiveComment[]) => void): Unsubscribe
  onLiveCommentError(listener: (message: string) => void): Unsubscribe
}
