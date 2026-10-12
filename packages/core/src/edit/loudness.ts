/**
 * Chuẩn hóa độ to của cả video khi xuất (sau khi đã trộn giọng, âm thanh máy, nhạc, hiệu ứng),
 * theo chuẩn của nền tảng đăng video. YouTube hạ những video to hơn -14 LUFS nên video xuất ở đúng
 * mức này nghe to rõ ngang các video khác mà không bị YouTube giảm âm lượng.
 */
export const LOUDNESS_TARGETS = ['off', 'youtube', 'podcast'] as const
export type LoudnessTarget = (typeof LOUDNESS_TARGETS)[number]

export interface LoudnessSpec {
  /** Độ to tích hợp (LUFS). */
  i: number
  /** Đỉnh thật tối đa (dBTP). */
  tp: number
  /** Dải độ to (LU). */
  lra: number
}

export const LOUDNESS_SPECS: Record<Exclude<LoudnessTarget, 'off'>, LoudnessSpec> = {
  youtube: { i: -14, tp: -1, lra: 11 },
  podcast: { i: -16, tp: -1.5, lra: 11 },
}

/** Kết quả đo lượt 1 của bộ lọc `loudnorm` (FFmpeg in ra dạng JSON). */
export interface LoudnessMeasure {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
  targetOffset: number
}

/** Âm thanh nhỏ hơn mức này coi như im lặng: không kéo lên (chỉ làm to tiếng ồn nền). */
export const SILENT_LUFS = -70

/** Lấy khối JSON cuối cùng mà `loudnorm=print_format=json` in ra trong stderr của FFmpeg. */
export function parseLoudnormJson(stderr: string): LoudnessMeasure | null {
  const end = stderr.lastIndexOf('}')
  const start = end < 0 ? -1 : stderr.lastIndexOf('{', end)
  if (start < 0) return null
  let raw: unknown
  try {
    raw = JSON.parse(stderr.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  // FFmpeg ghi số dạng chuỗi, im lặng hoàn toàn là "-inf".
  const num = (key: string) => {
    const s = v[key]
    if (typeof s === 'number') return s
    if (typeof s !== 'string') return Number.NaN
    return s.trim() === '-inf' ? -Infinity : Number(s)
  }
  const out = {
    inputI: num('input_i'),
    inputTp: num('input_tp'),
    inputLra: num('input_lra'),
    inputThresh: num('input_thresh'),
    targetOffset: num('target_offset'),
  }
  return Object.values(out).some(Number.isNaN) ? null : out
}

const fixed = (n: number) => Number(n.toFixed(2))

/**
 * Bộ lọc FFmpeg cho lượt 2: dùng số đo lượt 1 để chỉnh tuyến tính (giữ nguyên độ động của giọng).
 * Không có số đo thì chuẩn hóa một lượt (động). Âm thanh gần như im lặng thì trả `null` (bỏ qua).
 */
export function loudnormFilter(
  spec: LoudnessSpec,
  measured?: LoudnessMeasure | null,
): string | null {
  const base = `loudnorm=I=${spec.i}:TP=${spec.tp}`
  if (!measured) return `${base}:LRA=${spec.lra}`
  if (!Number.isFinite(measured.inputI) || measured.inputI < SILENT_LUFS) return null
  // Chế độ tuyến tính cần LRA đích ≥ LRA đo được (FFmpeg cho tối đa 50).
  const lra = Math.min(50, Math.max(spec.lra, Math.ceil(measured.inputLra)))
  const tp = Number.isFinite(measured.inputTp) ? measured.inputTp : -99
  const thresh = Number.isFinite(measured.inputThresh) ? measured.inputThresh : -70
  return [
    `${base}:LRA=${lra}`,
    `measured_I=${fixed(measured.inputI)}`,
    `measured_TP=${fixed(tp)}`,
    `measured_LRA=${fixed(measured.inputLra)}`,
    `measured_thresh=${fixed(thresh)}`,
    `offset=${fixed(measured.targetOffset)}`,
    'linear=true',
  ].join(':')
}
