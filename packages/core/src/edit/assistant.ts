import { SOUND_EFFECT_IDS, type SoundEffectId } from './audio-clips'
import { VOICE_FX, type VoiceFx } from './audio-fx'
import { CAPTION_TEMPLATES, type CaptionTemplate } from './caption-style'
import { CAMERA_LAYOUTS, type CameraBgMode, type CameraLayout, CAMERA_BG_MODES } from './edit-state'
import { EFFECT_KINDS, type EffectKind } from './effects'
import { ASPECTS, CORNERS, type Aspect, type Corner } from './layout'
import {
  ADJUST_KEYS,
  FILTER_PRESETS,
  POSITIVE_ADJUST,
  type AdjustKey,
  type FilterPreset,
} from './look'
import { RESOLUTIONS, type Resolution } from './layout'
import { ROTATIONS, type Rotation } from './orient'
import { SHAPES, type ShapeKind } from './shapes'
import { BLUR_MODES, DEFAULT_OVERLAY_MS, type BlurMode } from './overlays'
import { SPEED_CURVE_PRESETS } from './speed-curve'
import { FONT_IDS, TEXT_TEMPLATES, type FontId, type TextTemplateId } from './text-style'
import { TIMELINE_ROWS, type TimelineRow } from './tracks'
import { TRANSITION_KINDS, type TransitionKind } from './transitions'

/** Mục có thể xóa sạch bằng lệnh `clear`. */
export const CLEAR_TARGETS = [
  'zooms',
  'effects',
  'overlays',
  'music',
  'sfx',
  'transitions',
  'captions',
  'markers',
  'filter',
  'adjust',
  'cuts',
] as const
export type ClearTarget = (typeof CLEAR_TARGETS)[number]

/** Nguồn âm thanh mà lệnh `volume` chỉnh được. */
export const VOLUME_TARGETS = ['mic', 'system', 'music', 'sfx'] as const
export type VolumeTarget = (typeof VOLUME_TARGETS)[number]

/** Vị trí đặt sẵn cho chữ / nhãn dán. */
export const OVERLAY_POSITIONS = ['top', 'center', 'bottom'] as const
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number]

export const CAMERA_SHAPES = ['circle', 'rounded', 'square'] as const
export type CameraShape = (typeof CAMERA_SHAPES)[number]

export const TEXT_TEMPLATE_IDS = TEXT_TEMPLATES.map((t) => t.id) as TextTemplateId[]

/**
 * Công thức dựng (phong cách) có sẵn: `youtube` = hướng dẫn dài 16:9, `shorts` = TikTok / Shorts /
 * Reels dọc, `vlog` = nói trước camera, `clean` = tối giản sạch sẽ. Mỗi công thức mở rộng thành
 * nhiều lệnh (xem `expandRecipes` trong director.ts).
 */
export const RECIPE_STYLES = ['youtube', 'shorts', 'vlog', 'clean'] as const
export type RecipeStyle = (typeof RECIPE_STYLES)[number]

/** Nhịp nhạc nền khi AI tự tìm nhạc (Jamendo `speed`). */
export const MUSIC_TEMPOS = ['slow', 'medium', 'fast'] as const
export type MusicTempo = (typeof MUSIC_TEMPOS)[number]

/** Cách chia video ngắn: mỗi N giây, theo chương AI, hoặc AI chọn các đoạn hay nhất (highlights). */
export const SHORTS_MODES = ['fixed', 'chapters', 'highlights'] as const
export type ShortsMode = (typeof SHORTS_MODES)[number]

/** Mẫu đường cong tốc độ dùng được qua lệnh `speedCurve`. */
export type SpeedCurvePresetId = (typeof SPEED_CURVE_PRESETS)[number]

/**
 * Lệnh chỉnh sửa mà trợ lý AI (kiểu EditPilot của CapCut) có thể ra: người dùng mô tả bằng lời,
 * Claude (hoặc bộ phân tích từ khóa khi không có key) đổi thành danh sách lệnh, app thực hiện.
 * Mọi mốc thời gian (`atMs`, `fromMs`, `toMs`) tính trên video xuất (sau khi cắt).
 */
