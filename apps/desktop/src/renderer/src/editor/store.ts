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
  updateAllZooms,
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
  newOverlayId,
  templateStyle,
  addMarker,
  applyProjectTemplate,
  DEFAULT_CLIP_AUDIO,
  detachClipAudio,
  isClipboardEmpty,
  newClipId,
  sourceSegments,
  markerNear,
  pasteClipboard,
  rippleDelete,
  rippleDeleteAudio,
  type ClipboardData,
  type Marker,
  type TimelineRow,
  type TrackState,
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
  NO_ANIM,
  editPose,
  overlayPose,
  keyframeAt,
  removeKeyframe,
  setKeyframe,
  type Pose,
  canReverse,
  type SpeedCurve,
  buildCaptionLines,
  normalizeAssistantCommands,
  parseAssistantRequest,
  sourceToOutput,
  type AssistantCommand,
  findFillerWords,
  findQuietRanges,
  findSilences,
  removeSourceRanges,
  wordsToRanges,
  type SourceRange,
  withCaptionTemplate,
  applyCaptionEmojis,
  applyCaptionKeywords,
  suggestCaptionEmoji,
  suggestCaptionKeywords,
  planDubClips,
  dubSlots,
  dubSpeedFor,
  EMPTY_MEMORY,
  forgetRule,
  isStandingRule,
  learnFromEdit,
  memorySummary,
  normalizeDirectorPlan,
  planLocally,
  rememberRule,
  aspectRatio,
  autoBuildGoal,
  MIN_SHORTS_SOURCE_MS,
  normalizeAutoBuildOptions,
  pickAutoFormat,
  planAutoBuildLocally,
  reviewBuild,
  type AutoBuildOptions,
  type BuildReview,
  type HighlightSegment,
  type RecipeStyle,
  type DirectorContext,
  type DirectorMessage,
  type DirectorPlan,
  type StyleMemory,
  type ZoomRegion,
  editSummary,
  expandRecipes,
  outputClicks,
  presetCurve,
  transcriptExcerpt,
  BEAUTY_PRESET,
  captionYOf,
  clipDuration,
  cornerPlacement,
  DEFAULT_ADJUST,
  DEFAULT_TRANSFORM,
  initialClips,
  isDefaultTransform,
  NO_BEAUTY,
  type ClearTarget,
  type ClipTransform,
  type OverlayPosition,
} from '@lumora/core'
import type { AudioAsset, MediaAsset, MusicTrack } from '@shared/ipc'
import { lumora } from '../api'
import i18n from '../i18n'
import { loadPrefs, savePrefs } from '../lib/prefs'
import { useJobs } from './jobs'
import { useAppStore } from '../store/app'
import {
  buildOverlay,
  previewWindow,
  samePreview,
  type PreviewWindow,
  type TryPreview,
} from './try-preview'

/** Mục chọn được nhiều cùng lúc (Ctrl+click, kéo khung chọn, Ctrl+A). */
export type MultiKind = 'overlay' | 'effect' | 'audio'
export interface SelItem {
  kind: MultiKind
  id: string
}
const isMulti = (k: string | undefined): k is MultiKind =>
  k === 'overlay' || k === 'effect' || k === 'audio'

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
  tabRequest: { tab: string; section?: string; n: number }
  /** Yêu cầu mở một tab của bảng thuộc tính dự án (bên phải), ví dụ "zoom". */
  propsTabRequest: { tab: string; n: number }
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
  /** Các mục đang chọn (lớp phủ, hiệu ứng, âm thanh); gồm cả `selection` nếu nó thuộc loại này. */
  selected: SelItem[]
  /** Nội dung đã sao chép (Ctrl+C / Ctrl+X). */
  clipboard: ClipboardData | null
  /** Xem trước đang ở chất lượng nhẹ (540p) vì máy chậm hoặc do cài đặt. */
  lowPreview: boolean
  /** Tỉ lệ khung xem trước: vừa khung, hoặc phần trăm cỡ thật (25–200). */
  previewZoom: 'fit' | number
  /** Đường gióng trên khung xem trước. */
  guides: 'none' | 'thirds' | 'safe'
  /** Mục đang xem thử (rê chuột trong thư viện): vẽ lên khung xem trước, không lưu vào dự án. */
  preview: TryPreview | null
  /** Khoảng phát thử (lặp lại); null khi chỉ nghe thử nhạc. */
  previewWindow: PreviewWindow | null
  /** Đầu phát và trạng thái phát trước khi xem thử (trả lại khi thôi). */
  previewReturn: { time: number; playing: boolean } | null
  /** Hít dính khi kéo trên timeline (phím N). */
  snapping: boolean
  /** Vạch hít dính đang hiện (ms), null nếu không hít. */
  snapLine: number | null
  past: EditState[]
  future: EditState[]
  loadError: string | null
  /** Hội thoại với Đạo diễn AI của dự án đang mở (lưu theo thư mục dự án). */
  directorMessages: DirectorMessage[]
  /** Kế hoạch đang chờ người dùng (có câu hỏi làm rõ, hoặc bật "hỏi trước khi làm"). */
  directorPlan: DirectorPlan | null
  directorBusy: boolean
  /** Thói quen chỉnh sửa đã học + quy tắc người dùng dặn (dùng chung mọi dự án). */
  memory: StyleMemory
  /** Đạo diễn AI hỏi xác nhận trước khi thực hiện. */
  askConfirm: boolean
  /** Tăng mỗi lần yêu cầu mở hộp thoại xuất (trang chỉnh sửa theo dõi). */
  exportRequest: number
  /** Bật thì bảng Xuất tự bắt đầu xuất ngay khi hiện rồi tắt cờ. */
  autoExport: boolean

  load(folder: string): Promise<void>
  reset(): void
  /** Đổi bản chỉnh sửa. `coalesce`: các thay đổi liên tiếp cùng khóa (kéo thanh trượt) chỉ tính một bước hoàn tác. */
  change(recipe: (edit: EditState) => EditState, coalesce?: string): void
  undo(): void
  redo(): void
  /** Quay về một bước trong Lịch sử (vị trí trong [...past, edit, ...future]). */
  jumpHistory(index: number): void
  setTime(ms: number): void
  setPlaying(playing: boolean): void
  select(selection: Selection): void
  /** Ctrl+click: thêm / bớt một mục khỏi nhóm đang chọn. */
  toggleSelect(item: SelItem): void
  /** Chọn đúng các mục này (kéo khung chọn). */
  selectMany(items: SelItem[]): void
  /** Ctrl+A: chọn mọi lớp phủ, hiệu ứng, đoạn âm thanh (bỏ qua hàng bị khóa). */
  selectAll(): void
  isSelected(kind: string, id: string): boolean
  /** Sao chép các mục đang chọn; trả về false nếu không có gì để chép. */
  copySelection(): boolean
  cutSelection(): void
  /** Dán tại đầu phát (giữ khoảng cách tương đối); chọn các mục vừa dán. */
  paste(): void
  /** Nhân đôi các mục đang chọn, đặt ngay sau mục kết thúc muộn nhất. */
  duplicateSelection(): void
  /** Shift+Delete: xóa rồi dồn các mục phía sau cùng hàng sang trái. */
  rippleDeleteSelection(): void
  setSnapping(on: boolean): void
  setGuides(mode: EditorStore['guides']): void
  setPreviewZoom(zoom: EditorStore['previewZoom']): void
  /**
   * Xem thử một mục thư viện (như CapCut): hiệu ứng / bộ lọc / chuyển cảnh / lớp thì phát thử
   * một đoạn ngắn từ đầu phát rồi lặp; nhạc thì nghe thử (timeline dừng). Gọi lại với cùng mục
   * thì giữ nguyên.
   */
  tryPreview(preview: TryPreview): void
  /** Thôi xem thử: trả đầu phát và trạng thái phát về như trước. */
  endPreview(): void
  setSnapLine(t: number | null): void
  /** Đổi thứ tự vẽ của lớp phủ (lên / xuống một lớp, lên trên cùng, xuống dưới cùng). */
  reorderOverlay(id: string, to: 'up' | 'down' | 'top' | 'bottom'): void
  /** Thêm marker tại đầu phát (phím M). */
  addMarkerAtPlayhead(label?: string): void
  updateMarker(id: string, patch: Partial<Omit<Marker, 'id'>>, coalesce?: string): void
  removeMarker(id: string): void
  /** Nhảy tới marker sau (1) / trước (-1). */
  jumpMarker(dir: 1 | -1): void
  /**
   * Nhập video từ máy làm clip chính ở cuối video (`file` khi kéo thả; không có thì mở hộp thoại).
   * Trả về false nếu người dùng hủy.
   */
  importVideo(file?: string): Promise<boolean>
  /** Ghép bản quay khác (thư mục `other`) vào cuối video. */
  mergeProject(other: string): Promise<void>
  /** Tách tiếng clip chính thành đoạn âm thanh riêng, tắt tiếng clip. False nếu không tách được. */
  detachClipAudio(id: string, names: { mic: string; system: string }): boolean
  /** Ẩn / tắt tiếng / khóa một hàng trên timeline. */
  setTrack(row: TimelineRow, patch: Partial<TrackState>): void
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
  /** Thêm một bài trong kho nhạc (Thư viện âm thanh YouTube / file) làm nhạc nền tại đầu phát. */
  addMusicFromLibrary(file: string): Promise<void>
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
  /** Mở một mục thư viện (và mục con, ví dụ Âm thanh → Lồng tiếng). */
  requestTab(tab: string, section?: string): void
  requestPropsTab(tab: string): void
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
  /**
   * AI tự biên tập: cắt khoảng lặng và từ thừa, tự zoom theo chuột, thêm phụ đề, làm sạch
   * âm thanh, thêm tiêu đề mở đầu — tất cả là một bước hoàn tác. Trả về kết quả từng bước.
   */
  autoEdit(
    options: AutoEditOptions,
    onProgress?: (done: number, total: number, step: AutoEditStep) => void,
  ): Promise<AutoEditReport[]>
  /**
   * Trợ lý AI (kiểu EditPilot): mô tả bằng lời → Claude ra lệnh (không có key thì hiểu theo từ
   * khóa) → thực hiện tất cả trong một bước hoàn tác. Trả về lệnh đã hiểu và kết quả từng bước AI.
   */
  runAssistant(
    instruction: string,
    onProgress?: (done: number, total: number, step: AutoEditStep) => void,
  ): Promise<{ commands: AssistantCommand[]; report: AutoEditReport[] }>
  /**
   * Thực hiện danh sách lệnh của trợ lý / Đạo diễn AI trong một bước hoàn tác. Các lệnh AI (cắt
   * khoảng lặng, từ thừa, zoom, phụ đề, làm sạch âm thanh) đi qua `autoEdit`; lệnh `export` được
   * làm sau cùng (mở hộp thoại xuất và tự xuất). Trả về kết quả từng lệnh.
   */
  applyAssistantCommands(
    commands: AssistantCommand[],
    onProgress?: (done: number, total: number, step: AutoEditStep) => void,
  ): Promise<AutoEditReport[]>
  /**
   * Đạo diễn AI: gửi yêu cầu kèm ngữ cảnh (thói quen, kho nhạc, dự án khác, lịch sử) → kế hoạch.
   * Có câu hỏi làm rõ hoặc bật "hỏi trước khi làm" thì giữ kế hoạch chờ (`directorPlan`), không
   * thì thực hiện luôn. Câu "luôn… / từ nay…" được ghi thành quy tắc lâu dài.
   */
  askDirector(
    text: string,
    onProgress?: (done: number, total: number, step: AutoEditStep) => void,
  ): Promise<{ plan: DirectorPlan; applied: boolean; report: AutoEditReport[] }>
  /** Thực hiện kế hoạch đang chờ. */
  applyDirectorPlan(
    onProgress?: (done: number, total: number, step: AutoEditStep) => void,
  ): Promise<AutoEditReport[]>
  discardDirectorPlan(): void
  /** Ghi / bỏ một quy tắc người dùng dặn ("luôn thêm phụ đề"). */
  rememberDirectorRule(text: string): void
  forgetDirectorRule(text: string): void
  setAskConfirm(v: boolean): void
  /** Học thói quen từ bản chỉnh sửa hiện tại (gọi khi tự lưu). */
  learnFromCurrentEdit(): void
  /** Yêu cầu mở hộp thoại xuất; `autoStart` thì bắt đầu xuất ngay. */
  requestExport(autoStart: boolean): void
  /**
   * Chia video thành nhiều video ngắn: mỗi đoạn (theo chương AI hoặc mỗi N giây) thành một dự án
   * riêng (bản sao) chỉ giữ phần đó, tuỳ chọn khung dọc 9:16. Trả về số dự án đã tạo.
   */
  /**
   * Phụ đề kiểu app Captions: AI gắn emoji hợp nghĩa cho từng dòng (không có AI thì theo từ điển).
   * Trả về số dòng có emoji.
   */
  addCaptionEmojis(): Promise<number>
  /** AI chọn từ khóa mỗi dòng phụ đề để tô màu riêng (không có AI thì theo quy tắc). Trả về số dòng. */
  addCaptionKeywords(): Promise<number>
  /**
   * Lồng tiếng AI: dịch các dòng phụ đề sang `language` (nếu khác ngôn ngữ gốc), đọc từng dòng
   * bằng giọng AI đúng thời điểm dòng trên video xuất (đọc nhanh hơn tới 1,2× khi câu dài hơn chỗ
   * trống), tắt tiếng micro gốc (hoặc giữ nhỏ khi `keepOriginal`), phụ đề đổi sang ngôn ngữ đích.
   * Một bước hoàn tác. Trả về số đoạn lồng tiếng đã thêm.
   */
  dubCaptions(options: {
    language: string
    keepOriginal?: boolean
    /** Id hoặc tên giọng; bỏ trống = giọng đầu tiên trong danh sách. */
    voiceName?: string
    onProgress?: (done: number, total: number) => void
  }): Promise<number>
  splitIntoShorts(
    options: {
      mode: 'chapters' | 'fixed' | 'highlights'
      seconds?: number
      vertical?: boolean
      /** Số đoạn hay nhất muốn tách (mode highlights, mặc định 3). */
      count?: number
      /** Đoạn ngắn nhất (ms, mặc định 5 giây); đoạn cuối ngắn hơn thì gộp vào đoạn trước. */
      minMs?: number
    },
    onProgress?: (done: number, total: number) => void,
  ): Promise<number>
  /**
   * Tự dựng một nút: lập kế hoạch (AI, một lần gọi với lời nhắc tĩnh được cache; không có AI
   * thì công thức có sẵn) → áp dụng → rà soát theo sổ tay và lấp chỗ thiếu (local, không tốn
   * token) → tuỳ chọn tách 2-3 video ngắn. Tất cả là một bước hoàn tác.
   */
  autoBuild(
    options: Partial<AutoBuildOptions>,
    onProgress?: (done: number, total: number, step: string) => void,
  ): Promise<AutoBuildResult>
  /** (nội bộ) Tách các đoạn AI chọn thành video ngắn dọc có hook; gọi qua `splitIntoShorts`. */
  splitHighlights(
    options: { count?: number; vertical?: boolean },
    onProgress?: (done: number, total: number) => void,
  ): Promise<number>
  /** Đổi cùng một thuộc tính (mức zoom, kiểu, tâm) cho mọi đoạn zoom. */
  updateAllZooms(
    patch: Partial<Pick<ZoomRegion, 'scale' | 'mode' | 'x' | 'y'>>,
    coalesce?: string,
  ): void
  /** Thay toàn bộ danh sách zoom (kết quả Claude đề xuất); bỏ chọn đoạn không còn. */
  setZooms(zooms: ZoomRegion[]): void
}

