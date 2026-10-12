/**
 * Tìm nhịp (beat) trong dạng sóng của bài nhạc: các đỉnh âm lượng nổi rõ so với nền xung quanh,
 * cách nhau ít nhất `minGapMs`. Trả về thời điểm (ms tính từ đầu file).
 */
export function detectBeats(peaks: readonly number[], bucketMs: number, minGapMs = 250): number[] {
  if (peaks.length < 3 || bucketMs <= 0) return []
  const window = Math.max(2, Math.round(1000 / bucketMs))
  const loudest = Math.max(...peaks)
  if (loudest <= 0) return []
  const beats: number[] = []
  let last = -Infinity
  for (let i = 1; i < peaks.length - 1; i++) {
    const v = peaks[i]!
    if (v < peaks[i - 1]! || v < peaks[i + 1]!) continue
    // Nền = trung bình trong khoảng ±0.5 giây; đỉnh phải vượt hẳn nền và đủ to.
    let sum = 0
    let n = 0
    for (let k = Math.max(0, i - window); k <= Math.min(peaks.length - 1, i + window); k++) {
      sum += peaks[k]!
      n++
    }
    const background = sum / n
    if (v < background * 1.4 || v < loudest * 0.35) continue
    const t = i * bucketMs
    if (t - last < minGapMs) continue
    beats.push(t)
    last = t
  }
  return beats
}

/**
 * Vị trí các nhịp của một đoạn nhạc trên video xuất (ms), tính cả phần đã cắt đầu và các lần lặp.
 * `beats`: thời điểm nhịp trong file (ms).
 */
export function clipBeats(
  clip: { start: number; offset: number; duration: number; sourceDuration: number; loop: boolean },
  beats: readonly number[],
): number[] {
  const out: number[] = []
  const rounds =
    clip.loop && clip.sourceDuration > 0
      ? Math.ceil((clip.offset + clip.duration) / clip.sourceDuration)
      : 1
  for (let n = 0; n < rounds; n++) {
    for (const b of beats) {
      const local = b + n * clip.sourceDuration - clip.offset
      if (local >= 0 && local < clip.duration) out.push(clip.start + local)
    }
  }
  return out.sort((a, b) => a - b)
}