export type AssistantCommand =
  | { kind: 'cutSilences' }
  | { kind: 'removeFillers' }
  | { kind: 'autoZoom' }
  | { kind: 'captions' }
  | { kind: 'cleanAudio' }
  | { kind: 'title'; text: string }
  | { kind: 'filter'; preset: FilterPreset; intensity: number }
  | { kind: 'speed'; factor: number }
  | { kind: 'aspect'; aspect: Aspect }
  | { kind: 'trimStart'; ms: number }
  | { kind: 'trimEnd'; ms: number }
  /** Hiệu ứng hình tại đầu video và mỗi chỗ nối clip. */
  | { kind: 'effect'; effect: EffectKind }
  /** Chuyển cảnh cho mọi chỗ nối; `ms` = độ dài (mặc định 600). */
  | { kind: 'transitions'; transition: TransitionKind; ms?: number }
  /** Nhạc nền từ kho nhạc của tôi (tìm theo từ khóa trong tên bài), âm lượng 0–1. */
  | { kind: 'music'; query: string; volume: number }
  /** Mẫu phụ đề (tiktok, karaoke, neon…). */
  | { kind: 'captionsStyle'; template: CaptionTemplate }
  /** Đặt cài đặt xuất rồi xuất luôn. */
  | {
      kind: 'export'
      resolution: Resolution
      format: 'mp4' | 'gif'
      fps?: 30 | 60
      /** Nâng cao chất lượng (giảm nhiễu, làm nét) khi xuất. */
      enhance?: boolean
    }
  /** Áp dụng phong cách (khung hình, bộ lọc, phụ đề, chuyển động…) của một dự án mẫu. */
  | { kind: 'styleFrom'; project: string }
  // ---- Timeline ----
  /** Cắt bỏ một khoảng của video xuất. */
  | { kind: 'cutRange'; fromMs: number; toMs: number }
  /** Chèn khung hình đứng yên tại một thời điểm, giữ `ms`. */
  | { kind: 'freeze'; atMs: number; ms: number }
  /** Lật toàn bộ video màn hình. */
  | { kind: 'flip'; axis: 'horizontal' | 'vertical' }
  /** Xoay toàn bộ video màn hình (độ, theo chiều kim đồng hồ). */
  | { kind: 'rotate'; degrees: Rotation }
  // ---- Âm thanh ----
  /** Âm lượng micro / âm thanh máy / nhạc nền / hiệu ứng âm thanh (0 = tắt tiếng, 1 = giữ nguyên, tối đa 2). */
  | { kind: 'volume'; target: VolumeTarget; level: number }
  /** Hiệu ứng giọng cho micro (chipmunk, deep, robot…). */
  | { kind: 'voiceFx'; voice: VoiceFx }
  /** Nhạc nền tăng dần lúc đầu / giảm dần lúc cuối (ms). */
  | { kind: 'fade'; ms: number }
  /** Hiệu ứng âm thanh có sẵn tại một thời điểm. */
  | { kind: 'sound'; sound: SoundEffectId; atMs: number }
  /** Tự giảm nhạc nền khi có lời (audio ducking); `level` = âm lượng nhạc khi có lời 0.05..0.8. */
  | { kind: 'duck'; enabled: boolean; level?: number }
  // ---- Zoom & chuyển động ----
  /** Đặt mức phóng to cho mọi đoạn zoom hiện có. */
  | { kind: 'zoomLevel'; scale: number }
  /** Thêm một đoạn zoom theo con trỏ tại thời điểm, dài `ms`. */
  | { kind: 'zoomAt'; atMs: number; ms: number; scale: number }
  /** Tốc độ khung nhìn theo con trỏ (0..1) và thời gian zoom vào / ra (ms). */
  | { kind: 'motion'; cameraSpeed?: number; zoomMs?: number }
  // ---- Khung hình ----
  /** Lề, bo góc, bóng đổ (0..1) và phủ kín khung. */
  | { kind: 'frame'; padding?: number; radius?: number; shadow?: number; fill?: boolean }
  /** Nền sau video: một màu, hoặc chuyển màu khi có `color2`. */
  | { kind: 'background'; color: string; color2: string }
  /** Con trỏ chuột vẽ thêm. */
  | {
      kind: 'cursor'
      visible?: boolean
      size?: number
      clickEffect?: boolean
      hideIdle?: boolean
      /** Hiện phím tắt đã bấm dưới khung hình. */
      showKeys?: boolean
    }
  /** Bong bóng webcam. */
  | {
      kind: 'camera'
      visible?: boolean
      shape?: CameraShape
      size?: number
      position?: Corner
      layout?: CameraLayout
      beauty?: boolean
      background?: CameraBgMode
    }
  // ---- Lớp nổi ----
  /** Chữ nổi trên video theo mẫu chữ. */
  | {
      kind: 'text'
      text: string
      atMs: number
      ms: number
      template: TextTemplateId
      position: OverlayPosition
    }
  /** Nhãn dán emoji. */
  | { kind: 'sticker'; emoji: string; atMs: number; ms: number; position: OverlayPosition }
  /** Hình vẽ sẵn (mũi tên, vòng tròn…) tại vị trí (x, y) 0..1. */
  | {
      kind: 'shape'
      shape: ShapeKind
      atMs: number
      ms: number
      x: number
      y: number
      color: string
    }
  /** Vùng che (làm mờ / khảm ô) tâm (x, y) 0..1, cao `size` theo chiều cao khung (0.05..1). */
  | {
      kind: 'blur'
      mode: BlurMode
      atMs: number
      ms: number
      x: number
      y: number
      size: number
    }
  // ---- Màu ----
  /** Một điều chỉnh màu (độ sáng, tương phản…): -1..1 (sharpen / vignette / grain: 0..1). */
  | { kind: 'adjust'; setting: AdjustKey; value: number }
  // ---- Phụ đề ----
  /** Vị trí (trên / dưới) và cỡ chữ phụ đề (0.5..2.5). */
  | { kind: 'captionsLayout'; position?: 'top' | 'bottom'; size?: number }
  /** Dịch phụ đề sang ngôn ngữ khác: thay nội dung, hoặc hiện song ngữ. */
  | { kind: 'translate'; language: string; bilingual: boolean }
  // ---- Mốc & hàng ----
  /** Điểm đánh dấu trên timeline. */
  | { kind: 'marker'; atMs: number; label: string }
  /** Tạo mốc chương từ lời thoại (AI tóm tắt). */
  | { kind: 'chapters' }
  /** Ẩn / tắt tiếng / khóa một hàng trên timeline. */
  | { kind: 'track'; row: TimelineRow; hidden?: boolean; muted?: boolean; locked?: boolean }
  /** Xóa sạch một loại mục (zoom, hiệu ứng, nhạc, phụ đề…; `cuts` = khôi phục bản quay đầy đủ). */
  | { kind: 'clear'; target: ClearTarget }
  /**
   * Chia thành video ngắn: mỗi N giây, theo chương AI, hoặc `highlights` = AI chọn `count` đoạn
   * hay nhất (mỗi đoạn trọn ý, có hook) từ lời thoại; tuỳ chọn khung dọc.
   */
  | { kind: 'shorts'; mode: ShortsMode; seconds: number; vertical: boolean; count: number }
  // ---- Dựng chuyên nghiệp (1.9.0) ----
  /** Công thức dựng theo phong cách (mở rộng thành nhiều lệnh trước khi chạy). */
  | { kind: 'recipe'; style: RecipeStyle }
  /** Hiệu ứng hình tại một thời điểm (điểm nhấn / pattern interrupt), độ mạnh 0..1. */
  | { kind: 'effectAt'; effect: EffectKind; atMs: number; ms: number; intensity: number }
  /** Đổi tốc độ một đoạn (tua nhanh phần chờ đợi, chậm lại chỗ quan trọng). */
  | { kind: 'speedRange'; fromMs: number; toMs: number; factor: number }
  /** Đường cong tốc độ kiểu CapCut cho clip chứa `atMs` (0 = clip đầu). */
  | { kind: 'speedCurve'; preset: SpeedCurvePresetId; atMs: number }
  /** Chuyển cảnh tại chỗ nối gần `atMs` nhất, dài `ms`. */
  | { kind: 'transitionAt'; atMs: number; transition: TransitionKind; ms: number }
  /** Phông, màu, chữ in hoa, số từ mỗi lần hiện và kiểu tô (từng từ / cả dòng) của phụ đề. */
  | {
      kind: 'captionsLook'
      font?: FontId
      color?: string
      highlightColor?: string
      uppercase?: boolean
      maxWords?: number
      style?: 'highlight' | 'classic'
    }
  /** Thẻ kết (CTA: "Đăng ký", "Xem video tiếp") hiện trong `ms` cuối video, luôn bám cuối. */
  | { kind: 'outro'; text: string; ms: number; template: TextTemplateId }
  // ---- Tự dựng một nút (1.12.0) ----
  /**
   * AI tự tìm nhạc nền miễn phí bản quyền (Jamendo, giấy phép Creative Commons cho phép dùng
   * thương mại) theo tâm trạng (`mood`: vài từ tiếng Anh như "upbeat corporate", "calm lofi") và
   * nhịp, tải về kho nhạc rồi chèn làm nhạc nền với âm lượng `volume`.
   */
  | { kind: 'findMusic'; mood: string; tempo: MusicTempo; volume: number }
  /**
   * Chèn tư liệu (b-roll) từ kho video miễn phí (Pixabay) phủ kín khung tại `atMs` trong `ms`;
   * `query` = từ khóa tiếng Anh ngắn ("typing on laptop", "city traffic").
   */
  | { kind: 'broll'; query: string; atMs: number; ms: number }
  // ---- Phụ đề kiểu app Captions (1.13.0) ----
  /** AI gắn một emoji hợp nội dung vào các dòng phụ đề. */
  | { kind: 'captionsEmoji' }
  /** AI chọn từ khóa mỗi dòng phụ đề để tô màu riêng. */
  | { kind: 'captionsKeywords' }
  /**
   * Lồng tiếng AI: dịch lời thoại sang `language` (nếu khác ngôn ngữ gốc) rồi đọc bằng giọng AI
   * đúng thời điểm từng dòng; tắt tiếng micro gốc trừ khi `keepOriginal` (giữ nhỏ phía dưới).
   * `voiceName` = tên / id giọng (bỏ trống = giọng đầu tiên).
   */
  | { kind: 'dub'; language: string; keepOriginal: boolean; voiceName?: string }

export type AssistantKind = AssistantCommand['kind']

export const ASSISTANT_KINDS: readonly AssistantKind[] = [
  'cutSilences',
  'removeFillers',
  'autoZoom',
  'captions',
  'cleanAudio',
  'title',
  'filter',
  'speed',
  'aspect',
  'trimStart',
  'trimEnd',
  'effect',
  'transitions',
  'music',
  'captionsStyle',
  'export',
  'styleFrom',
  'cutRange',
  'freeze',
  'flip',
  'rotate',
  'volume',
  'voiceFx',
  'fade',
  'sound',
  'duck',
  'zoomLevel',
  'zoomAt',
  'motion',
  'frame',
  'background',
  'cursor',
  'camera',
  'text',
  'sticker',
  'shape',
  'blur',
  'adjust',
  'captionsLayout',
  'translate',
  'marker',
  'chapters',
  'track',
  'clear',
  'shorts',
  'recipe',
  'effectAt',
  'speedRange',
  'speedCurve',
  'transitionAt',
  'captionsLook',
  'outro',
  'findMusic',
  'broll',
  'captionsEmoji',
  'captionsKeywords',
  'dub',
]

