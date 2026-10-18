import { clipPositions, clipDuration, type Clip } from './timeline'

/**
 * Hiệu ứng chuyển tiếp tại chỗ nối giữa hai clip (kiểu CapCut). Chỉ vẽ lại khung hình quanh chỗ
 * nối nên không làm thay đổi độ dài video hay lệch tiếng.
 */
export const TRANSITION_KINDS = [
  // Cơ bản
  'fadeBlack',
  'fadeWhite',
  'flash',
  'lightLeak',
  // Chuyển động
  'zoom',
  'zoomOut',
  'whip',
  'spin',
  'slide',
  'slideRight',
  'slideUp',
  'slideDown',
  'shake',
  // Hình khối
  'wipe',
  'iris',
  'blinds',
  'squeeze',
  'flip',
  // Cách điệu
  'blur',
  'glitch',
  'pixelate',
] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

export const TRANSITION_CATEGORIES = ['basic', 'motion', 'shape', 'stylized'] as const
export type TransitionCategory = (typeof TRANSITION_CATEGORIES)[number]

/** Nhóm của từng chuyển cảnh (bày trong Thư viện, AI chọn theo mục đích). */
export const TRANSITION_CATEGORY: Record<TransitionKind, TransitionCategory> = {
  fadeBlack: 'basic',
  fadeWhite: 'basic',
  flash: 'basic',
  lightLeak: 'basic',
  zoom: 'motion',
  zoomOut: 'motion',
  whip: 'motion',
  spin: 'motion',
  slide: 'motion',
  slideRight: 'motion',
  slideUp: 'motion',
  slideDown: 'motion',
  shake: 'motion',
  wipe: 'shape',
  iris: 'shape',
  blinds: 'shape',
  squeeze: 'shape',
  flip: 'shape',
  blur: 'stylized',
  glitch: 'stylized',
  pixelate: 'stylized',
}

/** Mô tả ngắn (tiếng Anh, cho lời nhắc AI) — khi nào nên dùng chuyển cảnh này. */
export const TRANSITION_INFO: Record<TransitionKind, string> = {
  fadeBlack: 'fade through black; calm section change, time passing (400-800 ms)',
  fadeWhite: 'fade through white; soft, bright, dreamy section change',
  flash: 'quick white flash; energetic beat cut, short-form (200-300 ms)',
  lightLeak: 'warm light leak sweep; vlog, summer, memories',
  zoom: 'zoom-in punch into the cut; TikTok / Shorts default, fast (200-400 ms)',
  zoomOut: 'zoom-out pull back through the cut; reveal the bigger picture',
  whip: 'whip pan with heavy motion blur; fast scene changes, travel vlogs',
  spin: 'spin rotate through the cut; playful, hype',
  slide: 'slide left (new clip comes from the right); next step / forward',
  slideRight: 'slide right (new clip comes from the left); back / previous',
  slideUp: 'slide up; vertical video, scrolling to the next point',
  slideDown: 'slide down; dropping into a detail',
  shake: 'camera shake over the cut; impact, "boom"',
  wipe: 'black curtain wipe left to right; classic, clean',
  iris: 'circle iris close / open; cartoon, focus on one thing',
  blinds: 'horizontal blinds; retro slideshow',
  squeeze: 'vertical squeeze to a line and back; snappy, mechanical',
  flip: 'horizontal card flip; comparing two things, before / after',
  blur: 'blur through the cut; dreamy, soft',
  glitch: 'digital glitch; tech, errors, edgy',
  pixelate: 'pixelate to blocks and back; 8-bit, "loading"',
}

export interface Transition {
  /** Chuyển tiếp nằm giữa clip này và clip ngay sau nó. */
  afterClip: string
  kind: TransitionKind
  /** Tổng thời gian (ms), chia đều hai bên chỗ nối. */
  durationMs: number
}

export const DEFAULT_TRANSITION_MS = 600

export interface ActiveTransition {
  kind: TransitionKind
  /** Tiến trình 0..1 qua cả khoảng chuyển tiếp (0.5 = đúng chỗ nối). */
  progress: number
  /** Độ mạnh 0..1: 0 ở hai đầu, 1 ngay chỗ nối. */
  strength: number
  /** Đang ở nửa sau (đã sang clip mới). */
  after: boolean
}

/** Chỗ nối (thời điểm xuất, ms) sau mỗi clip, trừ clip cuối. */
export function cutPoints(clips: readonly Clip[]): { afterClip: string; at: number }[] {
  return clipPositions(clips)
    .slice(0, -1)
    .map(({ clip, outputStart }) => ({ afterClip: clip.id, at: outputStart + clipDuration(clip) }))
}

/** Chuyển tiếp đang diễn ra tại thời điểm xuất `t` (null nếu không có). */
export function transitionAt(
  clips: readonly Clip[],
  transitions: readonly Transition[],
  t: number,
): ActiveTransition | null {
  if (transitions.length === 0) return null
  for (const cut of cutPoints(clips)) {
    const tr = transitions.find((x) => x.afterClip === cut.afterClip)
    if (!tr) continue
    // Không dài quá clip ngắn hơn ở hai bên.
    const half = tr.durationMs / 2
    if (t < cut.at - half || t >= cut.at + half) continue
    const progress = (t - (cut.at - half)) / tr.durationMs
    return { kind: tr.kind, progress, strength: 1 - Math.abs(progress * 2 - 1), after: t >= cut.at }
  }
  return null
}

/** Giữ lại chuyển tiếp còn hợp lệ sau khi cắt/xóa clip (clip đã mất hoặc là clip cuối thì bỏ). */
export function pruneTransitions(
  clips: readonly Clip[],
  transitions: readonly Transition[],
): Transition[] {
  const cuts = new Set(cutPoints(clips).map((c) => c.afterClip))
  return transitions.filter((t) => cuts.has(t.afterClip))
}

export function parseTransitions(value: unknown): Transition[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v): Transition[] => {
    if (typeof v !== 'object' || v === null) return []
    const t = v as Record<string, unknown>
    if (typeof t.afterClip !== 'string') return []
    if (!TRANSITION_KINDS.includes(t.kind as TransitionKind)) return []
    const d =
      typeof t.durationMs === 'number' && Number.isFinite(t.durationMs)
        ? t.durationMs
        : DEFAULT_TRANSITION_MS
    return [
      {
        afterClip: t.afterClip,
        kind: t.kind as TransitionKind,
        durationMs: Math.min(2000, Math.max(200, d)),
      },
    ]
  })
}
