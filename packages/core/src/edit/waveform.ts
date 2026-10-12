/** Dạng sóng âm thanh của cả bản quay, theo thời gian nguồn (đã trộn micro + âm thanh máy). */
export interface Waveform {
  /** Mỗi giá trị ứng với một khoảng `bucketMs` mili-giây. */
  bucketMs: number
  /** Biên độ lớn nhất trong từng khoảng, 0..255 (gọn khi lưu thành JSON). */
  peaks: number[]
}

export const WAVEFORM_FILE = 'waveform.json'
export const WAVEFORM_BUCKET_MS = 20

/** Tính biên độ đỉnh của từng khoảng thời gian từ mẫu PCM 16-bit mono. */
export function computePeaks(
  samples: Int16Array,
  sampleRate: number,
  bucketMs = WAVEFORM_BUCKET_MS,
): Waveform {
  const perBucket = Math.max(1, Math.round((sampleRate * bucketMs) / 1000))
  const count = Math.ceil(samples.length / perBucket)
  const peaks = new Array<number>(count)
  for (let b = 0; b < count; b++) {
    let max = 0
    const end = Math.min(samples.length, (b + 1) * perBucket)
    for (let i = b * perBucket; i < end; i++) {
      const v = Math.abs(samples[i]!)
      if (v > max) max = v
    }
    peaks[b] = Math.min(255, Math.round((max / 32768) * 255))
  }
  return { bucketMs, peaks }
}

/** Dưới mức này (dBFS) coi như im lặng: tạp âm nền của micro không thành sóng. */
const WAVE_FLOOR_DB = -45
/** Chỉ vẽ 40 dB dưới tiếng to nhất (giống tai nghe: nhỏ hơn nữa coi như lặng). */
const WAVE_RANGE_DB = 40
/** Cong nhẹ để chỗ ngắt giữa các câu vẫn thấp hẳn so với giọng nói. */
const WAVE_CURVE = 1.6
/** Đỉnh nhỏ nhất dùng làm mốc "to nhất" (~ -20 dBFS): bản quay gần im lặng không bị phóng to. */
const MIN_LOUDEST = 24

const dbfs = (peak: number) => 20 * Math.log10(Math.max(peak, 1e-3) / 255)

/**
 * Đổi một đỉnh (0..255) thành độ cao cột 0..1 theo thang dB, như tai người nghe (kiểu CapCut):
 * tiếng to nhất bản quay = 1, giọng nói nhỏ vẫn thấy rõ, tạp âm nền rất nhỏ = 0.
 */
export function waveLevel(peak: number, loudest: number): number {
  if (peak <= 0) return 0
  const top = dbfs(Math.max(MIN_LOUDEST, loudest))
  const floor = Math.max(WAVE_FLOOR_DB, top - WAVE_RANGE_DB)
  const level = Math.min(1, Math.max(0, (dbfs(peak) - floor) / (top - floor)))
  return level ** WAVE_CURVE
}

/** Đỉnh lớn nhất của cả bản quay (mốc để chia). */
export function loudestPeak(peaks: readonly number[]): number {
  let max = 0
  for (const p of peaks) if (p > max) max = p
  return max
}

/**
 * Lấy `bars` giá trị (0..1) cho đoạn nguồn [startMs, endMs) để vẽ trong một clip.
 * Mỗi cột là đỉnh lớn nhất trong phần của nó, đổi sang thang dB so với đỉnh lớn nhất cả bản quay
 * để giọng nhỏ vẫn thấy rõ mà tiếng to không bị tràn.
 */
export function waveformSlice(
  wave: Waveform,
  startMs: number,
  endMs: number,
  bars: number,
): number[] {
  const n = Math.max(0, Math.floor(bars))
  if (n === 0 || endMs <= startMs || wave.peaks.length === 0) return new Array<number>(n).fill(0)
  const loudest = loudestPeak(wave.peaks)
  const step = (endMs - startMs) / n
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const from = Math.floor((startMs + i * step) / wave.bucketMs)
    const to = Math.max(from + 1, Math.ceil((startMs + (i + 1) * step) / wave.bucketMs))
    let max = 0
    for (let b = Math.max(0, from); b < Math.min(wave.peaks.length, to); b++)
      max = Math.max(max, wave.peaks[b]!)
    out[i] = waveLevel(max, loudest)
  }
  return out
}

/** Đọc lại file waveform.json đã lưu; sai định dạng thì trả null để tính lại. */
export function parseWaveform(value: unknown): Waveform | null {
  if (typeof value !== 'object' || value === null) return null
  const w = value as Record<string, unknown>
  if (typeof w.bucketMs !== 'number' || w.bucketMs <= 0 || !Array.isArray(w.peaks)) return null
  if (!w.peaks.every((p) => typeof p === 'number' && p >= 0 && p <= 255)) return null
  return { bucketMs: w.bucketMs, peaks: w.peaks as number[] }
}