/** Thông tin về video gửi kèm yêu cầu để AI ra lệnh phù hợp. */
export interface AssistantContext {
  language: string
  durationMs: number
  hasTranscript: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numOr = (v: unknown, lo: number, hi: number): number | undefined =>
  isNum(v) ? clamp(v, lo, hi) : undefined
const boolOr = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const oneOf = <T extends string | number>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined
const hex = (v: unknown): string | undefined =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : undefined
/** Mốc thời gian (ms) không âm, làm tròn; tối đa 1 giờ. */
const timeMs = (v: unknown): number | undefined =>
  isNum(v) && v >= 0 ? Math.round(clamp(v, 0, 3_600_000)) : undefined
/** Thời lượng (ms) dương, mặc định khi thiếu. */
const durMs = (v: unknown, fallback: number, lo = 200, hi = 600_000): number =>
  isNum(v) && v > 0 ? Math.round(clamp(v, lo, hi)) : fallback
/** Bỏ các khóa `undefined` cho lệnh gọn (so sánh bằng toEqual trong test). */
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/i

/**
 * Khóa chống trùng: hầu hết lệnh mỗi loại chỉ một; các lệnh theo mục / thời điểm (adjust từng
 * thông số, clear từng loại, marker từng mốc…) được phép nhiều lệnh cùng loại.
 */
export function assistantCommandKey(cmd: AssistantCommand): string {
  switch (cmd.kind) {
    case 'adjust':
      return `adjust:${cmd.setting}`
    case 'clear':
      return `clear:${cmd.target}`
    case 'volume':
      return `volume:${cmd.target}`
    case 'track':
      return `track:${cmd.row}`
    case 'marker':
      return `marker:${cmd.atMs}`
    case 'text':
      return `text:${cmd.atMs}:${cmd.text}`
    case 'sticker':
      return `sticker:${cmd.atMs}:${cmd.emoji}`
    case 'shape':
      return `shape:${cmd.atMs}:${cmd.shape}`
    case 'blur':
      return `blur:${cmd.atMs}:${cmd.x}:${cmd.y}`
    case 'sound':
      return `sound:${cmd.atMs}:${cmd.sound}`
    case 'zoomAt':
      return `zoomAt:${cmd.atMs}`
    case 'freeze':
      return `freeze:${cmd.atMs}`
    case 'cutRange':
      return `cutRange:${cmd.fromMs}`
    case 'effectAt':
      return `effectAt:${cmd.atMs}:${cmd.effect}`
    case 'broll':
      return `broll:${cmd.atMs}`
    case 'speedRange':
      return `speedRange:${cmd.fromMs}`
    case 'speedCurve':
      return `speedCurve:${cmd.atMs}`
    case 'transitionAt':
      return `transitionAt:${cmd.atMs}`
    default:
      return cmd.kind
  }
}

/** Đọc một lệnh từ dữ liệu không tin cậy; sai thì null. */
function parseCommand(r: Record<string, unknown>): AssistantCommand | null {
  switch (r.kind) {
    case 'cutSilences':
    case 'removeFillers':
    case 'autoZoom':
    case 'captions':
    case 'cleanAudio':
    case 'chapters':
    case 'captionsEmoji':
    case 'captionsKeywords':
      return { kind: r.kind }
    case 'dub': {
      const language = typeof r.language === 'string' ? r.language.trim().toLowerCase() : ''
      if (!LANGUAGE_CODE.test(language)) return null
      return compact({
        kind: 'dub' as const,
        language: language.slice(0, 8),
        keepOriginal: r.keepOriginal === true,
        voiceName:
          typeof r.voiceName === 'string' && r.voiceName.trim()
            ? r.voiceName.trim().slice(0, 80)
            : undefined,
      })
    }
    case 'title':
      if (typeof r.text === 'string' && r.text.trim())
        return { kind: 'title', text: r.text.trim().slice(0, 80) }
      return null
    case 'filter':
      if (FILTER_PRESETS.includes(r.preset as FilterPreset))
        return {
          kind: 'filter',
          preset: r.preset as FilterPreset,
          intensity: typeof r.intensity === 'number' ? clamp(r.intensity, 0.1, 1) : 1,
        }
      return null
    case 'speed':
      if (isNum(r.factor) && r.factor > 0)
        return { kind: 'speed', factor: clamp(Number(r.factor.toFixed(2)), 0.25, 8) }
      return null
    case 'aspect':
      if (ASPECTS.includes(r.aspect as Aspect))
        return { kind: 'aspect', aspect: r.aspect as Aspect }
      return null
    case 'trimStart':
    case 'trimEnd':
      if (typeof r.ms === 'number' && r.ms > 0)
        return { kind: r.kind, ms: Math.round(clamp(r.ms, 1, 3_600_000)) }
      return null
    case 'effect':
      if (EFFECT_KINDS.includes(r.effect as EffectKind))
        return { kind: 'effect', effect: r.effect as EffectKind }
      return null
    case 'transitions': {
      const transition = oneOf(TRANSITION_KINDS, r.transition)
      if (!transition) return null
      return compact({
        kind: 'transitions' as const,
        transition,
        ms: isNum(r.ms) && r.ms > 0 ? Math.round(clamp(r.ms, 100, 3000)) : undefined,
      })
    }
    case 'music':
      return {
        kind: 'music',
        query: typeof r.query === 'string' ? r.query.trim().slice(0, 60) : '',
        volume: typeof r.volume === 'number' ? clamp(r.volume, 0.05, 1) : 0.4,
      }
    case 'captionsStyle':
      if (CAPTION_TEMPLATES.includes(r.template as CaptionTemplate))
        return { kind: 'captionsStyle', template: r.template as CaptionTemplate }
      return null
    case 'export': {
      const fps = oneOf([30, 60] as const, r.fps)
      return compact({
        kind: 'export' as const,
        resolution: RESOLUTIONS.includes(r.resolution as Resolution)
          ? (r.resolution as Resolution)
          : 1080,
        format: (r.format === 'gif' ? 'gif' : 'mp4') as 'mp4' | 'gif',
        fps,
        enhance: boolOr(r.enhance),
      })
    }
    case 'styleFrom':
      if (typeof r.project === 'string' && r.project.trim())
        return { kind: 'styleFrom', project: r.project.trim().slice(0, 200) }
      return null
    case 'cutRange': {
      const fromMs = timeMs(r.fromMs)
      const toMs = timeMs(r.toMs)
      if (fromMs === undefined || toMs === undefined || toMs <= fromMs) return null
      return { kind: 'cutRange', fromMs, toMs }
    }
    case 'freeze': {
      const atMs = timeMs(r.atMs)
      if (atMs === undefined) return null
      return { kind: 'freeze', atMs, ms: durMs(r.ms, 2000, 100, 60_000) }
    }
    case 'flip': {
      const axis = oneOf(['horizontal', 'vertical'] as const, r.axis)
      return axis ? { kind: 'flip', axis } : null
    }
    case 'rotate': {
      const degrees = oneOf(ROTATIONS, r.degrees)
      return degrees ? { kind: 'rotate', degrees } : null
    }
    case 'volume': {
      const target = oneOf(VOLUME_TARGETS, r.target)
      const level = numOr(r.level, 0, 2)
      return target && level !== undefined ? { kind: 'volume', target, level } : null
    }
    case 'voiceFx': {
      const voice = oneOf(VOICE_FX, r.voice)
      return voice ? { kind: 'voiceFx', voice } : null
    }
    case 'fade':
      return { kind: 'fade', ms: durMs(r.ms, 1500, 0, 10_000) }
    case 'duck': {
      const enabled = boolOr(r.enabled)
      if (enabled === undefined) return null
      return compact({ kind: 'duck' as const, enabled, level: numOr(r.level, 0.05, 0.8) })
    }
    case 'blur': {
      const atMs = timeMs(r.atMs)
      if (atMs === undefined) return null
      return {
        kind: 'blur',
        mode: oneOf(BLUR_MODES, r.mode) ?? 'blur',
        atMs,
        ms: durMs(r.ms, DEFAULT_OVERLAY_MS),
        x: numOr(r.x, 0, 1) ?? 0.5,
        y: numOr(r.y, 0, 1) ?? 0.5,
        size: numOr(r.size, 0.05, 1) ?? 0.3,
      }
    }
    case 'sound': {
      const sound = oneOf(SOUND_EFFECT_IDS, r.sound)
      const atMs = timeMs(r.atMs)
      return sound && atMs !== undefined ? { kind: 'sound', sound, atMs } : null
    }
    case 'zoomLevel': {
      const scale = numOr(r.scale, 1.1, 5)
      return scale !== undefined ? { kind: 'zoomLevel', scale } : null
    }
    case 'zoomAt': {
      const atMs = timeMs(r.atMs)
      if (atMs === undefined) return null
      return {
        kind: 'zoomAt',
        atMs,
        ms: durMs(r.ms, 3000, 1500, 600_000),
        scale: numOr(r.scale, 1.1, 5) ?? 2,
      }
    }
    case 'motion': {
      const cmd = compact({
        kind: 'motion' as const,
        cameraSpeed: numOr(r.cameraSpeed, 0, 1),
        zoomMs: isNum(r.zoomMs) ? Math.round(clamp(r.zoomMs, 250, 1500)) : undefined,
      })
      return Object.keys(cmd).length > 1 ? cmd : null
    }
    case 'frame': {
      const cmd = compact({
        kind: 'frame' as const,
        padding: numOr(r.padding, 0, 0.45),
        radius: numOr(r.radius, 0, 0.2),
        shadow: numOr(r.shadow, 0, 1),
        fill: boolOr(r.fill),
      })
      return Object.keys(cmd).length > 1 ? cmd : null
    }
    case 'background': {
      const color = hex(r.color)
      return color ? { kind: 'background', color, color2: hex(r.color2) ?? '' } : null
    }
    case 'cursor': {
      const cmd = compact({
        kind: 'cursor' as const,
        visible: boolOr(r.visible),
        size: numOr(r.size, 0.5, 4),
        clickEffect: boolOr(r.clickEffect),
        hideIdle: boolOr(r.hideIdle),
        showKeys: boolOr(r.showKeys),
      })
      return Object.keys(cmd).length > 1 ? cmd : null
    }
    case 'camera': {
      const cmd = compact({
        kind: 'camera' as const,
        visible: boolOr(r.visible),
        shape: oneOf(CAMERA_SHAPES, r.shape),
        size: numOr(r.size, 0.05, 0.6),
        position: oneOf(CORNERS, r.position),
        layout: oneOf(CAMERA_LAYOUTS, r.layout),
        beauty: boolOr(r.beauty),
        background: oneOf(CAMERA_BG_MODES, r.background),
      })
      return Object.keys(cmd).length > 1 ? cmd : null
    }
    case 'text': {
      if (typeof r.text !== 'string' || !r.text.trim()) return null
      return {
        kind: 'text',
        text: r.text.trim().slice(0, 200),
        atMs: timeMs(r.atMs) ?? 0,
        ms: durMs(r.ms, 3000),
        template: oneOf(TEXT_TEMPLATE_IDS, r.template) ?? 'title',
        position: oneOf(OVERLAY_POSITIONS, r.position) ?? 'top',
      }
    }
    case 'sticker': {
      if (typeof r.emoji !== 'string' || !r.emoji.trim()) return null
      return {
        kind: 'sticker',
        emoji: r.emoji.trim().slice(0, 16),
        atMs: timeMs(r.atMs) ?? 0,
        ms: durMs(r.ms, 3000),
        position: oneOf(OVERLAY_POSITIONS, r.position) ?? 'center',
      }
    }
    case 'shape': {
      const shape = oneOf(SHAPES, r.shape)
      if (!shape) return null
      return {
        kind: 'shape',
        shape,
        atMs: timeMs(r.atMs) ?? 0,
        ms: durMs(r.ms, 3000),
        x: numOr(r.x, 0, 1) ?? 0.5,
        y: numOr(r.y, 0, 1) ?? 0.5,
        color: hex(r.color) ?? '#ef4444',
      }
    }
    case 'adjust': {
      const setting = oneOf(ADJUST_KEYS, r.setting)
      if (!setting || !isNum(r.value)) return null
      const lo = POSITIVE_ADJUST.includes(setting) ? 0 : -1
      return { kind: 'adjust', setting, value: Number(clamp(r.value, lo, 1).toFixed(2)) }
    }
    case 'captionsLayout': {
      const cmd = compact({
        kind: 'captionsLayout' as const,
        position: oneOf(['top', 'bottom'] as const, r.position),
        size: numOr(r.size, 0.5, 2.5),
      })
      return Object.keys(cmd).length > 1 ? cmd : null
    }
    case 'translate': {
      const language = typeof r.language === 'string' ? r.language.trim().toLowerCase() : ''
      if (!LANGUAGE_CODE.test(language)) return null
      return { kind: 'translate', language: language.slice(0, 8), bilingual: r.bilingual === true }
    }
    case 'marker': {
      const atMs = timeMs(r.atMs)
      if (atMs === undefined) return null
      return {
        kind: 'marker',
        atMs,
        label: typeof r.label === 'string' ? r.label.trim().slice(0, 80) : '',
      }
    }
    case 'track': {
      const row = oneOf(TIMELINE_ROWS, r.row)
      if (!row) return null
      const cmd = compact({
        kind: 'track' as const,
        row,
        hidden: boolOr(r.hidden),
        muted: boolOr(r.muted),
        locked: boolOr(r.locked),
      })
      return Object.keys(cmd).length > 2 ? cmd : null
    }
    case 'clear': {
      const target = oneOf(CLEAR_TARGETS, r.target)
      return target ? { kind: 'clear', target } : null
    }
    case 'shorts': {
      const mode = oneOf(SHORTS_MODES, r.mode) ?? 'fixed'
      return {
        kind: 'shorts',
        mode,
        seconds: isNum(r.seconds) && r.seconds > 0 ? Math.round(clamp(r.seconds, 5, 600)) : 60,
        vertical: r.vertical !== false,
        count: isNum(r.count) && r.count > 0 ? Math.round(clamp(r.count, 1, 10)) : 3,
      }
    }
    case 'findMusic': {
      const mood =
        typeof r.mood === 'string'
          ? r.mood
              .trim()
              .replace(/[^\p{L}\p{N}\s-]/gu, '')
              .replace(/\s+/g, ' ')
              .slice(0, 40)
          : ''
      return {
        kind: 'findMusic',
        mood,
        tempo: oneOf(MUSIC_TEMPOS, r.tempo) ?? 'medium',
        volume: isNum(r.volume) ? clamp(r.volume, 0.05, 1) : 0.25,
      }
    }
    case 'broll': {
      const query = typeof r.query === 'string' ? r.query.trim().slice(0, 60) : ''
      const atMs = timeMs(r.atMs)
      if (!query || atMs === undefined) return null
      return { kind: 'broll', query, atMs, ms: durMs(r.ms, 4000, 1000, 30_000) }
    }
    case 'recipe': {
      const style = oneOf(RECIPE_STYLES, r.style)
      return style ? { kind: 'recipe', style } : null
    }
    case 'effectAt': {
      const effect = oneOf(EFFECT_KINDS, r.effect)
      const atMs = timeMs(r.atMs)
      if (!effect || atMs === undefined) return null
      return {
        kind: 'effectAt',
        effect,
        atMs,
        ms: durMs(r.ms, 1500, 200, 60_000),
        intensity: numOr(r.intensity, 0.1, 1) ?? 0.7,
      }
    }
    case 'speedRange': {
      const fromMs = timeMs(r.fromMs)
      const toMs = timeMs(r.toMs)
      if (fromMs === undefined || toMs === undefined || toMs <= fromMs) return null
      if (!isNum(r.factor) || r.factor <= 0) return null
      return {
        kind: 'speedRange',
        fromMs,
        toMs,
        factor: clamp(Number(r.factor.toFixed(2)), 0.25, 16),
      }
    }
    case 'speedCurve': {
      const preset = oneOf(SPEED_CURVE_PRESETS, r.preset)
      return preset ? { kind: 'speedCurve', preset, atMs: timeMs(r.atMs) ?? 0 } : null
    }
    case 'transitionAt': {
      const transition = oneOf(TRANSITION_KINDS, r.transition)
      const atMs = timeMs(r.atMs)
      if (!transition || atMs === undefined) return null
      return { kind: 'transitionAt', atMs, transition, ms: durMs(r.ms, 600, 100, 3000) }
    }
    case 'captionsLook': {
      const cmd = compact({
        kind: 'captionsLook' as const,
        font: oneOf(FONT_IDS, r.font),
        color: hex(r.color),
        highlightColor: hex(r.highlightColor),
        uppercase: boolOr(r.uppercase),
        maxWords: isNum(r.maxWords) ? Math.round(clamp(r.maxWords, 0, 12)) : undefined,
        style: oneOf(['highlight', 'classic'] as const, r.style),
      })
      return Object.keys(cmd).length > 1 ? cmd : null
    }
    case 'outro': {
      if (typeof r.text !== 'string' || !r.text.trim()) return null
      return {
        kind: 'outro',
        text: r.text.trim().slice(0, 120),
        ms: durMs(r.ms, 4000, 1000, 30_000),
        template: oneOf(TEXT_TEMPLATE_IDS, r.template) ?? 'title',
      }
    }
    default:
      return null
  }
}

/** Kiểm tra dữ liệu lệnh (từ Claude hoặc từ file) và bỏ lệnh sai; lệnh trùng chỉ giữ một. */
export function normalizeAssistantCommands(input: unknown): AssistantCommand[] {
  if (!Array.isArray(input)) return []
  const out: AssistantCommand[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const cmd = parseCommand(raw as Record<string, unknown>)
    if (!cmd) continue
    const key = assistantCommandKey(cmd)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cmd)
  }
  return out
}