/** Đoạn ngắn nhất khi chia video (ms); đoạn cuối ngắn hơn thì gộp vào đoạn trước. */
const MIN_SHORT_MS = 5000

/** Kết quả tự dựng một nút. */
export interface AutoBuildResult {
  format: RecipeStyle
  /** Kế hoạch đã chạy (lệnh của AI + lệnh rà soát bổ sung). */
  commands: AssistantCommand[]
  report: AutoEditReport[]
  review: BuildReview
  /** Số video ngắn đã tách (0 nếu không yêu cầu / video quá ngắn). */
  shorts: number
  /** Dòng ghi nguồn nhạc nền (nhạc Creative Commons) để dán vào mô tả video. */
  credits: string[]
  /** Kế hoạch do AI (true) hay công thức có sẵn (false). */
  ai: boolean
}

export interface AutoEditOptions {
  silences: boolean
  fillers: boolean
  zooms: boolean
  captions: boolean
  audio: boolean
  title: boolean
}
export type AutoEditStep = keyof AutoEditOptions
export const AUTO_EDIT_STEPS: readonly AutoEditStep[] = [
  'silences',
  'fillers',
  'zooms',
  'captions',
  'audio',
  'title',
]
export interface AutoEditReport {
  /**
   * Bước AI tự biên tập (silences, captions…), hoặc loại lệnh của trợ lý / Đạo diễn AI (title,
   * effect, music, export…).
   */
  step: AutoEditStep | AssistantCommand['kind']
  status: 'done' | 'skipped' | 'error'
  /** Số đoạn / mục đã thêm (done), hoặc mã lý do (skipped / error). */
  detail: number | string
}

/** Khóa lưu thói quen chỉnh sửa (dùng chung mọi dự án) và tùy chọn của Đạo diễn AI. */
const MEMORY_KEY = 'lumora.ai-memory'
const DIRECTOR_PREFS_KEY = 'lumora.director-prefs'
const directorKey = (folder: string) => `lumora.director.${folder}`
/** Giữ tối đa bấy nhiêu lượt hội thoại cho mỗi dự án. */
const DIRECTOR_HISTORY_LIMIT = 100
/** Gửi cho AI bấy nhiêu lượt gần nhất làm ngữ cảnh. */
const DIRECTOR_CONTEXT_TURNS = 8
/** Câu hỏi khi AI không hiểu yêu cầu. */
const DIRECTOR_FALLBACK_QUESTION =
  'Bạn muốn làm gì với video này? Ví dụ: cắt khoảng lặng, thêm phụ đề, nhạc nền, xuất 9:16…'
const EMPTY_PLAN: DirectorPlan = { summary: '', questions: [], commands: [] }

/** Đọc thói quen đã lưu; dữ liệu hỏng thì bắt đầu lại từ đầu. */
function loadMemory(): StyleMemory {
  const m = loadPrefs(MEMORY_KEY, EMPTY_MEMORY)
  const ok =
    m.version === 1 &&
    Array.isArray(m.rules) &&
    m.rules.every((r) => typeof r === 'string') &&
    Array.isArray(m.learned) &&
    typeof m.counts === 'object' &&
    m.counts !== null
  return ok ? m : EMPTY_MEMORY
}

/** Hội thoại đã lưu của một dự án (bỏ mục hỏng). */
function loadDirectorMessages(folder: string): DirectorMessage[] {
  const { messages } = loadPrefs(directorKey(folder), { messages: [] as unknown })
  if (!Array.isArray(messages)) return []
  return messages.filter(
    (m): m is DirectorMessage =>
      typeof m === 'object' &&
      m !== null &&
      ((m as DirectorMessage).role === 'user' || (m as DirectorMessage).role === 'ai') &&
      typeof (m as DirectorMessage).text === 'string' &&
      typeof (m as DirectorMessage).at === 'number',
  )
}

/** Thêm một lượt vào hội thoại của dự án `folder` và lưu lại (bỏ qua nếu đã sang dự án khác). */
function pushDirectorMessage(folder: string, message: DirectorMessage) {
  const s = useEditorStore.getState()
  if (s.folder !== folder) return
  const messages = [...s.directorMessages, message].slice(-DIRECTOR_HISTORY_LIMIT)
  useEditorStore.setState({ directorMessages: messages })
  savePrefs(directorKey(folder), { messages })
}

/** Câu AI nói khi đã làm xong mà không có tóm tắt. */
const doneLine = (n: number) => `Đã làm ${n} việc`

/**
 * Bản chỉnh sửa của dự án mẫu cho lệnh "làm giống dự án X": `ref` là tên thư mục, hoặc tên dự án
 * (so không phân biệt hoa thường). Không tìm thấy thì null.
 */
async function loadStyleSource(ref: string): Promise<EditState | null> {
  const wanted = ref.trim().toLowerCase()
  let folder = ref.trim()
  try {
    const projects = await lumora().listProjects()
    const match =
      projects.find((p) => p.name.toLowerCase() === wanted) ??
      projects.find((p) => p.folder.toLowerCase() === wanted) ??
      projects.find((p) => p.name.toLowerCase().includes(wanted))
    if (match) folder = match.folder
  } catch {
    // Không liệt kê được: thử thẳng như tên thư mục.
  }
  try {
    return await lumora().getEdit(folder)
  } catch {
    return null
  }
}

/** Thời lượng tiêu đề mở đầu do AI thêm (ms). */
const AUTO_TITLE_MS = 3500

/** Thêm tiêu đề mở đầu (mẫu chữ "Tiêu đề") trong vài giây đầu video. */
function addTitleOverlay(text: string) {
  const s = useEditorStore.getState()
  const style = templateStyle('title')
  s.addOverlay({ kind: 'text', text, style: 'title', color: style.color, textStyle: style })
  // addOverlay đặt tại đầu phát: dời về đầu video.
  s.change((e) => {
    const last = e.overlays[e.overlays.length - 1]
    if (!last) return e
    const total = outputDuration(e.clips)
    return {
      ...e,
      overlays: e.overlays.map((o) =>
        o === last ? { ...o, start: 0, end: Math.min(total, AUTO_TITLE_MS) } : o,
      ),
    }
  })
  s.select(null)
}

/** Số mục mà lệnh `clear` sẽ xóa (0 = không có gì để xóa). */
function clearCount(edit: EditState, target: ClearTarget): number {
  switch (target) {
    case 'zooms':
      return edit.zooms.length
    case 'effects':
      return edit.effects.length
    case 'overlays':
      return edit.overlays.length
    case 'music':
      return edit.audioClips.filter((a) => a.kind === 'music').length
    case 'sfx':
      return edit.audioClips.filter((a) => a.kind === 'sfx').length
    case 'transitions':
      return edit.transitions.length
    case 'captions':
      return edit.captions.lines.length || (edit.captions.enabled ? 1 : 0)
    case 'markers':
      return edit.markers.length
    case 'filter':
      return edit.look.filter === 'none' ? 0 : 1
    case 'adjust':
      return Object.values(edit.look.adjust).some((v) => v !== 0) ? 1 : 0
    case 'cuts':
      return 1
  }
}

