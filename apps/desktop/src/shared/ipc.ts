import type {
  AppSettings,
  AssistantCommand,
  AssistantContext,
  DirectorContext,
  DirectorPlan,
  AudioFx,
  Destination,
  Filmstrip,
  LiveComment,
  Waveform,
  CutSuggestion,
  Transcript,
  EditState,
  HighlightSegment,
  InputEvent,
  KeyStatus,
  KeyValidationResult,
  Project,
  Rect,
  RecordingOptions,
  SecretKey,
  TrackKind,
  WhisperModel,
  ZoomRegion,
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
  musicList: 'music:list',
  musicImport: 'music:import',
  musicAddPaths: 'music:add-paths',
  musicRemove: 'music:remove',
  musicUse: 'music:use',
  musicRecentDownloads: 'music:recent-downloads',
  musicOpenYouTube: 'music:open-youtube',
  musicFind: 'music:find',
  exportStart: 'export:start',
  exportWrite: 'export:write',
  exportFinish: 'export:finish',
  exportCancel: 'export:cancel',
  revealFile: 'files:reveal',
  projectSnapshot: 'project:snapshot',
  projectImportVideo: 'project:import-video',
  projectMerge: 'project:merge',
  aiTranscribe: 'ai:transcribe',
  aiGetTranscript: 'ai:get-transcript',
  aiSuggestCuts: 'ai:suggest-cuts',
  aiSummarize: 'ai:summarize',
  aiPlan: 'ai:plan',
  aiLocalModels: 'ai:local-models',
  aiPullModel: 'ai:pull-model',
  aiInstallOllama: 'ai:install-ollama',
  aiBenchmark: 'ai:benchmark',
  aiSpeechStatus: 'ai:speech-status',
  aiSpeechCatalog: 'ai:speech-catalog',
  aiSpeechInstall: 'ai:speech-install',
  aiSpeechDownload: 'ai:speech-download',
  aiSpeechRemove: 'ai:speech-remove',
  aiDirect: 'ai:direct',
  aiHighlights: 'ai:highlights',
  aiTranslate: 'ai:translate',
  aiEditCaptions: 'ai:edit-captions',
  aiPlanZooms: 'ai:plan-zooms',
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
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
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
  windowMaximized: 'window:maximized',
  localAiProgress: 'ai:local-progress',
} as const

/**
 * Tiến độ tải model / tải bộ cài Ollama / tải công cụ và model giọng nói cục bộ (gửi liên tục trong
 * lúc chạy). `kind: 'speech'` dùng chung kênh này; `item` cho biết đang tải gì (`whisper`, `piper`,
 * tên model Whisper hoặc tên giọng Piper).
 */
export interface LocalAiProgress {
  kind: 'pull' | 'install' | 'speech'
  status: string
  completed: number
  total: number
  item?: string
}

/** Công cụ giọng nói cục bộ: whisper.cpp (nhận dạng) hoặc Piper (giọng đọc). */
export type SpeechTool = 'whisper' | 'piper'

/** Loại dữ liệu tải về cho giọng nói cục bộ: model Whisper hoặc giọng Piper. */
export type SpeechAssetKind = 'model' | 'voice'

/** Trạng thái cài đặt giọng nói cục bộ trên máy này. */
export interface LocalSpeechStatus {
  /** false khi hệ điều hành / kiến trúc không có bản dựng sẵn (khi đó không cài được trong app). */
  supported: boolean
  platform: string
  whisper: { installed: boolean; models: WhisperModel[] }
  piper: { installed: boolean; voices: string[] }
}

/** Một giọng Piper tải được trong app. */
export interface PiperVoiceInfo {
  id: string
  language: 'vi' | 'en'
  label: string
  sizeMb: number
}

/** Một model Whisper tải được trong app. */
export interface WhisperModelInfo {
  id: WhisperModel
  label: string
  sizeMb: number
}