const FILTER_WORDS: [RegExp, FilterPreset][] = [
  [/điện ảnh|cinematic|cinema/i, 'cinematic'],
  [/cổ điển|vintage|retro/i, 'vintage'],
  [/\blạnh\b|\bcold\b|\bcool\b/i, 'cold'],
  [/\bấm\b|\bwarm\b/i, 'warm'],
  [/đen trắng|trắng đen|black and white|\bb&w\b|\bbw\b|grayscale/i, 'bw'],
  [/phai màu|\bfade(d)?\b/i, 'fade'],
  [/rực rỡ|\bvivid\b|saturated/i, 'vivid'],
  [/\bnoir\b/i, 'noir'],
  [/\bpastel\b/i, 'pastel'],
  [/xanh cam|teal.?orange|teal and orange/i, 'tealOrange'],
  [/hoàng hôn|\bsunset\b/i, 'sunset'],
]

/** "1,5x", "x2", "2 lần", "1.5 times", "gấp đôi" → hệ số tốc độ. */
function parseSpeed(text: string): number | null {
  const m =
    /(?:x\s*(\d+(?:[.,]\d+)?))|(?:(\d+(?:[.,]\d+)?)\s*(?:x|lần|times|×))/i.exec(text) ??
    /(?:tốc độ|speed)\D{0,12}(\d+(?:[.,]\d+)?)/i.exec(text)
  const n = m ? Number((m[1] ?? m[2] ?? '').replace(',', '.')) : NaN
  if (Number.isFinite(n) && n > 0) return n
  if (/gấp đôi|double|twice/i.test(text)) return 2
  if (/chậm lại|slow(er| down)?|slow motion/i.test(text)) return 0.5
  if (/nhanh (lên|hơn)|faster|speed up/i.test(text)) return 1.5
  return null
}

