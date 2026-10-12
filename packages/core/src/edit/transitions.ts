import { clipPositions, clipDuration, type Clip } from './timeline'

/**
 * Hiệu ứng chuyển tiếp tại chỗ nối giữa hai clip (kiểu CapCut). Chỉ vẽ lại khung hình quanh chỗ
 * nối nên không làm thay đổi độ dài video hay lệch tiếng.
 */
export const TRANSITION_KINDS = [
  'fadeBlack',
  'fadeWhite',
  'flash',
  'zoom',
  'blur',
  'slide',
  'glitch',
] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

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