/** Danh mục model Whisper và giọng Piper mà app biết cách tải. */
export interface LocalSpeechCatalog {
  models: WhisperModelInfo[]
  voices: PiperVoiceInfo[]
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  /** false khi hệ điều hành không hỗ trợ mã hóa (khi đó không cho lưu API key). */
  encryptionAvailable: boolean
  /** Cửa sổ không viền: giao diện tự vẽ nút đóng / thu nhỏ / phóng to (macOS dùng nút hệ thống). */
  frameless: boolean
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

/** Dữ liệu gửi Claude để chỉnh các đoạn zoom theo yêu cầu. */
export interface ZoomPlanInput {
  /** Yêu cầu của người dùng (ví dụ "đặt mọi zoom 2.5×", "bỏ zoom ngắn hơn 2 giây"). */
  instruction: string
  zooms: ZoomRegion[]
  /** Thời lượng nguồn (ms). */
  durationMs: number
  /** Thời điểm nguồn các lần click chuột (ms). */
  clicks: number[]
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

/**
 * Một bài trong kho nhạc của người dùng: tải từ Thư viện âm thanh YouTube, file trên máy, hoặc
 * AI tự tìm trên Jamendo (nhạc Creative Commons: `credit` là dòng ghi nguồn để dán vào mô tả).
 */
export interface MusicTrack {
  file: string
  name: string
  durationMs: number
  addedAt: number
  source: 'youtube' | 'file' | 'jamendo'
  /** Dòng ghi nguồn bắt buộc với nhạc Creative Commons ("Tên bài" by Nghệ sĩ — CC BY 3.0). */
  credit?: string
  /** Mã bài trên kho online (để không tải lại). */
  origin?: { source: 'jamendo'; id: string }
}

/** Yêu cầu AI tự tìm nhạc nền (Jamendo) theo tâm trạng / nhịp / thời lượng video. */
export interface MusicFindQuery {
  mood: string
  tempo: 'slow' | 'medium' | 'fast'
  durationMs: number
}

/** File nhạc vừa xuất hiện trong thư mục Tải về (sau khi tải từ Thư viện âm thanh YouTube). */
export interface RecentDownload {
  path: string
  name: string
  modifiedAt: number
  bytes: number
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
  /** Cửa sổ không viền: điều khiển cửa sổ từ thanh tiêu đề tự vẽ. */
  minimizeWindow(): Promise<void>
  /** Phóng to / thu về; trả về trạng thái sau khi đổi. */
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
  isWindowMaximized(): Promise<boolean>
  onWindowMaximized(listener: (maximized: boolean) => void): Unsubscribe
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
  /** Kho nhạc: liệt kê, chọn file nhạc trên máy, thêm file kéo thả / vừa tải về, xóa. */
  listMusic(): Promise<MusicTrack[]>
  importMusic(): Promise<MusicTrack[]>
  addMusicPaths(paths: string[], source: MusicTrack['source']): Promise<MusicTrack[]>
  removeMusic(file: string): Promise<MusicTrack[]>
  /** Chép một bài trong kho vào dự án. */
  useMusic(folder: string, file: string): Promise<AudioAsset>
  /** Tự tìm và tải một bài nhạc nền miễn phí bản quyền (Jamendo) vào kho theo tâm trạng. */
  findMusic(query: MusicFindQuery): Promise<MusicTrack>
  /** File nhạc mới trong thư mục Tải về (để thêm bài vừa tải từ Thư viện âm thanh YouTube). */
  recentAudioDownloads(): Promise<RecentDownload[]>
  /** Mở Thư viện âm thanh YouTube (YouTube Studio) trong trình duyệt. */
  openYouTubeAudioLibrary(): Promise<void>
  startExport(folder: string): Promise<string>
  writeExport(id: string, position: number, data: ArrayBuffer): Promise<void>
  finishExport(id: string, folder: string, edit: EditState): Promise<ExportResult>
  cancelExport(id: string): Promise<void>
  /** Mở thư mục chứa một file đã xuất (chỉ trong thư mục dự án). */
  revealFile(path: string): Promise<void>
  /** Lưu ảnh PNG của khung hình đang xem vào thư mục `exports` của dự án. */
  saveSnapshot(folder: string, png: ArrayBuffer): Promise<ExportResult>