/** "5 giây", "10s", "1 phút" → ms. */
function parseSeconds(part: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(giây|s\b|sec|seconds?|phút|min|minutes?)/i.exec(part)
  if (!m) return null
  const n = Number(m[1]!.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * (/phút|min/i.test(m[2]!) ? 60_000 : 1000))
}

/** Tên ngôn ngữ (tiếng Việt / tiếng Anh) → mã ngôn ngữ cho lệnh dịch phụ đề. */
const LANGUAGE_WORDS: [RegExp, string][] = [
  [/tiếng anh|english/i, 'en'],
  [/tiếng việt|vietnamese/i, 'vi'],
  [/tiếng nhật|japanese/i, 'ja'],
  [/tiếng hàn|korean/i, 'ko'],
  [/tiếng trung|tiếng hoa|chinese/i, 'zh'],
  [/tiếng thái|thai\b/i, 'th'],
  [/tiếng indo|indonesian/i, 'id'],
  [/tiếng pháp|french/i, 'fr'],
  [/tiếng tây ban nha|spanish/i, 'es'],
  [/tiếng đức|german/i, 'de'],
]

/**
 * Hiểu yêu cầu bằng từ khóa (tiếng Việt / tiếng Anh) khi không có key Claude, hoặc để bổ sung
 * khi Claude không trả lệnh nào. Không hiểu thì trả về mảng rỗng.
 */
