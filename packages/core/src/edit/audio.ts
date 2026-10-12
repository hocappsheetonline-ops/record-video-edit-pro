import type { Project } from '../project'
import type { AudioMix } from './edit-state'
import { reversedFileName } from './reverse'
import {
  alongAtSource,
  clipGain,
  clipLength,
  clipPositions,
  mediaTime,
  offsetAtAlong,
  sourceAtAlong,
  sourceSegments,
  type Clip,
} from './timeline'

export interface AudioPiece {
  /** Tên file trong thư mục dự án. */
  file: string
  kind: 'mic' | 'system'
  /** Bắt đầu lấy từ giây thứ mấy của file. */
  mediaStart: number
  /** Độ dài cần lấy trong file (giây, trước khi đổi tốc độ). */
  duration: number
  /** Vị trí đặt trên video xuất (giây). */
  outputStart: number
  speed: number
  volume: number
}

const MIN_PIECE_S = 0.02
/** Clip có đường cong tốc độ: chia âm thanh thành chừng này mảnh tốc độ cố định (xấp xỉ). */
export const CURVE_AUDIO_PIECES = 10

/**
 * Tính các mảnh âm thanh cần ghép khi xuất video: với mỗi clip, lấy phần micro và âm thanh máy
 * tương ứng (có bù độ lệch lúc bắt đầu ghi), đặt đúng vị trí trên timeline xuất. Clip phát ngược
 * lấy từ file đảo ngược; clip có đường cong tốc độ được chia thành nhiều mảnh tốc độ cố định.
 */
export function planAudio(
  project: Pick<Project, 'segments'>,
  clips: readonly Clip[],
  mix: Pick<AudioMix, 'mic' | 'system'>,
): AudioPiece[] {
  const list = sourceSegments(project.segments)
  const pieces: AudioPiece[] = []
  for (const { clip, outputStart } of clipPositions(clips)) {
    if (clip.freeze) continue
    const len = clipLength(clip)
    for (const item of list) {
      const from = Math.max(clip.sourceStart, item.offset)
      const to = Math.min(clip.sourceEnd, item.offset + item.duration)
      if (to <= from) continue
      // Khoảng theo thứ tự phát.
      const a0 = Math.min(alongAtSource(clip, from), alongAtSource(clip, to))
      const a1 = Math.max(alongAtSource(clip, from), alongAtSource(clip, to))
      const cuts = [a0]
      if (clip.speedCurve)
        for (let i = 1; i < CURVE_AUDIO_PIECES; i++) {
          const a = (len * i) / CURVE_AUDIO_PIECES
          if (a > a0 && a < a1) cuts.push(a)
        }
      cuts.push(a1)
      for (const kind of ['mic', 'system'] as const) {
        const track = item.segment.tracks[kind]
        const volume = mix[kind] * clipGain(clip, kind)
        if (!track || volume <= 0) continue
        for (let i = 0; i < cuts.length - 1; i++) {
          let b0 = cuts[i]!
          const b1 = cuts[i + 1]!
          // Phần nguồn trước khi track bắt đầu ghi thì không có âm thanh.
          const valid = (b: number) => mediaTime(item, kind, sourceAtAlong(clip, b))! >= 0
          if (!valid(b0) || !valid(b1)) {
            if (clip.reversed || !valid(b1)) continue
            b0 += -mediaTime(item, kind, sourceAtAlong(clip, b0))! * 1000
          }
          if (b1 - b0 < MIN_PIECE_S * 1000) continue
          const o0 = offsetAtAlong(clip, b0)
          const o1 = offsetAtAlong(clip, b1)
          pieces.push({
            file: clip.reversed ? reversedFileName(item.segment.index, clip, kind) : track.file,
            kind,
            // File đảo ngược: giây 0 ứng với cuối clip, nên vị trí trong file = quãng đã phát.
            mediaStart: clip.reversed
              ? b0 / 1000
              : Math.max(0, mediaTime(item, kind, sourceAtAlong(clip, b0))!),
            duration: (b1 - b0) / 1000,
            outputStart: (outputStart + o0) / 1000,
            speed: (b1 - b0) / Math.max(1e-6, o1 - o0),
            volume,
          })
        }
      }
    }
  }
  return pieces
}