  /** Nhận dạng giọng nói (ElevenLabs). `language`: mã ISO hoặc rỗng để tự nhận diện. */
  transcribe(folder: string, language: string): Promise<Transcript>
  getTranscript(folder: string): Promise<Transcript | null>
  suggestCuts(folder: string): Promise<CutSuggestion[]>
  summarize(folder: string): Promise<AiSummary>
  /** Trợ lý AI: mô tả bằng lời → danh sách lệnh chỉnh sửa. */
  planEdits(instruction: string, context: AssistantContext): Promise<AssistantCommand[]>
  /**
   * Đạo diễn AI: từ câu yêu cầu + ngữ cảnh (thói quen, kho nhạc, lịch sử) → kế hoạch gồm tóm tắt,
   * câu hỏi làm rõ (nếu cần) và danh sách lệnh. Lỗi khi không có AI (thiếu key / Ollama tắt).
   */
  directEdits(goal: string, context: DirectorContext): Promise<DirectorPlan>
  /** AI chọn các đoạn hay nhất (thời gian trên bản quay gốc) để tách thành video ngắn. */
  highlights(folder: string, count: number): Promise<HighlightSegment[]>
  /** Model đã tải trong Ollama tại địa chỉ đó (AI cục bộ). */
  listLocalModels(baseUrl: string): Promise<string[]>
  /** Tải một model về Ollama (tiến độ qua `onLocalAiProgress`). */
  pullLocalModel(baseUrl: string, model: string): Promise<void>
  /** Tải bộ cài Ollama về máy rồi mở nó (Windows / macOS); nơi khác mở trang tải. */
  installOllama(): Promise<void>
  /** Chạy thử model cục bộ: thời gian nạp và token / giây trên máy này. */
  benchmarkLocalModel(
    baseUrl: string,
    model: string,
  ): Promise<{ loadMs: number; tokensPerSecond: number; totalMs: number }>
  onLocalAiProgress(listener: (p: LocalAiProgress) => void): Unsubscribe
  /** Giọng nói cục bộ (whisper.cpp + Piper): đã cài gì, đã tải model / giọng nào. */
  localSpeechStatus(): Promise<LocalSpeechStatus>
  /** Danh mục model Whisper và giọng Piper tải được trong app (kèm cỡ file). */
  localSpeechCatalog(): Promise<LocalSpeechCatalog>
  /** Tải và cài whisper.cpp hoặc Piper vào thư mục dữ liệu của app (tiến độ qua `onLocalAiProgress`). */
  installLocalSpeech(tool: SpeechTool): Promise<void>
  /** Tải một model Whisper hoặc giọng Piper (tiến độ qua `onLocalAiProgress`, `kind: 'speech'`). */
  downloadLocalSpeech(kind: SpeechAssetKind, id: string): Promise<void>
  /** Xóa một model Whisper hoặc giọng Piper đã tải. */
  removeLocalSpeech(kind: SpeechAssetKind, id: string): Promise<void>
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
  /** Sửa nội dung phụ đề bằng Claude theo yêu cầu (rỗng = sửa chính tả, dấu câu). */
  editCaptions(
    lines: { id: string; text: string }[],
    instruction: string,
    language: string,
  ): Promise<{ id: string; text: string }[]>
  /** Lập lại các đoạn zoom bằng Claude theo yêu cầu; trả về danh sách zoom mới (đã hợp lệ). */
  planZooms(folder: string, input: ZoomPlanInput): Promise<ZoomRegion[]>
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