export function parseAssistantRequest(text: string): AssistantCommand[] {
  const t = text.trim()
  if (!t) return []
  const out: AssistantCommand[] = []
  const push = (c: AssistantCommand) => {
    const key = assistantCommandKey(c)
    if (!out.some((x) => assistantCommandKey(x) === key)) out.push(c)
  }
  if (/tự biên tập|tự chỉnh|auto.?edit|làm gọn|dọn dẹp|clean ?up|tidy/i.test(t)) {
    push({ kind: 'cutSilences' })
    push({ kind: 'removeFillers' })
    push({ kind: 'autoZoom' })
    push({ kind: 'cleanAudio' })
  }
  // Công thức dựng theo phong cách ("dựng kiểu YouTube", "video TikTok hoàn chỉnh", "kiểu vlog");
  // "phụ đề kiểu TikTok" nói về mẫu phụ đề nên bỏ cụm đó trước.
  const forRecipe = t.replace(/(?:phụ đề|caption|subtitle)[^,.;]*/gi, '')
  const recipe = RECIPE_WORDS.find(([re]) => re.test(forRecipe))?.[1]
  if (recipe) push({ kind: 'recipe', style: recipe })
  if (/khoảng lặng|im lặng|khoảng trống|silence|silent|pause|dead air/i.test(t))
    push({ kind: 'cutSilences' })
  if (/từ thừa|từ đệm|nói lặp|ừm|filler|stutter|repeat/i.test(t)) push({ kind: 'removeFillers' })

  // Xóa sạch một loại mục ("bỏ nhạc", "xóa hết zoom", "tắt phụ đề", "bỏ bộ lọc").
  const CLEAR_WORDS: [RegExp, ClearTarget][] = [
    [
      /(?:bỏ|xóa|tắt|không|remove|delete|clear|no)\s+(?:hết\s+|all\s+|the\s+)?(?:zoom|phóng to)/i,
      'zooms',
    ],
    [
      /(?:bỏ|xóa|tắt|remove|delete|clear|no|mute)\s+(?:hết\s+|all\s+|the\s+)?(?:nhạc|music)/i,
      'music',
    ],
    [
      /(?:bỏ|xóa|tắt|remove|delete|clear|no)\s+(?:hết\s+|all\s+|the\s+)?(?:hiệu ứng|effects?)/i,
      'effects',
    ],
    [
      /(?:bỏ|xóa|tắt|remove|delete|clear|no)\s+(?:hết\s+|all\s+|the\s+)?(?:phụ đề|captions?|subtitles?)/i,
      'captions',
    ],
    [
      /(?:bỏ|xóa|tắt|remove|delete|clear|no)\s+(?:hết\s+|all\s+|the\s+)?(?:bộ lọc|filter)/i,
      'filter',
    ],
    [
      /(?:bỏ|xóa|tắt|remove|delete|clear|no)\s+(?:hết\s+|all\s+|the\s+)?(?:chuyển cảnh|transitions?)/i,
      'transitions',
    ],
    [
      /(?:bỏ|xóa|remove|delete|clear)\s+(?:hết\s+|all\s+|the\s+)?(?:chữ|sticker|nhãn dán|lớp|overlays?|text)/i,
      'overlays',
    ],
  ]
  const cleared = new Set<ClearTarget>()
  for (const [re, target] of CLEAR_WORDS)
    if (re.test(t)) {
      cleared.add(target)
      push({ kind: 'clear', target })
    }

  // Mức zoom ("zoom 2.5x", "mức zoom 3 lần"): tách khỏi câu trước khi đoán tốc độ.
  const zoomLevel =
    /(?:mức\s+)?(?:zoom|phóng to)\D{0,10}(\d+(?:[.,]\d+)?)\s*(?:x|lần|×|times)?/i.exec(t)
  let forSpeed = t
  if (zoomLevel) {
    const scale = Number(zoomLevel[1]!.replace(',', '.'))
    if (Number.isFinite(scale) && scale >= 1.1 && scale <= 5) {
      push({ kind: 'zoomLevel', scale })
      forSpeed = t.replace(zoomLevel[0], ' ')
    }
  }
  if (
    /zoom|phóng to theo chuột|phóng to chỗ bấm/i.test(t) &&
    !cleared.has('zooms') &&
    !out.some((c) => c.kind === 'zoomLevel')
  )
    push({ kind: 'autoZoom' })
  if (/phụ đề|caption|subtitle/i.test(t) && !cleared.has('captions')) push({ kind: 'captions' })
  if (/tạp âm|lọc ồn|tiếng ồn|giọng rõ|chuẩn hóa|noise|audio|voice|loudness/i.test(t))
    push({ kind: 'cleanAudio' })

  const title = /(?:tiêu đề|title)\s*(?:là|:|=|["“'])?\s*["“']?([^"”'\n,;.]{2,80})/i.exec(t)
  if (title) push({ kind: 'title', text: title[1]!.trim() })

  for (const [re, preset] of FILTER_WORDS)
    if (re.test(t) && /bộ lọc|filter|màu|tông|look|style|kiểu/i.test(t)) {
      push({ kind: 'filter', preset, intensity: 1 })
      break
    }

  if (/tốc độ|speed|nhanh|chậm|fast|slow|\d\s*x\b|x\s*\d|gấp đôi|lần/i.test(forSpeed)) {
    const factor = parseSpeed(forSpeed)
    if (factor) push({ kind: 'speed', factor })
  }

  // "phụ đề kiểu TikTok" nói về mẫu phụ đề, không phải khung dọc: bỏ cụm đó trước khi đoán khung.
  // "lật ngang / lật dọc" là lật hình, không phải khung ngang / dọc.
  const forAspect = t
    .replace(/(?:phụ đề|caption|subtitle)[^,.;]*/gi, '')
    .replace(/lật\s+(?:ngang|dọc)/gi, '')
  if (/9\s*:\s*16|dọc|vertical|tiktok|shorts?\b|reels?\b|portrait/i.test(forAspect))
    push({ kind: 'aspect', aspect: '9:16' })
  else if (/1\s*:\s*1|vuông|square/i.test(forAspect)) push({ kind: 'aspect', aspect: '1:1' })
  else if (/16\s*:\s*9|ngang|landscape|youtube/i.test(forAspect))
    push({ kind: 'aspect', aspect: '16:9' })
  else if (/4\s*:\s*3/.test(forAspect)) push({ kind: 'aspect', aspect: '4:3' })

  const start =
    /(?:cắt|bỏ|xóa|trim|cut|remove|skip)\s+(.{0,24}?)(?:đầu|first|beginning|intro|start)/i.exec(t)
  const startMs = start ? parseSeconds(start[1]!) : null
  if (startMs) push({ kind: 'trimStart', ms: startMs })
  const end = /(?:cắt|bỏ|xóa|trim|cut|remove)\s+(.{0,24}?)(?:cuối|last|end(ing)?|outro)/i.exec(t)
  const endMs = end ? parseSeconds(end[1]!) : null
  if (endMs) push({ kind: 'trimEnd', ms: endMs })

  if (!cleared.has('effects')) {
    const words = /hiệu ứng|effect/i.test(t)
      ? [...EFFECT_WORDS, ...COLOR_EFFECT_WORDS]
      : EFFECT_WORDS
    for (const [re, effect] of words)
      if (re.test(t)) {
        push({ kind: 'effect', effect })
        break
      }
  }
  if (/chuyển cảnh|transition/i.test(t) && !cleared.has('transitions')) {
    const transition = TRANSITION_WORDS.find(([re]) => re.test(t))?.[1] ?? 'fadeBlack'
    push({ kind: 'transitions', transition })
  }
  // AI tự tìm nhạc nền miễn phí ("tự tìm nhạc nền vui", "find upbeat music").
  const findMusicMatch =
    /(?:tự\s+)?(?:tìm|kiếm|chọn|find|search(?: for)?|pick)\s+(?:một\s+|a\s+|some\s+)?(?:bài\s+|bản\s+)?((?:[\p{L}\d-]+\s+){0,3}?)(?:nhạc|music)/iu.exec(
      t,
    )
  const findMusic = findMusicMatch !== null && !cleared.has('music')
  if (findMusic) {
    // Tâm trạng: sau "nhạc" ("nhạc nền vui") hoặc trước "music" ("find calm music").
    const after =
      /(?:nhạc|music)\s+(?:nền\s+)?(?:kiểu\s+|phong cách\s+|style\s+)?([\p{L}\d][\p{L}\d\s-]{1,24}?)(?=[,.;]|\s+(?:và|rồi|then|and|cho|for)(?=\s|$)|$)/iu.exec(
        t,
      )?.[1] ?? ''
    const mood = after.trim() || (findMusicMatch?.[1] ?? '').trim()
    const quiet = /nhỏ|nhẹ|quiet|soft|low/i.test(t)
    push({
      kind: 'findMusic',
      mood: mood
        .split(/\s+/)
        .filter(
          (w) =>
            !/^(nền|nhỏ|nhẹ|to|lớn|quiet|soft|low|loud|background|nhanh|chậm|fast|slow)$/iu.test(w),
        )
        .join(' ')
        .trim(),
      tempo: /nhanh|sôi động|fast|upbeat|energetic/i.test(t)
        ? 'fast'
        : /chậm|nhẹ nhàng|slow|calm|chill/i.test(t)
          ? 'slow'
          : 'medium',
      volume: quiet ? 0.15 : 0.25,
    })
  }
  if (/nhạc|music|soundtrack/i.test(t) && !cleared.has('music') && !findMusic) {
    const query =
      /(?:nhạc nền|nhạc|music)\s+(?:kiểu\s+|nền\s+)?([\p{L}\d][\p{L}\d\s-]{1,24}?)(?=[,.;]|\s+(?:và|rồi|và|then|and)\b|$)/iu.exec(
        t,
      )?.[1] ?? ''
    const quiet = /nhỏ|nhẹ|quiet|soft|low/i.test(t)
    // Bỏ từ chỉ âm lượng khỏi từ khóa tìm bài ("lofi nhỏ" → "lofi").
    const cleaned = query
      .split(/\s+/)
      .filter((w) => !/^(nhỏ|nhẹ|to|lớn|quiet|soft|low|loud)$/iu.test(w))
      .join(' ')
      .trim()
    push({ kind: 'music', query: cleaned, volume: quiet ? 0.25 : 0.4 })
  }
  const template = CAPTION_WORDS.find(([re]) => re.test(t))?.[1]
  if (template) {
    push({ kind: 'captions' })
    push({ kind: 'captionsStyle', template })
  }
  // Phụ đề ở trên / dưới.
  if (
    /(?:phụ đề|captions?|subtitles?)\s+(?:ở\s+|nằm\s+|lên\s+|at the\s+|on\s+)?(?:trên|phía trên|top)/i.test(
      t,
    )
  )
    push({ kind: 'captionsLayout', position: 'top' })
  else if (
    /(?:phụ đề|captions?|subtitles?)\s+(?:ở\s+|nằm\s+|xuống\s+|at the\s+|on\s+)?(?:dưới|phía dưới|bottom)/i.test(
      t,
    )
  )
    push({ kind: 'captionsLayout', position: 'bottom' })

  // Lồng tiếng AI ("lồng tiếng tiếng Anh", "thuyết minh sang tiếng Nhật, giữ giọng gốc", "dub to English").
  const dub = /lồng tiếng|thuyết minh|\bdub(?:bing|bed)?\b|voice.?over (?:in|sang|to)/i.test(t)
  if (dub) {
    const language = LANGUAGE_WORDS.find(([re]) => re.test(t))?.[1] ?? 'en'
    push({
      kind: 'dub',
      language,
      keepOriginal: /giữ (?:tiếng|giọng|lời) gốc|keep (?:the )?original/i.test(t),
    })
  }
  // Dịch phụ đề ("dịch phụ đề sang tiếng Anh", "song ngữ Anh"); lồng tiếng đã bao gồm việc dịch.
  if (!dub && /dịch|translate|song ngữ|bilingual/i.test(t)) {
    const language = LANGUAGE_WORDS.find(([re]) => re.test(t))?.[1]
    if (language) push({ kind: 'translate', language, bilingual: /song ngữ|bilingual/i.test(t) })
  }
  // Emoji và từ khóa cho phụ đề (kiểu app Captions).
  if (/emoji|biểu tượng cảm xúc/i.test(t) && !/(?:bỏ|xóa|tắt|remove|delete|no)\s+emoji/i.test(t))
    push({ kind: 'captionsEmoji' })
  if (
    /(?:tô|đánh dấu|làm nổi|nhấn|highlight|mark|emphasi[sz]e|color)\D{0,20}(?:từ khóa|từ quan trọng|keywords?)|(?:từ khóa|keywords?)\D{0,12}(?:nổi bật|màu|tô|highlight)/i.test(
      t,
    )
  )
    push({ kind: 'captionsKeywords' })

  // Tắt tiếng micro / âm thanh máy ("tắt tiếng mic", "mute system audio").
  if (/(?:tắt tiếng|tắt|mute)\s+(?:tiếng\s+)?(?:mic|micro|giọng|voice)/i.test(t))
    push({ kind: 'volume', target: 'mic', level: 0 })
  if (/(?:tắt tiếng|tắt|mute)\s+(?:tiếng\s+|âm thanh\s+)?(?:máy|hệ thống|system)/i.test(t))
    push({ kind: 'volume', target: 'system', level: 0 })

  // Lật / xoay video.
  if (/lật ngang|flip horizontal|mirror/i.test(t)) push({ kind: 'flip', axis: 'horizontal' })
  if (/lật dọc|flip vertical|upside down/i.test(t)) push({ kind: 'flip', axis: 'vertical' })
  const rotate = /(?:xoay|rotate)\D{0,8}(90|180|270)/i.exec(t)
  if (rotate) push({ kind: 'rotate', degrees: Number(rotate[1]) as Rotation })

  // Webcam và con trỏ.
  if (/(?:ẩn|tắt|bỏ|hide|remove)\s+(?:bong bóng\s+)?(?:webcam|camera|cam\b)/i.test(t))
    push({ kind: 'camera', visible: false })
  else if (/(?:hiện|bật|show)\s+(?:bong bóng\s+)?(?:webcam|camera|cam\b)/i.test(t))
    push({ kind: 'camera', visible: true })
  if (/(?:ẩn|tắt|hide)\s+(?:con\s+)?(?:trỏ|chuột|cursor|mouse)/i.test(t))
    push({ kind: 'cursor', visible: false })
  else if (/(?:hiện|bật|show)\s+(?:con\s+)?(?:trỏ|chuột|cursor|mouse)/i.test(t))
    push({ kind: 'cursor', visible: true })
  // Phím tắt đã bấm.
  if (/(?:ẩn|tắt|hide)\s+(?:các\s+)?(?:phím tắt|phím bấm|shortcuts?|keystrokes?)/i.test(t))
    push({ kind: 'cursor', showKeys: false })
  else if (/(?:hiện|bật|show)\s+(?:các\s+)?(?:phím tắt|phím bấm|shortcuts?|keystrokes?)/i.test(t))
    push({ kind: 'cursor', showKeys: true })
  // Tự giảm nhạc khi có lời.
  if (
    /(?:giảm|nhỏ|hạ|ngắt)\s+(?:nhạc|music)\s+(?:nền\s+)?(?:khi|lúc|when|while)\s+(?:có\s+)?(?:lời|nói|thoại|speak|talk)|\bduck(?:ing)?\b/i.test(
      t,
    )
  )
    push({ kind: 'duck', enabled: true })
  // Che vùng riêng tư (không có AI thì che giữa khung, cả video).
  if (
    /(?:làm mờ|che|khảm)\s+(?:vùng|chỗ|phần|khu vực)|\b(?:mosaic|pixelate)\b|blur (?:a |the )?(?:region|area|part)/i.test(
      t,
    )
  )
    push({
      kind: 'blur',
      mode: /khảm|mosaic|pixelate/i.test(t) ? 'pixelate' : 'blur',
      atMs: 0,
      ms: 600_000,
      x: 0.5,
      y: 0.5,
      size: 0.3,
    })

  // Chương (mốc đánh dấu từ lời thoại).
  if (/(?:thêm|tạo|đánh dấu|add|create|mark)\s+(?:các\s+|mốc\s+)?(?:chương|chapters?)/i.test(t))
    push({ kind: 'chapters' })

  // Chia thành video ngắn.
  // "chia thành các video ngắn", "chia video này ra làm 2-3 video short", "split into shorts".
  const shorts =
    /(?:chia|tách|cắt)\b[^,.;]{0,30}?(?:video ngắn|clip ngắn|đoạn ngắn|shorts?\b|reels?\b)|split (?:it |the video )?into (?:shorts|clips|parts)/i.test(
      t,
    )
  if (shorts) {
    const every = /(?:mỗi|every)\s+(\d+)\s*(?:giây|s\b|sec|seconds?)/i.exec(t)
    // "chia làm 2-3 video short", "3 clip ngắn hay nhất": AI chọn các đoạn hay nhất.
    const count = /(\d+)\s*(?:-\s*(\d+)\s*)?(?:video|clip|đoạn|shorts?|reels?|parts?)/i.exec(t)
    const highlights =
      !every &&
      (count !== null || /hay nhất|nổi bật|highlight|đáng xem|best (?:parts|moments)/i.test(t))
    push({
      kind: 'shorts',
      mode: /chương|chapter/i.test(t) ? 'chapters' : highlights ? 'highlights' : 'fixed',
      seconds: every ? Number(every[1]) : 60,
      vertical: /dọc|9\s*:\s*16|tiktok|shorts?\b|reels?\b|vertical/i.test(t),
      count: count ? Number(count[2] ?? count[1]) : 3,
    })
  }

  // Thẻ kết / lời kêu gọi ("thêm thẻ kết Đăng ký kênh", "outro: Subscribe").
  const outro =
    /(?:thẻ kết|màn kết|lời kêu gọi|kết video|outro|end ?card|call to action|cta)\s*(?:là|:|=|["“'])?\s*["“']?([^"”'\n,;.]{2,100})/i.exec(
      t,
    )
  if (outro) push({ kind: 'outro', text: outro[1]!.trim(), ms: 4000, template: 'title' })
  // Phụ đề in hoa / cả dòng (một lệnh captionsLook gộp cả hai).
  const look = compact({
    kind: 'captionsLook' as const,
    uppercase:
      /(?:phụ đề|captions?|subtitles?)[^,.;]{0,24}(?:in hoa|viết hoa|uppercase|all caps)/i.test(t)
        ? true
        : undefined,
    style: /(?:phụ đề|captions?|subtitles?)[^,.;]{0,24}(?:cả dòng|classic|không tô từ)/i.test(t)
      ? ('classic' as const)
      : undefined,
  })
  if (Object.keys(look).length > 1) push(look)

  if (/xuất|export|render|lưu video|save video/i.test(t)) {
    const res = /(2160|4k|1440|1080|720)/i.exec(t)?.[1]?.toLowerCase()
    push({
      kind: 'export',
      resolution: res === '4k' ? 2160 : res ? (Number(res) as 720 | 1080 | 1440 | 2160) : 1080,
      format: /\bgif\b/i.test(t) ? 'gif' : 'mp4',
    })
  }
  return normalizeAssistantCommands(out)
}