/** Bản chỉnh sửa sau khi xóa sạch một loại mục. */
function clearTarget(e: EditState, target: ClearTarget, project: Project): EditState {
  switch (target) {
    case 'zooms':
      return { ...e, zooms: [] }
    case 'effects':
      return { ...e, effects: [] }
    case 'overlays':
      return { ...e, overlays: [] }
    case 'music':
    case 'sfx':
      return { ...e, audioClips: e.audioClips.filter((a) => a.kind !== target) }
    case 'transitions':
      return { ...e, transitions: [] }
    case 'captions':
      return {
        ...e,
        captions: { ...e.captions, lines: [], enabled: false, bilingual: false },
      }
    case 'markers':
      return { ...e, markers: [] }
    case 'filter':
      return { ...e, look: { ...e.look, filter: 'none', intensity: 1 } }
    case 'adjust':
      return { ...e, look: { ...e.look, adjust: { ...DEFAULT_ADJUST } } }
    case 'cuts': {
      const clips = initialClips(project)
      return { ...e, clips, transitions: pruneTransitions(clips, e.transitions) }
    }
  }
}

/** Mã lỗi ngắn từ lỗi IPC ("missing_key:elevenlabs" → "missing_key"). */
function errorCode(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  const code = /(?:Error: )?([a-z_]+(?::[a-z_]+)?)\s*$/.exec(m)?.[1] ?? m
  return code.split(':')[0] || 'error'
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
  propsTabRequest: { tab: '', n: 0 },
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
  selected: [] as SelItem[],
  clipboard: null as ClipboardData | null,
  guides: 'none' as EditorStore['guides'],
  preview: null as TryPreview | null,
  previewWindow: null as PreviewWindow | null,
  previewReturn: null as { time: number; playing: boolean } | null,
  previewZoom: 'fit' as EditorStore['previewZoom'],
  lowPreview: false,
  snapping: true,
  snapLine: null as number | null,
  past: [],
  future: [],
  loadError: null,
  directorMessages: [] as DirectorMessage[],
  directorPlan: null as DirectorPlan | null,
  directorBusy: false,
  exportRequest: 0,
  autoExport: false,
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
  useEditorStore.getState().select({ kind: 'audio', id: clip.id })
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

/**
 * Dự án vừa có thêm đoạn ở cuối (nhập video / ghép bản quay): thêm clip cho các đoạn mới,
 * tải lại sự kiện chuột (đường con trỏ), dạng sóng và dải phim.
 */
async function appendSegments(project: Project) {
  const s = useEditorStore.getState()
  const { folder, edit } = s
  if (!folder || !edit) return
  const covered = sourceDuration(s.project?.segments ?? [])
  const added = sourceSegments(project.segments)
    .filter((x) => x.duration > 0 && x.offset >= covered - 1)
    .map((x) => ({
      id: newClipId(),
      sourceStart: x.offset,
      sourceEnd: x.offset + x.duration,
      speed: 1,
    }))
  useEditorStore.setState({ project, waveform: null, filmstrip: null })
  s.change((e) => ({ ...e, clips: [...e.clips, ...added] }))
  const same = () => useEditorStore.getState().folder === folder
  const events = await lumora()
    .getEvents(folder)
    .catch(() => null)
  if (events && same()) {
    const current = useEditorStore.getState().edit
    if (current) useEditorStore.setState({ events, ...tracksFor(project, events, current) })
  }
  void lumora()
    .getWaveform(folder)
    .then((waveform) => same() && useEditorStore.setState({ waveform }))
    .catch(() => undefined)
  void lumora()
    .getFilmstrip(folder)
    .then((filmstrip) => same() && useEditorStore.setState({ filmstrip }))
    .catch(() => undefined)
  if (added[0]) useEditorStore.getState().select({ kind: 'clip', id: added[0].id })
}

/** Dán nội dung đã sao chép bắt đầu tại `at` (một bước hoàn tác), chọn các mục vừa dán. */
function pasteInto(clipboard: ClipboardData, at: number) {
  const { edit } = useEditorStore.getState()
  if (!edit) return
  const pasted = pasteClipboard(clipboard, at, outputDuration(edit.clips), (k) =>
    k === 'overlay' ? newOverlayId() : k === 'effect' ? newEffectId() : newAudioClipId(),
  )
  if (isClipboardEmpty(pasted)) return
  useEditorStore.getState().change((e) => ({
    ...e,
    overlays: [...e.overlays, ...pasted.overlays],
    effects: [...e.effects, ...pasted.effects],
    audioClips: [...e.audioClips, ...pasted.audioClips],
  }))
  useEditorStore
    .getState()
    .selectMany([
      ...pasted.overlays.map((o) => ({ kind: 'overlay' as const, id: o.id })),
      ...pasted.effects.map((x) => ({ kind: 'effect' as const, id: x.id })),
      ...pasted.audioClips.map((c) => ({ kind: 'audio' as const, id: c.id })),
    ])
}

/** Yêu cầu tạo file đảo ngược đang chạy (dùng chung khi gọi trùng). */
const revRequests = new Map<string, Promise<ReversedFiles | 'error'>>()

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...initial,
  // Thói quen và tùy chọn Đạo diễn AI dùng chung mọi dự án: không nằm trong `initial`.
  memory: loadMemory(),
  askConfirm: loadPrefs(DIRECTOR_PREFS_KEY, { askConfirm: false }).askConfirm === true,

  async load(folder) {
    set({ ...initial, folder, directorMessages: loadDirectorMessages(folder) })
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
      edit = applyProjectTemplate(
        createDefaultEdit(
          project,
          generateAutoZooms(tracks.cursor, sourceDuration(project.segments)),
        ),
        useAppStore.getState().settings?.projectTemplate ?? 'tutorial',
      )
    }
    const rect = project.source.captureRect
    // Đánh dấu đang chỉnh sửa; lần trước app tắt đột ngột thì báo đã mở lại bản tự lưu.
    void api
      .lockProject(folder)
      .then((r) => {
        if (r.recovered && get().folder === folder)
          useJobs.getState().toast({ kind: 'info', text: i18n.t('editor.recovered') }, 8000)
      })
      .catch(() => undefined)
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

  jumpHistory(index) {
    // `index`: vị trí trong dòng thời gian [...past, edit, ...future] muốn quay về.
    const { past, edit, future, project, events } = get()
    if (!edit || !project) return
    const all = [...past, edit, ...future]
    const target = all[index]
    if (!target || index === past.length) return
    lastCoalesce = null
    set({
      edit: target,
      past: all.slice(0, index),
      future: all.slice(index + 1),
      ...tracksFor(project, events, target),
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

  tryPreview(preview) {
    const { edit } = get()
    if (!edit || samePreview(get().preview, preview)) return
    // Lần xem thử đầu tiên ghi lại chỗ đang đứng; đổi mục khác vẫn trả về chỗ đó.
    const back = get().previewReturn ?? { time: get().time, playing: get().playing }
    const window = previewWindow(edit, preview, back.time)
    set({ preview, previewWindow: window, previewReturn: back })
    if (window) {
      get().setTime(window.start)
      set({ playing: true })
    } else set({ playing: false })
  },

  endPreview() {
    const back = get().previewReturn
    if (!get().preview && !back) return
    set({ preview: null, previewWindow: null, previewReturn: null })
    if (back) {
      get().setTime(back.time)
      set({ playing: back.playing })
    }
  },

  select(selection) {
    set({
      selection,
      selected:
        selection && isMulti(selection.kind) ? [{ kind: selection.kind, id: selection.id }] : [],
    })
  },

  toggleSelect(item) {
    const { selected } = get()
    const has = selected.some((x) => x.kind === item.kind && x.id === item.id)
    const next = has
      ? selected.filter((x) => !(x.kind === item.kind && x.id === item.id))
      : [...selected, item]
    const last = next[next.length - 1]
    set({ selected: next, selection: last ? { ...last } : null })
  },

  selectMany(items) {
    const last = items[items.length - 1]
    set({ selected: items, selection: last ? { ...last } : null })
  },

  selectAll() {
    const { edit } = get()
    if (!edit) return
    const t = edit.tracks
    const items: SelItem[] = [
      ...(t.overlays.locked
        ? []
        : edit.overlays.map((o) => ({ kind: 'overlay' as const, id: o.id }))),
      ...(t.effects.locked ? [] : edit.effects.map((x) => ({ kind: 'effect' as const, id: x.id }))),
      ...(t.audio.locked ? [] : edit.audioClips.map((c) => ({ kind: 'audio' as const, id: c.id }))),
    ]
    get().selectMany(items)
  },

  isSelected(kind, id) {
    return get().selected.some((x) => x.kind === kind && x.id === id)
  },

  copySelection() {
    const { edit, selected } = get()
    if (!edit || selected.length === 0) return false
    const ids = (k: MultiKind) => new Set(selected.filter((x) => x.kind === k).map((x) => x.id))
    const data: ClipboardData = {
      overlays: edit.overlays.filter((o) => ids('overlay').has(o.id)),
      effects: edit.effects.filter((x) => ids('effect').has(x.id)),
      audioClips: edit.audioClips.filter((c) => ids('audio').has(c.id)),
    }
    if (isClipboardEmpty(data)) return false
    set({ clipboard: structuredClone(data) })
    return true
  },

  cutSelection() {
    if (get().copySelection()) get().deleteSelection()
  },

  paste() {
    const { clipboard, edit, time } = get()
    if (!edit || !clipboard || isClipboardEmpty(clipboard)) return
    pasteInto(clipboard, time)
  },

  duplicateSelection() {
    const { edit, selected } = get()
    if (!edit || selected.length === 0 || !get().copySelection()) return
    const c = get().clipboard!
    const end = Math.max(
      ...c.overlays.map((o) => o.end),
      ...c.effects.map((x) => x.end),
      ...c.audioClips.map((a) => a.start + a.duration),
    )
    pasteInto(c, end)
  },

  rippleDeleteSelection() {
    const { edit, selected } = get()
    if (!edit || selected.length === 0) {
      get().deleteSelection()
      return
    }
    const ids = (k: MultiKind) => new Set(selected.filter((x) => x.kind === k).map((x) => x.id))
    get().change((e) => ({
      ...e,
      overlays: rippleDelete(e.overlays, ids('overlay')),
      effects: rippleDelete(e.effects, ids('effect')),
      audioClips: rippleDeleteAudio(e.audioClips, ids('audio')),
    }))
    set({ selection: null, selected: [] })
  },

  setPreviewZoom(zoom) {
    set({ previewZoom: zoom })
  },

  setGuides(mode) {
    set({ guides: mode })
  },

  setSnapping(on) {
    set({ snapping: on })
  },

  setSnapLine(t) {
    if (get().snapLine !== t) set({ snapLine: t })
  },

  reorderOverlay(id, to) {
    get().change((e) => {
      const i = e.overlays.findIndex((o) => o.id === id)
      if (i < 0) return e
      const list = [...e.overlays]
      const [item] = list.splice(i, 1)
      const j =
        to === 'top'
          ? list.length
          : to === 'bottom'
            ? 0
            : to === 'up'
              ? Math.min(list.length, i + 1)
              : Math.max(0, i - 1)
      list.splice(j, 0, item!)
      return { ...e, overlays: list }
    })
  },

  addMarkerAtPlayhead(label = '') {
    const { time } = get()
    get().change((e) => ({ ...e, markers: addMarker(e.markers, time, label) }))
  },

  updateMarker(id, patch, coalesce) {
    get().change(
      (e) => ({
        ...e,
        markers: e.markers
          .map((m) => (m.id === id ? { ...m, ...patch } : m))
          .sort((a, b) => a.t - b.t),
      }),
      coalesce,
    )
  },

  removeMarker(id) {
    get().change((e) => ({ ...e, markers: e.markers.filter((m) => m.id !== id) }))
  },

  jumpMarker(dir) {
    const { edit, time } = get()
    const m = edit && markerNear(edit.markers, time, dir)
    if (m) get().setTime(m.t)
  },

  async importVideo(file) {
    const { folder, edit } = get()
    if (!folder || !edit) return false
    const project = await lumora().importVideo(folder, file)
    if (!project || get().folder !== folder) return false
    await appendSegments(project)
    return true
  },

  async mergeProject(other) {
    const { folder, edit } = get()
    if (!folder || !edit) return
    const project = await lumora().mergeProject(folder, other)
    if (get().folder !== folder) return
    await appendSegments(project)
  },

  detachClipAudio(id, names) {
    const { edit, project } = get()
    if (!edit || !project) return false
    const pieces = detachClipAudio(project.segments, edit.clips, id, edit.audio, names)
    if (!pieces) return false
    get().change((e) => ({
      ...e,
      audioClips: [...e.audioClips, ...pieces],
      clips: e.clips.map((c) =>
        c.id === id ? { ...c, audio: { ...(c.audio ?? DEFAULT_CLIP_AUDIO), muted: true } } : c,
      ),
    }))
    get().select({ kind: 'audio', id: pieces[0]!.id })
    return true
  },

  setTrack(row, patch) {
    get().change((e) => ({ ...e, tracks: { ...e.tracks, [row]: { ...e.tracks[row], ...patch } } }))
    // Hàng vừa khóa: bỏ chọn các mục trên hàng đó.
    if (patch.locked) {
      const kind =
        row === 'overlays'
          ? 'overlay'
          : row === 'effects'
            ? 'effect'
            : row === 'audio'
              ? 'audio'
              : null
      if (kind) {
        const selected = get().selected.filter((x) => x.kind !== kind)
        const selection = get().selection?.kind === kind ? null : get().selection
        set({ selected, selection })
      }
    }
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

  async addMusicFromLibrary(file) {
    const { folder } = get()
    if (!folder) return
    const asset = await lumora().useMusic(folder, file)
    if (get().folder !== folder) return
    insertAudio(asset, 'music')
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
    get().select({ kind: 'audio', id: audio.id })
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
    get().select({ kind: 'audio', id: audio[0]!.id })
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
    get().select({ kind: 'effect', id: effect.id })
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
    const overlay = buildOverlay(init, time, outputDuration(edit.clips))
    get().change((e) => ({ ...e, overlays: [...e.overlays, overlay] }))
    get().select({ kind: 'overlay', id: overlay.id })
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

  requestTab(tab, section) {
    set({ tabRequest: { tab, section, n: get().tabRequest.n + 1 } })
  },

  requestPropsTab(tab) {
    set({ propsTabRequest: { tab, n: get().propsTabRequest.n + 1 } })
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
    const { selection, selected } = get()
    if (selected.length > 1) {
      const ids = (k: MultiKind) => new Set(selected.filter((x) => x.kind === k).map((x) => x.id))
      get().change((e) => ({
        ...e,
        overlays: e.overlays.filter((o) => !ids('overlay').has(o.id)),
        effects: e.effects.filter((x) => !ids('effect').has(x.id)),
        audioClips: e.audioClips.filter((c) => !ids('audio').has(c.id)),
      }))
      set({ selection: null, selected: [] })
      return
    }
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
    set({ selection: null, selected: [] })
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
    get().select({ kind: 'clip', id: result.id })
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
    get().select({ kind: 'zoom', id })
  },

  regenerateZooms() {
    const { cursor, project } = get()
    if (!cursor || !project) return
    get().change((e) => ({
      ...e,
      zooms: generateAutoZooms(cursor, sourceDuration(project.segments)),
    }))
  },

  async runAssistant(instruction, onProgress) {
    const { folder, edit: before, project, transcript } = get()
    if (!folder || !before || !project) return { commands: [], report: [] }
    const text = instruction.trim()
    if (!text) return { commands: [], report: [] }
    let commands: AssistantCommand[] = []
    try {
      commands = await lumora().planEdits(text, {
        language: before.captions.language || transcript?.language || '',
        durationMs: outputDuration(before.clips),
        hasTranscript: transcript !== null,
      })
    } catch {
      // Không có key Claude / mất mạng: hiểu theo từ khóa.
    }
    // Gộp với bộ hiểu từ khóa: model (nhất là model cục bộ nhỏ) hay bỏ sót lệnh rõ ràng.
    commands = normalizeAssistantCommands([...commands, ...parseAssistantRequest(text)])
    if (commands.length === 0 || get().folder !== folder) return { commands, report: [] }
    const report = await get().applyAssistantCommands(commands, onProgress)
    return { commands, report }
  },

  async applyAssistantCommands(input, onProgress) {
    const { folder, edit: before, project, cursor, events } = get()
    if (!folder || !before || !project || input.length === 0) return []
    // Công thức dựng (recipe) mở rộng thành lệnh cụ thể trước khi chạy.
    const commands = expandRecipes(input, {
      hasCursor: cursor !== null && events.length > 0,
      hasMusic: true,
      durationMs: outputDuration(before.clips),
    })
    const pastBefore = get().past
    const has = (kind: AssistantCommand['kind']) => commands.some((c) => c.kind === kind)
    // Các bước AI (cắt, zoom, phụ đề, âm thanh) làm trước: lệnh sau tính theo clip đã cắt.
    // Báo cáo: các bước AI theo tên bước tự biên tập, lệnh còn lại theo loại lệnh, đúng thứ tự.
    const report: AutoEditReport[] = await get().autoEdit(
      {
        silences: has('cutSilences'),
        fillers: has('removeFillers'),
        zooms: has('autoZoom'),
        captions: has('captions'),
        audio: has('cleanAudio'),
        title: false,
      },
      onProgress,
    )
    if (get().folder !== folder) return report
    const done = (step: AutoEditReport['step'], detail = 1) =>
      report.push({ step, status: 'done', detail })
    const skipped = (step: AutoEditReport['step'], detail: string) =>
      report.push({ step, status: 'skipped', detail })
    // Xuất làm sau cùng (sau khi gộp bước hoàn tác) để bản xuất có đủ mọi thay đổi.
    let exportAfter = false
    for (const c of commands) {
      if (get().folder !== folder) return report
      switch (c.kind) {
        case 'cutSilences':
        case 'removeFillers':
        case 'autoZoom':
        case 'captions':
        case 'cleanAudio':
          // Đã làm trong autoEdit (có dòng báo cáo riêng).
          break
        case 'title':
          addTitleOverlay(c.text)
          done('title')
          break
        case 'filter':
          get().change((e) => ({
            ...e,
            look: { ...e.look, filter: c.preset, intensity: c.intensity },
          }))
          done('filter')
          break
        case 'speed':
          get().change((e) => ({
            ...e,
            clips: e.clips.reduce<Clip[]>(
              (acc, clip) => setClipSpeed(acc, clip.id, c.factor),
              e.clips,
            ),
          }))
          done('speed')
          break
        case 'aspect':
          get().change((e) => ({
            ...e,
            frame: { ...e.frame, aspect: c.aspect, fill: c.aspect === '9:16' },
          }))
          done('aspect')
          break
        case 'trimStart':
        case 'trimEnd': {
          const total = sourceDuration(project.segments)
          const range =
            c.kind === 'trimStart'
              ? { start: 0, end: Math.min(c.ms, total - 1000) }
              : { start: Math.max(1000, total - c.ms), end: total }
          if (range.end > range.start) {
            get().change((e) => ({ ...e, clips: removeSourceRanges(e.clips, [range]) }))
            done(c.kind)
          } else skipped(c.kind, 'too_short')
          break
        }
        case 'effect': {
          // Hiệu ứng ở đầu video và mỗi chỗ nối clip; chỗ đã có hiệu ứng cùng loại thì bỏ qua.
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const taken = new Set(
            cur.effects.filter((x) => x.kind === c.effect).map((x) => Math.round(x.start)),
          )
          const added: EffectRegion[] = []
          for (const at of [0, ...cutPoints(cur.clips).map((p) => p.at)]) {
            const start = Math.min(at, Math.max(0, total - MIN_REGION_MS))
            if (taken.has(Math.round(start))) continue
            taken.add(Math.round(start))
            added.push({
              id: newEffectId(),
              kind: c.effect,
              start,
              end: Math.min(total, start + DEFAULT_EFFECT_MS),
              intensity: 0.7,
            })
          }
          if (added.length > 0) {
            get().change((e) => ({ ...e, effects: [...e.effects, ...added] }))
            done('effect', added.length)
          } else skipped('effect', 'duplicate')
          break
        }
        case 'transitions': {
          const cuts = cutPoints(get().edit!.clips).length
          if (cuts === 0) skipped('transitions', 'no_cuts')
          else {
            get().applyTransitionToAll(c.transition, c.ms ?? DEFAULT_TRANSITION_MS)
            done('transitions', cuts)
          }
          break
        }
        case 'music': {
          let tracks: MusicTrack[] = []
          try {
            tracks = await lumora().listMusic()
          } catch {
            tracks = []
          }
          if (get().folder !== folder) return report
          const q = c.query.toLowerCase()
          const track = tracks.find((t) => t.name.toLowerCase().includes(q)) ?? tracks[0]
          if (!track) {
            skipped('music', 'no_music')
            break
          }
          try {
            const count = get().edit!.audioClips.length
            await get().addMusicFromLibrary(track.file)
            if (get().folder !== folder) return report
            const clips = get().edit!.audioClips
            const clip = clips.length > count ? clips[clips.length - 1] : undefined
            if (clip) get().updateAudioClip(clip.id, { volume: c.volume })
            done('music')
          } catch (e) {
            report.push({ step: 'music', status: 'error', detail: errorCode(e) })
          }
          break
        }
        case 'captionsStyle':
          get().change((e) => ({
            ...e,
            captions: { ...e.captions, look: withCaptionTemplate(e.captions.look, c.template) },
          }))
          done('captionsStyle')
          break
        case 'export':
          get().change((e) => ({
            ...e,
            export: {
              ...e.export,
              resolution: c.resolution,
              format: c.format,
              fps: c.fps ?? e.export.fps,
              enhance: c.enhance ?? e.export.enhance,
            },
          }))
          exportAfter = true
          done('export')
          break
        case 'styleFrom': {
          const other = await loadStyleSource(c.project)
          if (get().folder !== folder) return report
          if (!other) {
            skipped('styleFrom', 'no_project')
            break
          }
          const transition = other.transitions?.[0]
          get().change((e) => ({
            ...e,
            frame: { ...(other.frame ?? e.frame) },
            look: { ...(other.look ?? e.look) },
            captions: { ...e.captions, look: { ...(other.captions?.look ?? e.captions.look) } },
            cursor: { ...(other.cursor ?? e.cursor) },
            camera: { ...(other.camera ?? e.camera) },
            motion: { ...(other.motion ?? e.motion) },
            audio: {
              ...e.audio,
              micFx: { ...(other.audio?.micFx ?? e.audio.micFx) },
              systemFx: { ...(other.audio?.systemFx ?? e.audio.systemFx) },
            },
            transitions: transition
              ? cutPoints(e.clips).map((p) => ({
                  afterClip: p.afterClip,
                  kind: transition.kind,
                  durationMs: transition.durationMs,
                }))
              : e.transitions,
          }))
          done('styleFrom')
          break
        }
        case 'cutRange': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const from = Math.min(c.fromMs, total)
          const to = Math.min(c.toMs, total)
          if (to - from < MIN_REGION_MS || total - (to - from) < 1000) {
            skipped('cutRange', 'too_short')
            break
          }
          get().change((e) => {
            const split = splitAt(splitAt(e.clips, from), to)
            const keep = clipPositions(split)
              .filter((p) => {
                const end = p.outputStart + clipDuration(p.clip)
                return !(p.outputStart >= from - 1 && end <= to + 1)
              })
              .map((p) => p.clip)
            if (keep.length === 0) return e
            return { ...e, clips: keep, transitions: pruneTransitions(keep, e.transitions) }
          })
          get().select(null)
          done('cutRange')
          break
        }
        case 'freeze': {
          const cur = get().edit!
          const result = insertFreeze(cur.clips, Math.min(c.atMs, outputDuration(cur.clips)), c.ms)
          if (!result) {
            skipped('freeze', 'too_short')
            break
          }
          get().change((e) => ({ ...e, clips: result.clips }))
          done('freeze')
          break
        }
        case 'flip':
        case 'rotate': {
          const patch: Partial<ClipTransform> =
            c.kind === 'rotate'
              ? { rotate: c.degrees }
              : c.axis === 'horizontal'
                ? { flipH: true }
                : { flipV: true }
          get().change((e) => ({
            ...e,
            clips: e.clips.map((clip) => {
              const transform = { ...(clip.transform ?? DEFAULT_TRANSFORM), ...patch }
              const { transform: _old, ...rest } = clip
              void _old
              return isDefaultTransform(transform) ? rest : { ...rest, transform }
            }),
          }))
          done(c.kind)
          break
        }
        case 'volume': {
          if (c.target === 'mic' || c.target === 'system') {
            get().change((e) => ({ ...e, audio: { ...e.audio, [c.target]: c.level } }))
            done('volume')
            break
          }
          const count = get().edit!.audioClips.filter((a) => a.kind === c.target).length
          if (count === 0) {
            skipped('volume', c.target === 'music' ? 'no_music' : 'nothing')
            break
          }
          get().change((e) => ({
            ...e,
            audioClips: e.audioClips.map((a) =>
              a.kind === c.target ? { ...a, volume: c.level } : a,
            ),
          }))
          done('volume', count)
          break
        }
        case 'voiceFx':
          get().change((e) => ({
            ...e,
            audio: { ...e.audio, micFx: { ...e.audio.micFx, voice: c.voice } },
          }))
          done('voiceFx')
          break
        case 'fade': {
          const count = get().edit!.audioClips.filter((a) => a.kind === 'music').length
          if (count === 0) {
            skipped('fade', 'no_music')
            break
          }
          get().change((e) => ({
            ...e,
            audioClips: e.audioClips.map((a) =>
              a.kind === 'music' ? { ...a, fadeIn: c.ms, fadeOut: c.ms } : a,
            ),
          }))
          done('fade', count)
          break
        }
        case 'sound': {
          try {
            const asset = await lumora().addSoundEffect(folder, c.sound)
            if (get().folder !== folder) return report
            insertAudio(asset, 'sfx', Math.min(c.atMs, outputDuration(get().edit!.clips)))
            get().select(null)
            done('sound')
          } catch (e) {
            report.push({ step: 'sound', status: 'error', detail: errorCode(e) })
          }
          break
        }
        case 'zoomLevel': {
          if (get().edit!.zooms.length === 0) {
            skipped('zoomLevel', 'no_zooms')
            break
          }
          get().updateAllZooms({ scale: c.scale })
          done('zoomLevel', get().edit!.zooms.length)
          break
        }
        case 'zoomAt': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const a = outputToSource(cur.clips, Math.min(c.atMs, Math.max(0, total - 1)))
          const b = outputToSource(cur.clips, Math.min(c.atMs + c.ms, total))
          if (!a || !b || b.source - a.source < MIN_REGION_MS) {
            skipped('zoomAt', 'too_short')
            break
          }
          const region: ZoomRegion = {
            id: newZoomId(),
            start: Math.round(a.source),
            end: Math.round(b.source),
            scale: c.scale,
            mode: 'follow',
            x: 0.5,
            y: 0.5,
          }
          get().setZooms([...cur.zooms, region])
          done('zoomAt')
          break
        }
        case 'motion':
          get().change((e) => ({
            ...e,
            motion: {
              cameraSpeed: c.cameraSpeed ?? e.motion.cameraSpeed,
              zoomTransitionMs: c.zoomMs ?? e.motion.zoomTransitionMs,
            },
          }))
          done('motion')
          break
        case 'frame':
          get().change((e) => ({
            ...e,
            frame: {
              ...e.frame,
              padding: c.padding ?? e.frame.padding,
              radius: c.radius ?? e.frame.radius,
              shadow: c.shadow ?? e.frame.shadow,
              fill: c.fill ?? e.frame.fill,
            },
          }))
          done('frame')
          break
        case 'background':
          get().change((e) => ({
            ...e,
            frame: {
              ...e.frame,
              fill: false,
              background: c.color2
                ? { kind: 'gradient', color: c.color, color2: c.color2, angle: 135 }
                : { kind: 'solid', color: c.color, color2: c.color, angle: 0 },
            },
          }))
          done('background')
          break
        case 'cursor':
          get().change((e) => ({
            ...e,
            cursor: {
              ...e.cursor,
              visible: c.visible ?? e.cursor.visible,
              size: c.size ?? e.cursor.size,
              clickEffect: c.clickEffect ?? e.cursor.clickEffect,
              hideIdle: c.hideIdle ?? e.cursor.hideIdle,
              showKeys: c.showKeys ?? e.cursor.showKeys,
            },
          }))
          done('cursor')
          break
        case 'duck':
          get().change((e) => ({
            ...e,
            audio: {
              ...e.audio,
              duck: { enabled: c.enabled, level: c.level ?? e.audio.duck.level },
            },
          }))
          done('duck')
          break
        case 'blur': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const start = Math.min(c.atMs, Math.max(0, total - MIN_REGION_MS))
          const end = Math.min(total, start + c.ms)
          if (end - start < MIN_REGION_MS) {
            skipped('blur', 'too_short')
            break
          }
          const overlay = buildOverlay({ kind: 'blur', blurMode: c.mode }, start, total)
          const placed: Overlay = { ...overlay, start, end, x: c.x, y: c.y, size: c.size }
          get().change((e) => ({ ...e, overlays: [...e.overlays, placed] }))
          done('blur')
          break
        }
        case 'camera':
          get().change((e) => {
            const place = c.position ? cornerPlacement(c.position) : null
            return {
              ...e,
              camera: {
                ...e.camera,
                visible: c.visible ?? e.camera.visible,
                shape: c.shape ?? e.camera.shape,
                size: c.size ?? e.camera.size,
                position: c.position ?? e.camera.position,
                x: place ? place.x : e.camera.x,
                y: place ? place.y : e.camera.y,
                layout: c.layout ?? e.camera.layout,
                beauty:
                  c.beauty === undefined
                    ? e.camera.beauty
                    : c.beauty
                      ? { ...BEAUTY_PRESET }
                      : { ...NO_BEAUTY },
                background:
                  c.background === undefined
                    ? e.camera.background
                    : { ...e.camera.background, mode: c.background },
              },
            }
          })
          done('camera')
          break
        case 'text':
        case 'sticker':
        case 'shape': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const start = Math.min(c.atMs, Math.max(0, total - MIN_REGION_MS))
          const end = Math.min(total, start + c.ms)
          if (end - start < MIN_REGION_MS) {
            skipped(c.kind, 'too_short')
            break
          }
          const init: Partial<Overlay> & Pick<Overlay, 'kind'> =
            c.kind === 'text'
              ? (() => {
                  const style = templateStyle(c.template)
                  return {
                    kind: 'text',
                    text: c.text,
                    style: 'title',
                    color: style.color,
                    textStyle: style,
                  }
                })()
              : c.kind === 'sticker'
                ? { kind: 'emoji', text: c.emoji }
                : { kind: 'shape', shape: c.shape, color: c.color }
          const overlay = buildOverlay(init, start, total)
          const pos: Record<OverlayPosition, number> = { top: 0.15, center: 0.5, bottom: 0.85 }
          const placed: Overlay = {
            ...overlay,
            start,
            end,
            x: c.kind === 'shape' ? c.x : 0.5,
            y: c.kind === 'shape' ? c.y : pos[c.position],
          }
          get().change((e) => ({ ...e, overlays: [...e.overlays, placed] }))
          done(c.kind)
          break
        }
        case 'adjust':
          get().change((e) => ({
            ...e,
            look: { ...e.look, adjust: { ...e.look.adjust, [c.setting]: c.value } },
          }))
          done('adjust')
          break
        case 'captionsLayout':
          get().change((e) => ({
            ...e,
            captions: {
              ...e.captions,
              position: c.position ?? e.captions.position,
              size: c.size ?? e.captions.size,
              look: c.position
                ? { ...e.captions.look, y: captionYOf(c.position) }
                : e.captions.look,
            },
          }))
          done('captionsLayout')
          break
        case 'translate': {
          const lines = get().edit!.captions.lines
          if (lines.length === 0) {
            skipped('translate', 'no_captions')
            break
          }
          try {
            const translated = await lumora().translateLines(
              lines.map((l) => ({ id: l.id, text: l.text })),
              c.language,
            )
            if (get().folder !== folder) return report
            const byId = new Map(translated.map((l) => [l.id, l.text]))
            get().change((e) => ({
              ...e,
              captions: c.bilingual
                ? {
                    ...e.captions,
                    bilingual: true,
                    translationLanguage: c.language,
                    lines: e.captions.lines.map((l) => ({
                      ...l,
                      translation: byId.get(l.id) ?? l.text,
                    })),
                  }
                : {
                    ...e.captions,
                    language: c.language,
                    bilingual: false,
                    lines: e.captions.lines.map((l) => {
                      const next = { ...l, text: byId.get(l.id) ?? l.text, edited: true }
                      delete next.translation
                      return next
                    }),
                  },
            }))
            done('translate', lines.length)
          } catch (e) {
            report.push({ step: 'translate', status: 'error', detail: errorCode(e) })
          }
          break
        }
        case 'marker': {
          const total = outputDuration(get().edit!.clips)
          get().change((e) => ({
            ...e,
            markers: addMarker(e.markers, Math.min(c.atMs, total), c.label),
          }))
          done('marker')
          break
        }
        case 'chapters': {
          try {
            const summary = await lumora().summarize(folder)
            if (get().folder !== folder) return report
            const cur = get().edit!
            const marks = summary.chapters.flatMap((ch) => {
              const t = sourceToOutput(cur.clips, ch.start)
              return t === null ? [] : [{ t, label: ch.title }]
            })
            if (marks.length === 0) {
              skipped('chapters', 'no_chapters')
              break
            }
            get().change((e) => ({
              ...e,
              markers: marks.reduce((all, m) => addMarker(all, m.t, m.label), e.markers),
            }))
            done('chapters', marks.length)
          } catch (e) {
            report.push({ step: 'chapters', status: 'error', detail: errorCode(e) })
          }
          break
        }
        case 'track': {
          const { row, ...patch } = c
          const state: Partial<TrackState> = {}
          if (patch.hidden !== undefined) state.hidden = patch.hidden
          if (patch.muted !== undefined) state.muted = patch.muted
          if (patch.locked !== undefined) state.locked = patch.locked
          get().setTrack(row, state)
          done('track')
          break
        }
        case 'clear': {
          const cur = get().edit!
          const count = clearCount(cur, c.target)
          if (count === 0) {
            skipped('clear', 'nothing')
            break
          }
          get().change((e) => clearTarget(e, c.target, project))
          get().select(null)
          done('clear', count)
          break
        }
        case 'recipe':
          // Đã mở rộng thành lệnh cụ thể ở đầu hàm.
          break
        case 'effectAt': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const start = Math.min(c.atMs, Math.max(0, total - MIN_REGION_MS))
          const end = Math.min(total, start + c.ms)
          if (end - start < MIN_REGION_MS) {
            skipped('effectAt', 'too_short')
            break
          }
          const region: EffectRegion = {
            id: newEffectId(),
            kind: c.effect,
            start,
            end,
            intensity: c.intensity,
          }
          get().change((e) => ({ ...e, effects: [...e.effects, region] }))
          done('effectAt')
          break
        }
        case 'speedRange': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const from = Math.min(c.fromMs, total)
          const to = Math.min(c.toMs, total)
          if (to - from < MIN_REGION_MS) {
            skipped('speedRange', 'too_short')
            break
          }
          // Tách ở hai đầu rồi đổi tốc độ các clip nằm trọn trong khoảng (clip đứng yên giữ nguyên).
          const split = splitAt(splitAt(cur.clips, from), to)
          const ids = clipPositions(split)
            .filter(
              (p) =>
                !p.clip.freeze &&
                p.outputStart >= from - 1 &&
                p.outputStart + clipDuration(p.clip) <= to + 1,
            )
            .map((p) => p.clip.id)
          if (ids.length === 0) {
            skipped('speedRange', 'too_short')
            break
          }
          get().change((e) => ({
            ...e,
            clips: ids.reduce<Clip[]>((acc, id) => setClipSpeed(acc, id, c.factor), split),
          }))
          done('speedRange', ids.length)
          break
        }
        case 'speedCurve': {
          const hit = outputToSource(get().edit!.clips, c.atMs)
          if (!hit || hit.position.clip.freeze) {
            skipped('speedCurve', 'too_short')
            break
          }
          get().setSpeedCurve(hit.position.clip.id, presetCurve(c.preset))
          done('speedCurve')
          break
        }
        case 'transitionAt': {
          const cuts = cutPoints(get().edit!.clips)
          const nearest = cuts
            .map((p) => ({ ...p, dist: Math.abs(p.at - c.atMs) }))
            .sort((a, b) => a.dist - b.dist)[0]
          if (!nearest || nearest.dist > 1500) {
            skipped('transitionAt', 'no_cuts')
            break
          }
          get().setTransition(nearest.afterClip, c.transition, c.ms)
          done('transitionAt')
          break
        }
        case 'captionsLook':
          get().change((e) => ({
            ...e,
            captions: {
              ...e.captions,
              style: c.style ?? e.captions.style,
              look: {
                ...e.captions.look,
                font: c.font ?? e.captions.look.font,
                color: c.color ?? e.captions.look.color,
                highlightColor: c.highlightColor ?? e.captions.look.highlightColor,
                uppercase: c.uppercase ?? e.captions.look.uppercase,
                maxWords: c.maxWords ?? e.captions.look.maxWords,
              },
            },
          }))
          done('captionsLook')
          break
        case 'outro': {
          const cur = get().edit!
          const total = outputDuration(cur.clips)
          const ms = Math.min(c.ms, total)
          if (ms < MIN_REGION_MS) {
            skipped('outro', 'too_short')
            break
          }
          const start = total - ms
          const style = templateStyle(c.template)
          const overlay = buildOverlay(
            { kind: 'text', text: c.text, style: 'title', color: style.color, textStyle: style },
            start,
            total,
          )
          get().change((e) => ({
            ...e,
            overlays: [...e.overlays, { ...overlay, start, end: total, x: 0.5, y: 0.5 }],
          }))
          done('outro')
          break
        }
        case 'findMusic': {
          // AI tự tìm nhạc nền miễn phí bản quyền (Jamendo); không có key thì dùng kho nhạc.
          let track: MusicTrack | null = null
          let reason = ''
          try {
            track = await lumora().findMusic({
              mood: c.mood,
              tempo: c.tempo,
              durationMs: outputDuration(get().edit!.clips),
            })
          } catch (e) {
            reason = errorCode(e)
            const tracks = await lumora()
              .listMusic()
              .catch(() => [] as MusicTrack[])
            track = tracks[0] ?? null
          }
          if (get().folder !== folder) return report
          if (!track) {
            skipped('findMusic', reason === 'key_missing' ? 'no_music_key' : reason || 'no_music')
            break
          }
          try {
            const count = get().edit!.audioClips.length
            await get().addMusicFromLibrary(track.file)
            if (get().folder !== folder) return report
            const clips = get().edit!.audioClips
            const clip = clips.length > count ? clips[clips.length - 1] : undefined
            if (clip) get().updateAudioClip(clip.id, { volume: c.volume })
            // Nhạc nền dưới giọng nói: tự giảm khi nói (trừ khi kế hoạch đã nêu rõ).
            if (!has('duck'))
              get().change((e) => ({
                ...e,
                audio: { ...e.audio, duck: { ...e.audio.duck, enabled: true } },
              }))
            done('findMusic')
          } catch (e) {
            report.push({ step: 'findMusic', status: 'error', detail: errorCode(e) })
          }
          break
        }
        case 'broll': {
          // Tư liệu (stock video Pixabay) phủ kín khung tại một thời điểm, không tiếng.
          try {
            const total = outputDuration(get().edit!.clips)
            if (c.atMs >= total) {
              skipped('broll', 'too_short')
              break
            }
            const found = await lumora().onlineSearch('pixabayVideo', c.query, null)
            if (get().folder !== folder) return report
            const item = found.items.find((i) => i.durationMs >= c.ms) ?? found.items[0] ?? null
            if (!item) {
              skipped('broll', 'no_results')
              break
            }
            const meme = await lumora().onlineDownload('pixabay', item.id)
            const asset = await lumora().useMeme(folder, meme.file)
            if (get().folder !== folder) return report
            const cur = get().edit!
            const start = c.atMs
            const end = Math.min(total, start + Math.min(c.ms, asset.durationMs || c.ms))
            const frame = aspectRatio(cur.frame.aspect, { width: 16, height: 9 })
            const aspect = asset.width / Math.max(1, asset.height)
            const overlay = buildOverlay(
              {
                kind: 'video',
                file: asset.file,
                text: asset.name,
                aspect,
                sourceDuration: asset.durationMs,
                hasAudio: asset.hasAudio,
                volume: 0,
              },
              start,
              total,
            )
            get().change((e) => ({
              ...e,
              overlays: [
                ...e.overlays,
                // Cỡ = chiều cao khung; khung rộng hơn tư liệu thì phóng theo chiều rộng để phủ kín.
                {
                  ...overlay,
                  start,
                  end,
                  x: 0.5,
                  y: 0.5,
                  size: Math.max(1, frame / aspect) * 1.02,
                },
              ],
            }))
            done('broll')
          } catch (e) {
            const code = errorCode(e)
            if (code === 'key_missing') skipped('broll', 'no_pixabay_key')
            else report.push({ step: 'broll', status: 'error', detail: code })
          }
          break
        }
        case 'shorts': {
          try {
            const made = await get().splitIntoShorts({
              mode: c.mode,
              seconds: c.seconds,
              vertical: c.vertical,
              count: c.count,
            })
            if (get().folder !== folder) return report
            if (made === 0) skipped('shorts', 'too_short')
            else done('shorts', made)
          } catch (e) {
            report.push({ step: 'shorts', status: 'error', detail: errorCode(e) })
          }
          break
        }
        case 'captionsEmoji': {
          if (get().edit!.captions.lines.length === 0) {
            skipped('captionsEmoji', 'no_captions')
            break
          }
          const n = await get().addCaptionEmojis()
          if (get().folder !== folder) return report
          if (n === 0) skipped('captionsEmoji', 'no_emoji')
          else done('captionsEmoji', n)
          break
        }
        case 'captionsKeywords': {
          if (get().edit!.captions.lines.length === 0) {
            skipped('captionsKeywords', 'no_captions')
            break
          }
          const n = await get().addCaptionKeywords()
          if (get().folder !== folder) return report
          if (n === 0) skipped('captionsKeywords', 'no_keywords')
          else done('captionsKeywords', n)
          break
        }
        case 'dub': {
          if (get().edit!.captions.lines.length === 0) {
            skipped('dub', 'no_captions')
            break
          }
          try {
            const n = await get().dubCaptions({
              language: c.language,
              keepOriginal: c.keepOriginal,
              voiceName: c.voiceName,
            })
            if (get().folder !== folder) return report
            if (n === 0) skipped('dub', 'too_short')
            else done('dub', n)
          } catch (e) {
            report.push({ step: 'dub', status: 'error', detail: errorCode(e) })
          }
          break
        }
        default:
          break
      }
    }
    // Gộp thành một bước hoàn tác.
    const after = get().edit
    if (after && after !== before)
      set({ past: [...pastBefore, before].slice(-HISTORY_LIMIT), future: [] })
    if (exportAfter) get().requestExport(true)
    return report
  },

  async askDirector(input, onProgress) {
    const { folder, edit, project, transcript, cursor, events } = get()
    const text = input.trim()
    if (!folder || !edit || !project || !text)
      return { plan: EMPTY_PLAN, applied: false, report: [] }
    pushDirectorMessage(folder, { role: 'user', text, at: Date.now() })
    if (isStandingRule(text)) get().rememberDirectorRule(text)
    set({ directorBusy: true })
    try {
      const language = edit.captions.language || transcript?.language || ''
      const [tracks, projects] = await Promise.all([
        lumora()
          .listMusic()
          .catch(() => []),
        lumora()
          .listProjects()
          .catch(() => []),
      ])
      if (get().folder !== folder) return { plan: EMPTY_PLAN, applied: false, report: [] }
      const musicTracks = tracks.map((t) => t.name)
      const hasCursor = cursor !== null && events.length > 0
      const context: DirectorContext = {
        language,
        durationMs: outputDuration(edit.clips),
        hasTranscript: transcript !== null,
        hasCursor,
        musicTracks,
        projects: projects.filter((p) => p.folder !== folder).map((p) => p.name),
        memory: memorySummary(get().memory, language || 'vi'),
        // Các lượt trước câu vừa gửi.
        history: get().directorMessages.slice(0, -1).slice(-DIRECTOR_CONTEXT_TURNS),
        // Ngữ cảnh thời gian thật: lời thoại có mốc, thời điểm bấm chuột, bản dựng hiện tại.
        transcript: transcript ? transcriptExcerpt(transcript.words, edit.clips) : '',
        clicks: cursor ? outputClicks(cursor.clicks, edit.clips) : [],
        edit: editSummary(edit),
      }
      let plan: DirectorPlan = EMPTY_PLAN
      try {
        plan = normalizeDirectorPlan(await lumora().directEdits(text, context))
      } catch {
        // Không có AI (thiếu key / Ollama tắt): lập kế hoạch tại chỗ theo từ khóa.
      }
      if (get().folder !== folder) return { plan, applied: false, report: [] }
      // Bổ sung lệnh hiểu theo từ khóa + thói quen (mẫu phụ đề quen, âm lượng nhạc quen).
      const local = planLocally(
        normalizeAssistantCommands([...plan.commands, ...parseAssistantRequest(text)]),
        { musicTracks, hasCursor, durationMs: context.durationMs },
        get().memory,
      )
      const commands = local.commands
      let questions = [...plan.questions, ...local.questions].slice(0, 2)
      if (commands.length === 0 && questions.length === 0) questions = [DIRECTOR_FALLBACK_QUESTION]
      const final: DirectorPlan = { summary: plan.summary || '', questions, commands }
      if (questions.length > 0 || get().askConfirm) {
        set({ directorPlan: final })
        pushDirectorMessage(folder, {
          role: 'ai',
          text: [final.summary, ...questions].filter(Boolean).join('\n'),
          at: Date.now(),
        })
        return { plan: final, applied: false, report: [] }
      }
      const report = await get().applyAssistantCommands(commands, onProgress)
      if (get().folder === folder) {
        set({ directorPlan: null })
        pushDirectorMessage(folder, {
          role: 'ai',
          text: final.summary || doneLine(commands.length),
          at: Date.now(),
        })
      }
      return { plan: final, applied: true, report }
    } finally {
      set({ directorBusy: false })
    }
  },

  async applyDirectorPlan(onProgress) {
    const { folder, directorPlan: plan } = get()
    if (!folder || !plan) return []
    if (plan.commands.length === 0) {
      set({ directorPlan: null })
      return []
    }
    set({ directorBusy: true })
    try {
      const report = await get().applyAssistantCommands(plan.commands, onProgress)
      if (get().folder === folder) {
        set({ directorPlan: null })
        pushDirectorMessage(folder, {
          role: 'ai',
          text: plan.summary || doneLine(plan.commands.length),
          at: Date.now(),
        })
      }
      return report
    } finally {
      set({ directorBusy: false })
    }
  },

  discardDirectorPlan() {
    set({ directorPlan: null })
  },

  rememberDirectorRule(text) {
    const memory = rememberRule(get().memory, text)
    if (memory === get().memory) return
    set({ memory })
    savePrefs(MEMORY_KEY, memory)
  },

  forgetDirectorRule(text) {
    const memory = forgetRule(get().memory, text)
    set({ memory })
    savePrefs(MEMORY_KEY, memory)
  },

  setAskConfirm(askConfirm) {
    set({ askConfirm })
    savePrefs(DIRECTOR_PREFS_KEY, { askConfirm })
  },

  learnFromCurrentEdit() {
    const { project, edit, memory } = get()
    if (!project || !edit) return
    const next = learnFromEdit(memory, project.id, edit)
    if (next === memory) return
    set({ memory: next })
    savePrefs(MEMORY_KEY, next)
  },

  requestExport(autoStart) {
    set({ exportRequest: get().exportRequest + 1, autoExport: autoStart })
  },

  async addCaptionEmojis() {
    const { folder, edit } = get()
    if (!folder || !edit || edit.captions.lines.length === 0) return 0
    const lines = edit.captions.lines.map((l) => ({ id: l.id, text: l.text }))
    let items: { id: string; emoji: string }[]
    try {
      items = await lumora().captionEmojis(lines, edit.captions.language)
    } catch {
      // Không có AI: từ điển emoji theo từ khóa.
      items = lines.map((l) => ({ id: l.id, emoji: suggestCaptionEmoji(l.text) }))
    }
    if (get().folder !== folder) return 0
    const cur = get().edit!
    const result = applyCaptionEmojis(cur.captions.lines, items)
    if (result.count > 0)
      get().change((e) => ({ ...e, captions: { ...e.captions, lines: result.lines } }))
    return result.lines.filter((l) => l.emoji).length
  },

  async addCaptionKeywords() {
    const { folder, edit } = get()
    if (!folder || !edit || edit.captions.lines.length === 0) return 0
    const lines = edit.captions.lines.map((l) => ({ id: l.id, text: l.text }))
    let items: { id: string; keywords: string[] }[]
    try {
      items = await lumora().captionKeywords(lines, edit.captions.language)
    } catch {
      items = lines.map((l) => ({ id: l.id, keywords: suggestCaptionKeywords(l.text) }))
    }
    if (get().folder !== folder) return 0
    const cur = get().edit!
    const result = applyCaptionKeywords(cur.captions.lines, items)
    if (result.count > 0)
      get().change((e) => ({ ...e, captions: { ...e.captions, lines: result.lines } }))
    return result.lines.filter((l) => l.keywords && l.keywords.length > 0).length
  },

  async dubCaptions(options) {
    const { folder, edit } = get()
    if (!folder || !edit || edit.captions.lines.length === 0) return 0
    const target = options.language.trim().toLowerCase().slice(0, 8)
    const sameLanguage =
      !!edit.captions.language && edit.captions.language.slice(0, 2) === target.slice(0, 2)
    const source = edit.captions.lines
    // Giọng: theo id / tên, không thì giọng đầu tiên.
    const voices = await lumora().listVoices()
    if (get().folder !== folder) return 0
    const wanted = options.voiceName?.trim().toLowerCase()
    const voice =
      (wanted &&
        voices.find((v) => v.id.toLowerCase() === wanted || v.name.toLowerCase() === wanted)) ||
      (wanted && voices.find((v) => v.name.toLowerCase().includes(wanted))) ||
      voices[0]
    if (!voice) throw new Error('no_voice')
    // Lời đọc: bản dịch (khi khác ngôn ngữ) hoặc chính nội dung phụ đề.
    let texts = new Map(source.map((l) => [l.id, l.text]))
    if (!sameLanguage) {
      const translated = await lumora().translateLines(
        source.map((l) => ({ id: l.id, text: l.text })),
        target,
      )
      if (get().folder !== folder) return 0
      texts = new Map(translated.map((l) => [l.id, l.text]))
    }
    // Đọc từng dòng; câu dài hơn chỗ trống tới dòng sau thì đọc lại nhanh hơn (tối đa 1,2×).
    const total = outputDuration(edit.clips)
    const slots = dubSlots(source, edit.clips, total)
    const base = get().voiceOptions
    const assets = new Map<string, AudioAsset>()
    let done = 0
    for (const [i, line] of source.entries()) {
      const slot = slots[i]
      const text = (texts.get(line.id) ?? line.text).trim()
      if (!slot || !text) continue
      let asset = await lumora().speak(folder, text, voice.id, base)
      if (get().folder !== folder) return 0
      const speed = dubSpeedFor(asset.durationMs, slot.slot, Math.max(base.speed, 1.2))
      if (speed > base.speed) {
        asset = await lumora().speak(folder, text, voice.id, { ...base, speed })
        if (get().folder !== folder) return 0
      }
      assets.set(line.id, asset)
      done += 1
      options.onProgress?.(done, source.length)
    }
    const placements = planDubClips(
      source,
      edit.clips,
      new Map([...assets].map(([id, a]) => [id, a.durationMs])),
      total,
    )
    if (placements.length === 0) return 0
    const clips: AudioClip[] = placements.map((p) => {
      const asset = assets.get(p.lineId)!
      const text = texts.get(p.lineId) ?? ''
      return {
        id: newAudioClipId(),
        file: asset.file,
        name: text.length > 40 ? `${text.slice(0, 40)}…` : text,
        kind: 'voice',
        start: p.start,
        offset: 0,
        duration: p.duration,
        sourceDuration: asset.durationMs,
        volume: 1,
        fadeIn: 0,
        fadeOut: p.duration < asset.durationMs ? 120 : 0,
        loop: false,
      }
    })
    get().change((e) => ({
      ...e,
      audio: { ...e.audio, mic: options.keepOriginal ? Math.min(e.audio.mic, 0.15) : 0 },
      audioClips: [...e.audioClips, ...clips],
      captions: sameLanguage
        ? e.captions
        : {
            ...e.captions,
            language: target,
            bilingual: false,
            lines: e.captions.lines.map((l) => {
              const text = texts.get(l.id)
              if (!text || text === l.text) return l
              const next = { ...l, text, edited: true }
              delete next.translation
              return next
            }),
          },
    }))
    get().select({ kind: 'audio', id: clips[0]!.id })
    return clips.length
  },

  async splitIntoShorts(options, onProgress) {
    const { folder, edit, project } = get()
    if (!folder || !edit || !project) return 0
    const total = outputDuration(edit.clips)
    const minMs = options.minMs ?? MIN_SHORT_MS
    if (options.mode === 'highlights') return get().splitHighlights(options, onProgress)
    let bounds: number[]
    if (options.mode === 'chapters') {
      const summary = await lumora().summarize(folder)
      bounds = summary.chapters
        .map((c) => sourceToOutput(edit.clips, c.start))
        .filter((t): t is number => t !== null && t > 0)
    } else {
      const step = Math.max(minMs, Math.round((options.seconds ?? 60) * 1000))
      bounds = []
      for (let t = step; t < total; t += step) bounds.push(t)
    }
    // Mốc chia tăng dần, bỏ mốc tạo ra đoạn quá ngắn.
    const cuts: number[] = []
    let last = 0
    for (const b of [...bounds].sort((x, y) => x - y)) {
      if (b - last < minMs || total - b < minMs) continue
      cuts.push(b)
      last = b
    }
    const ranges = [0, ...cuts].map((start, i, arr) => ({ start, end: arr[i + 1] ?? total }))
    if (ranges.length < 2) return 0
    const sourceTotal = sourceDuration(project.segments)
    for (const [i, range] of ranges.entries()) {
      const a = outputToSource(edit.clips, range.start)?.source ?? 0
      const b =
        outputToSource(edit.clips, Math.max(range.start, range.end - 1))?.source ?? sourceTotal
      const clips = removeSourceRanges(edit.clips, [
        { start: 0, end: a },
        { start: Math.max(a, b + 1), end: sourceTotal },
      ])
      const short: EditState = {
        ...edit,
        clips,
        // Các mục tính theo thời gian video xuất không còn đúng chỗ: bỏ.
        overlays: [],
        effects: [],
        audioClips: [],
        markers: [],
        transitions: [],
        frame: options.vertical ? { ...edit.frame, aspect: '9:16', fill: true } : edit.frame,
      }
      const copy = await lumora().duplicateProject(folder, `(short ${i + 1})`)
      await lumora().saveEdit(copy, short)
      onProgress?.(i + 1, ranges.length)
    }
    return ranges.length
  },

  async splitHighlights(options, onProgress) {
    const { folder, edit, project } = get()
    if (!folder || !edit || !project) return 0
    // Cần lời thoại (AI đọc để chọn đoạn); chưa có thì nhận dạng trước.
    if (!get().transcript) {
      const transcript = await lumora().transcribe(folder, edit.captions.language || '')
      if (get().folder !== folder) return 0
      get().setTranscript(transcript)
    }
    const segments: HighlightSegment[] = await lumora().highlights(folder, options.count ?? 3)
    if (get().folder !== folder || segments.length === 0) return 0
    const sourceTotal = sourceDuration(project.segments)
    const vertical = options.vertical !== false
    const hookStyle = templateStyle('title')
    let made = 0
    for (const [i, seg] of segments.entries()) {
      const a = Math.max(0, Math.min(seg.start, sourceTotal))
      const b = Math.max(a + 1, Math.min(seg.end, sourceTotal))
      const clips = removeSourceRanges(edit.clips, [
        { start: 0, end: a },
        { start: b, end: sourceTotal },
      ])
      const length = outputDuration(clips)
      if (length < MIN_SHORT_MS) continue
      const hook = seg.hook
        ? [
            {
              ...buildOverlay(
                {
                  kind: 'text',
                  text: seg.hook,
                  style: 'title',
                  color: hookStyle.color,
                  textStyle: hookStyle,
                },
                0,
                length,
              ),
              start: 0,
              end: Math.min(length, 2500),
              x: 0.5,
              y: 0.3,
            },
          ]
        : []
      const short: EditState = {
        ...edit,
        clips,
        // Các mục tính theo thời gian video xuất không còn đúng chỗ: bỏ; hook ở đầu short.
        overlays: hook,
        effects: [],
        audioClips: [],
        markers: [],
        transitions: [],
        frame: vertical ? { ...edit.frame, aspect: '9:16', fill: true } : edit.frame,
        captions: vertical
          ? {
              ...edit.captions,
              look: { ...edit.captions.look, template: 'tiktok' },
              style: 'highlight',
            }
          : edit.captions,
      }
      const label = seg.title ? `(short ${i + 1}: ${seg.title})` : `(short ${i + 1})`
      const copy = await lumora().duplicateProject(folder, label)
      await lumora().saveEdit(copy, short)
      made++
      onProgress?.(i + 1, segments.length)
    }
    return made
  },

  async autoBuild(input, onProgress) {
    const options = normalizeAutoBuildOptions(input)
    const { folder, edit: before, project, cursor, events } = get()
    if (!folder || !before || !project) throw new Error('no_project')
    const steps = ['prepare', 'plan', 'apply', 'review', ...(options.shorts ? ['shorts'] : [])]
    let n = 0
    const tick = (step: string) => onProgress?.(++n, steps.length, step)
    const pastBefore = get().past
    set({ directorBusy: true, directorPlan: null })
    try {
      // 1. Chuẩn bị (local): lời thoại để AI lập kế hoạch đúng mốc thời gian.
      tick('prepare')
      let transcript = get().transcript
      if (!transcript) {
        try {
          transcript = await lumora().transcribe(folder, before.captions.language || '')
          if (get().folder !== folder) throw new Error('project_changed')
          get().setTranscript(transcript)
        } catch (e) {
          if (errorCode(e) === 'project_changed') throw e
          transcript = null
        }
      }
      const hasCursor = cursor !== null && events.length > 0
      const durationMs = outputDuration(get().edit!.clips)
      const format: RecipeStyle =
        options.format === 'auto' ? pickAutoFormat({ durationMs, hasCursor }) : options.format

      // 2. Lập kế hoạch: một lần gọi AI với câu yêu cầu cố định ngắn; ngữ cảnh video ở phần động
      // của lời nhắc, phần tĩnh (tập lệnh + sổ tay) được cache. Không có AI: công thức có sẵn.
      tick('plan')
      const goal = autoBuildGoal(options, format)
      const [tracks, projects] = await Promise.all([
        lumora()
          .listMusic()
          .catch(() => [] as MusicTrack[]),
        lumora()
          .listProjects()
          .catch(() => []),
      ])
      if (get().folder !== folder) throw new Error('project_changed')
      const edit = get().edit!
      const language = edit.captions.language || transcript?.language || ''
      const context: DirectorContext = {
        language,
        durationMs,
        hasTranscript: transcript !== null,
        hasCursor,
        musicTracks: tracks.map((t) => t.name),
        projects: projects.filter((p) => p.folder !== folder).map((p) => p.name),
        memory: memorySummary(get().memory, language || 'vi'),
        // Không gửi hội thoại cũ: tự dựng là một yêu cầu trọn vẹn (tiết kiệm token).
        history: [],
        transcript: transcript ? transcriptExcerpt(transcript.words, edit.clips) : '',
        clicks: cursor ? outputClicks(cursor.clicks, edit.clips) : [],
        edit: editSummary(edit),
      }
      pushDirectorMessage(folder, {
        role: 'user',
        text: i18n.t('ai.autoBuild.goal', { format: i18n.t(`ai.autoBuild.formats.${format}`) }),
        at: Date.now(),
      })
      let plan: DirectorPlan | null = null
      try {
        plan = normalizeDirectorPlan(await lumora().directEdits(goal, context))
      } catch {
        plan = null
      }
      if (get().folder !== folder) throw new Error('project_changed')
      const ai = plan !== null && plan.commands.length > 0
      let commands: AssistantCommand[] = ai
        ? plan!.commands
        : planAutoBuildLocally(options, format, language)
      // Không có AI: hook mở đầu lấy từ câu nói đầu tiên (vài từ đầu của lời thoại).
      if (!ai && transcript && transcript.words.length > 0) {
        const hook = transcript.words
          .slice(0, 8)
          .map((w) => w.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
        if (hook)
          commands.push({
            kind: 'text',
            text: hook,
            atMs: 0,
            ms: 2500,
            template: 'title',
            position: 'top',
          })
      }
      // Bảo đảm xương sống của bản dựng dù AI có bỏ sót: công thức đúng định dạng, nhạc khi được
      // yêu cầu; bỏ những gì người dùng không chọn; không xuất / không tách ở bước này.
      if (!commands.some((c) => c.kind === 'recipe'))
        commands = [{ kind: 'recipe', style: format }, ...commands]
      if (!options.music)
        commands = commands.filter((c) => c.kind !== 'findMusic' && c.kind !== 'music')
      else if (!commands.some((c) => c.kind === 'findMusic' || c.kind === 'music'))
        commands.push(
          ...planAutoBuildLocally(options, format, language).filter((c) => c.kind === 'findMusic'),
        )
      if (!options.broll) commands = commands.filter((c) => c.kind !== 'broll')
      commands = normalizeAssistantCommands(
        commands.filter((c) => c.kind !== 'shorts' && c.kind !== 'export'),
      )

      // 3. Áp dụng.
      tick('apply')
      const report = await get().applyAssistantCommands(commands)
      if (get().folder !== folder) throw new Error('project_changed')

      // 4. Rà soát theo sổ tay (local, không tốn token) và lấp chỗ thiếu.
      tick('review')
      const review = reviewBuild(get().edit!, format, { ...options, language })
      if (review.fixes.length > 0) {
        report.push(...(await get().applyAssistantCommands(review.fixes)))
        if (get().folder !== folder) throw new Error('project_changed')
      }
      const all = [...commands, ...review.fixes]
      const used = new Set(
        get()
          .edit!.audioClips.filter((a) => a.kind === 'music')
          .map((a) => a.name),
      )
      const library = await lumora()
        .listMusic()
        .catch(() => tracks)
      const credits = library.filter((t) => t.credit && used.has(t.name)).map((t) => t.credit!)

      // 5. Tách 2-3 video ngắn từ video dài (tuỳ chọn).
      let shorts = 0
      if (options.shorts) {
        tick('shorts')
        if (outputDuration(get().edit!.clips) >= MIN_SHORTS_SOURCE_MS) {
          try {
            shorts = await get().splitIntoShorts({
              mode: 'highlights',
              count: options.shortsCount,
              vertical: true,
            })
            report.push(
              shorts > 0
                ? { step: 'shorts', status: 'done', detail: shorts }
                : { step: 'shorts', status: 'skipped', detail: 'no_results' },
            )
          } catch (e) {
            report.push({ step: 'shorts', status: 'error', detail: errorCode(e) })
          }
        } else report.push({ step: 'shorts', status: 'skipped', detail: 'too_short' })
      }
      if (get().folder !== folder) throw new Error('project_changed')
      // Một bước hoàn tác cho cả bản dựng.
      const after = get().edit
      if (after && after !== before)
        set({ past: [...pastBefore, before].slice(-HISTORY_LIMIT), future: [] })
      pushDirectorMessage(folder, {
        role: 'ai',
        text: plan?.summary || doneLine(all.length),
        at: Date.now(),
      })
      return { format, commands: all, report, review, shorts, credits, ai }
    } finally {
      if (get().folder === folder) set({ directorBusy: false })
    }
  },

  async autoEdit(options, onProgress) {
    const { folder, edit: before, project, waveform, cursor, events } = get()
    if (!folder || !before || !project) return []
    const hasCursor = cursor !== null && events.length > 0
    const steps = AUTO_EDIT_STEPS.filter((s) => options[s])
    const pastBefore = get().past
    const report: AutoEditReport[] = []
    let done = 0
    const tick = (step: AutoEditStep) => onProgress?.(++done, steps.length, step)

    // Lời thoại: cần cho từ thừa, phụ đề và tiêu đề (và cho khoảng lặng khi chưa có dạng sóng
    // để dựa vào). Thiếu key thì các bước đó bị bỏ qua.
    let transcript = get().transcript
    let transcriptIssue: string | null = null
    const needTranscript =
      options.fillers || options.captions || options.title || (options.silences && !waveform)
    if (needTranscript && !transcript) {
      try {
        transcript = await lumora().transcribe(folder, before.captions.language || '')
        if (get().folder !== folder) return []
        get().setTranscript(transcript)
      } catch (e) {
        transcriptIssue = errorCode(e)
      }
    }
    const noTranscript = transcriptIssue ?? 'no_transcript'

    // Cắt: khoảng lặng (theo lời thoại, hoặc theo dạng sóng khi không có lời) và từ thừa.
    const ranges: SourceRange[] = []
    if (options.silences) {
      const found = transcript
        ? findSilences(transcript.words)
        : waveform
          ? findQuietRanges(waveform)
          : null
      if (found) {
        ranges.push(...found)
        report.push({ step: 'silences', status: 'done', detail: found.length })
      } else report.push({ step: 'silences', status: 'skipped', detail: 'no_audio' })
      tick('silences')
    }
    if (options.fillers) {
      if (!transcript) report.push({ step: 'fillers', status: 'skipped', detail: noTranscript })
      else {
        let found: SourceRange[]
        try {
          // Claude tìm từ đệm và câu lặp; không có key Claude thì dùng danh sách từ đệm có sẵn.
          const suggestions = await lumora().suggestCuts(folder)
          found = suggestions
            .filter((s) => s.kind !== 'silence')
            .map((s) => ({ start: s.start, end: s.end }))
        } catch {
          found = wordsToRanges(
            transcript.words,
            findFillerWords(transcript.words, transcript.language),
          )
        }
        ranges.push(...found)
        report.push({ step: 'fillers', status: 'done', detail: found.length })
      }
      tick('fillers')
    }
    if (get().folder !== folder) return report
    if (ranges.length > 0)
      get().change((e) => ({ ...e, clips: removeSourceRanges(e.clips, ranges) }))

    if (options.zooms) {
      if (hasCursor) {
        get().regenerateZooms()
        report.push({ step: 'zooms', status: 'done', detail: get().edit?.zooms.length ?? 0 })
      } else report.push({ step: 'zooms', status: 'skipped', detail: 'no_cursor' })
      tick('zooms')
    }
    if (options.captions) {
      if (transcript) {
        const lines = buildCaptionLines(transcript.words)
        get().change((e) => ({
          ...e,
          captions: {
            ...e.captions,
            enabled: true,
            language: transcript!.language,
            lines,
            bilingual: false,
            translationLanguage: '',
          },
        }))
        report.push({ step: 'captions', status: 'done', detail: lines.length })
      } else report.push({ step: 'captions', status: 'skipped', detail: noTranscript })
      tick('captions')
    }
    if (options.audio) {
      get().change((e) => ({
        ...e,
        audio: {
          ...e.audio,
          micFx: { ...e.audio.micFx, noise: 'medium', enhance: true, normalize: true },
        },
      }))
      report.push({ step: 'audio', status: 'done', detail: 1 })
      tick('audio')
    }
    if (options.title) {
      if (!transcript) report.push({ step: 'title', status: 'skipped', detail: noTranscript })
      else {
        try {
          const summary = await lumora().summarize(folder)
          const title = summary.titles[0]?.trim()
          if (get().folder !== folder) return report
          if (title) {
            addTitleOverlay(title)
            report.push({ step: 'title', status: 'done', detail: 1 })
          } else report.push({ step: 'title', status: 'skipped', detail: 'no_title' })
        } catch (e) {
          report.push({ step: 'title', status: 'error', detail: errorCode(e) })
        }
      }
      tick('title')
    }

    // Gộp thành một bước hoàn tác.
    const after = get().edit
    if (after && after !== before)
      set({ past: [...pastBefore, before].slice(-HISTORY_LIMIT), future: [] })
    return report
  },

  updateAllZooms(patch, coalesce) {
    get().change((e) => {
      const zooms = updateAllZooms(e.zooms, patch)
      return zooms.every((z, i) => z === e.zooms[i]) ? e : { ...e, zooms }
    }, coalesce)
  },

  setZooms(zooms) {
    const { project, selection } = get()
    if (!project) return
    get().change((e) => ({ ...e, zooms: normalizeZooms(zooms, sourceDuration(project.segments)) }))
    if (selection?.kind === 'zoom' && !zooms.some((z) => z.id === selection.id)) get().select(null)
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
