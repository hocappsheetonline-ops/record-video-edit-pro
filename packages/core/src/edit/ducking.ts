import type { AudioClip } from './audio-clips'
import { outputToSource, type Clip } from './timeline'
import type { Waveform } from './waveform'

/**
 * Tự giảm nhạc nền khi có lời thoại (audio ducking, như CapCut / Descript / Camtasia): tìm các
 * khoảng có tiếng nói trên video xuất, nhạc nền hạ xuống mức `level` trong các khoảng đó và
 * trở lại bình thường khi im lặng. Xem trước và xuất dùng chung `duckGainAt` nên nghe giống nhau.
 */
export interface Ducking {
  enabled: boolean
  /** Âm lượng nhạc khi có lời, hệ số 0..1 (0.3 = còn 30 %). */
  level: number
}

export const DEFAULT_DUCKING: Ducking = { enabled: false, level: 0.3 }

/** Thời gian nhạc hạ xuống / trở lại (ms), mỗi bên của khoảng có lời. */
export const DUCK_RAMP_MS = 300

/** Khoảng có lời thoại trên video xuất (ms). */
export interface DuckRange {
  start: number
  end: number
}

export interface VoiceOptions {
  /** Ngưỡng coi là có tiếng, tỉ lệ so với đỉnh to nhất của bản quay (0..1). */
  threshold?: number
  /** Hai khoảng có lời cách nhau dưới mức này thì gộp làm một (ms) để nhạc không nhấp nhô. */
  holdMs?: number
  /** Bỏ khoảng ngắn hơn (ms): tiếng click, tiếng động nhỏ. */
  minMs?: number
  /** Nhiều khoảng hơn mức này thì gộp thô hơn (biểu thức FFmpeg không quá dài). */
  maxRanges?: number
}

export function parseDucking(value: unknown): Ducking {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_DUCKING }
  const v = value as Record<string, unknown>
  const level =
    typeof v.level === 'number' && Number.isFinite(v.level)
      ? Math.min(1, Math.max(0, v.level))
      : DEFAULT_DUCKING.level
  return { enabled: v.enabled === true, level }
}

/**
 * Các khoảng có lời thoại trên video xuất: tiếng trong bản quay (theo dạng sóng, đã qua cắt /
 * đổi tốc độ của các clip) và các đoạn lồng tiếng / kịch bản AI (`kind: 'voice'`, coi cả đoạn là
 * có lời). Kết quả đã gộp các khoảng gần nhau và sắp xếp theo thời gian.
 */
export function voiceRanges(
  wave: Waveform | null,
  clips: readonly Clip[],
  audioClips: readonly AudioClip[],
  outputDurationMs: number,
  options: VoiceOptions = {},
): DuckRange[] {
  const threshold = options.threshold ?? 0.12
  const holdMs = options.holdMs ?? 700
  const minMs = options.minMs ?? 150
  const raw: DuckRange[] = []
  if (wave && wave.peaks.length > 0 && wave.bucketMs > 0 && outputDurationMs > 0) {
    const loudest = Math.max(24, ...wave.peaks)
    const limit = loudest * threshold
    const step = wave.bucketMs
    let runStart = -1
    for (let t = 0; t < outputDurationMs + step; t += step) {
      const hit = t < outputDurationMs ? outputToSource(clips, t) : null
      const peak = hit ? (wave.peaks[Math.floor(hit.source / wave.bucketMs)] ?? 0) : 0
      // Clip đóng băng khung hình không có tiếng.
      const loud = !!hit && !hit.position.clip.freeze && peak > limit
      if (loud && runStart < 0) runStart = t
      if (!loud && runStart >= 0) {
        raw.push({ start: runStart, end: Math.min(t, outputDurationMs) })
        runStart = -1
      }
    }
  }
  for (const c of audioClips) {
    if (c.kind !== 'voice' || c.volume <= 0) continue
    const end = Math.min(outputDurationMs, c.start + c.duration)
    if (end > c.start) raw.push({ start: c.start, end })
  }
  const maxRanges = options.maxRanges ?? 120
  let gap = holdMs
  let merged = mergeRanges(raw, gap, minMs)
  while (merged.length > maxRanges && gap < 60_000) {
    gap *= 2
    merged = mergeRanges(merged, gap, minMs)
  }
  return merged
}

/** Gộp các khoảng chồng nhau hoặc cách nhau dưới `gapMs`, bỏ khoảng ngắn hơn `minMs`. */
export function mergeRanges(ranges: readonly DuckRange[], gapMs: number, minMs = 0): DuckRange[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const out: DuckRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start - last.end <= gapMs) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out.filter((r) => r.end - r.start >= minMs)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Hệ số nhân âm lượng nhạc tại thời điểm `t` (ms): 1 khi không có lời, `level` giữa khoảng có
 * lời, dốc tuyến tính dài `rampMs` ở hai mép (bắt đầu hạ trước khi lời bắt đầu `rampMs`).
 */
export function duckGainAt(
  ranges: readonly DuckRange[],
  t: number,
  level: number,
  rampMs = DUCK_RAMP_MS,
): number {
  if (ranges.length === 0 || level >= 1) return 1
  let depth = 0
  for (const r of ranges) {
    if (t < r.start - rampMs) break
    if (t > r.end + rampMs) continue
    const w =
      rampMs <= 0
        ? 1
        : clamp01(Math.min((t - (r.start - rampMs)) / rampMs, (r.end + rampMs - t) / rampMs))
    if (w > depth) depth = w
    if (depth >= 1) break
  }
  return 1 - (1 - level) * depth
}

const sec = (n: number) => Number(n.toFixed(3))

/**
 * Biểu thức cho bộ lọc `volume` của FFmpeg (eval=frame) tính đúng công thức của `duckGainAt`,
 * với `t` là giây tính từ đầu mảnh âm thanh (mảnh bắt đầu ở `offsetMs` trên video xuất).
 * Trả về null khi không khoảng nào chạm tới mảnh (không cần lọc).
 */
export function duckVolumeExpr(
  ranges: readonly DuckRange[],
  level: number,
  offsetMs: number,
  durationMs: number,
  rampMs = DUCK_RAMP_MS,
): string | null {
  if (level >= 1) return null
  const r = Math.max(0.001, rampMs / 1000)
  const terms = ranges
    .filter((x) => x.end + rampMs > offsetMs && x.start - rampMs < offsetMs + durationMs)
    .map((x) => {
      const a = sec((x.start - rampMs - offsetMs) / 1000)
      const b = sec((x.end + rampMs - offsetMs) / 1000)
      return `clip(min((t-(${a}))/${sec(r)},(${b}-t)/${sec(r)}),0,1)`
    })
  if (terms.length === 0) return null
  const depth = terms.reduce((acc, term) => (acc ? `max(${acc},${term})` : term), '')
  return `1-${sec(1 - level)}*${depth}`
}