const RECIPE_WORDS: [RegExp, RecipeStyle][] = [
  [
    /(?:kiểu|phong cách|style|như|theo|chuẩn|dựng|edit|làm)\s+(?:một\s+|video\s+|clip\s+)?(?:tiktok|shorts?|reels?)|(?:tiktok|shorts?|reels?)\s+(?:style|chuyên nghiệp|pro\b|viral|hoàn chỉnh|complete|full)/i,
    'shorts',
  ],
  [
    /(?:kiểu|phong cách|style|như|theo|chuẩn|dựng|edit|làm)\s+(?:một\s+|video\s+|clip\s+)?youtube|youtube\s+(?:style|tutorial|chuyên nghiệp|pro\b|hoàn chỉnh|complete|full)|hướng dẫn chuyên nghiệp|professional tutorial/i,
    'youtube',
  ],
  [/\bvlogs?\b|talking.?head|nói trước (?:camera|máy quay)/i, 'vlog'],
  [/tối giản|sạch sẽ|gọn gàng|minimal(?:ist)?\b|clean (?:style|look|cut|edit)/i, 'clean'],
]
const EFFECT_WORDS: [RegExp, EffectKind][] = [
  [/rung lắc|rung|shake/i, 'shake'],
  [/glitch|nhiễu số/i, 'glitch'],
  [/\bvhs\b|băng cũ/i, 'vhs'],
  [/tách màu|rgb|sắc sai|chromatic/i, 'rgbSplit'],
  [/khảm ô|pixel/i, 'pixelate'],
  [/hạt phim|film grain|\bgrain\b|nhiễu hạt/i, 'grain'],
  [/pháo giấy|confetti|ăn mừng|celebrat/i, 'confetti'],
  [/lấp lánh|sparkle|kim tuyến/i, 'sparkle'],
  [/tuyết|snow/i, 'snow'],
  [/nhấp nháy|strobe/i, 'strobe'],
  [/lóe sáng|flash/i, 'flash'],
  [/phóng nhấn|punch/i, 'zoomPunch'],
  [/nhảy nhún|bounce/i, 'bounce'],
  [/gương|mirror/i, 'mirror'],
  [/nhún theo nhịp|pulse|beat/i, 'pulse'],
  [/lọt sáng|light ?leak/i, 'lightLeak'],
  [/tỏa sáng|\bglow\b|bloom/i, 'glow'],
  [/đèn rọi|spotlight/i, 'spotlight'],
  [/dải điện ảnh|letterbox|cinematic bars|dải đen/i, 'letterbox'],
  [/viền tối|vignette/i, 'vignette'],
]
/** Hiệu ứng màu trùng tên với bộ lọc ("bộ lọc cổ điển"): chỉ nhận khi câu có nói "hiệu ứng". */
const COLOR_EFFECT_WORDS: [RegExp, EffectKind][] = [
  [/đảo màu|invert/i, 'invert'],
  [/hai tông|duotone/i, 'duotone'],
  [/tông ấm|màu ấm|warm/i, 'warm'],
  [/tông lạnh|màu lạnh|\bcool\b|teal/i, 'cool'],
  [/đen trắng|black.?(?:and|&)?.?white|\bb&w\b|\bbw\b/i, 'bw'],
  [/cổ điển|vintage|sepia|retro/i, 'vintage'],
]
const TRANSITION_WORDS: [RegExp, TransitionKind][] = [
  [/lọt sáng|light ?leak/i, 'lightLeak'],
  [/trắng|white/i, 'fadeWhite'],
  [/lóe|flash/i, 'flash'],
  [/thu nhỏ|zoom ?out/i, 'zoomOut'],
  [/phóng|zoom/i, 'zoom'],
  [/lia máy|whip/i, 'whip'],
  [/xoay|spin|rotate/i, 'spin'],
  [/rung|shake/i, 'shake'],
  [/khảm ô|pixel/i, 'pixelate'],
  [/nhòe|mờ dần|blur/i, 'blur'],
  [/lướt (?:sang )?phải|slide ?right/i, 'slideRight'],
  [/lướt lên|slide ?up/i, 'slideUp'],
  [/lướt xuống|slide ?down/i, 'slideDown'],
  [/lướt|slide|trượt/i, 'slide'],
  [/kéo rèm|\bwipe\b/i, 'wipe'],
  [/vòng tròn|iris|circle/i, 'iris'],
  [/rèm sáo|blinds/i, 'blinds'],
  [/ép dẹt|squeeze/i, 'squeeze'],
  [/lật|flip/i, 'flip'],
  [/glitch/i, 'glitch'],
  [/đen|black|mờ/i, 'fadeBlack'],
]
const CAPTION_WORDS: [RegExp, CaptionTemplate][] = [
  [/phụ đề.{0,20}(tiktok|kiểu tiktok)|tiktok.{0,12}caption/i, 'tiktok'],
  [/karaoke/i, 'karaoke'],
  [/neon/i, 'neon'],
  [/phụ đề.{0,20}(nảy|bounce)/i, 'bounceWord'],
  [/phụ đề.{0,20}(bật|pop)/i, 'popWord'],
  [/phụ đề.{0,20}(gạch chân|underline)/i, 'underline'],
  [/phụ đề.{0,20}(viền|outline)/i, 'outline'],
  [/phụ đề.{0,20}(hộp|khối|box)/i, 'box'],
]
