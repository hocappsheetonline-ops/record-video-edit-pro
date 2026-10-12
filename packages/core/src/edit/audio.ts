import type { Project } from '../project'
import type { AudioMix } from './edit-state'
import { clipGain, clipPositions, mediaTime, sourceSegments, type Clip } from './timeline'

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

/**
 * Tính các mảnh âm thanh cần ghép khi xuất video: với mỗi clip, lấy phần micro và âm thanh máy
 * tương ứng (có bù độ lệch lúc bắt đầu ghi), đặt đúng vị trí trên timeline xuất.
 */
export function planAudio(
  project: Pick<Project, 'segments'>,
  clips: readonly Clip[],
  mix: Pick<AudioMix, 'mic' | 'system'>,
): AudioPiece[] {
  const list = sourceSegments(project.segments)
  const pieces: AudioPiece[] = []
  for (const { clip, outputStart } of clipPositions(clips)) {
    for (const item of list) {
      const from = Math.max(clip.sourceStart, item.offset)
      const to = Math.min(clip.sourceEnd, item.offset + item.duration)
      if (to <= from) continue
      for (const kind of ['mic', 'system'] as const) {
        const track = item.segment.tracks[kind]
        const volume = mix[kind] * clipGain(clip, kind)
        if (!track || volume <= 0) continue
        let start = from
        const media = mediaTime(item, kind, start)!
        // Track bắt đầu ghi muộn hơn: bỏ qua phần chưa có âm thanh.
        if (media < 0) start += -media * 1000
        if (to - start < MIN_PIECE_S * 1000) continue
        pieces.push({
          file: track.file,
          kind,
          mediaStart: Math.max(0, mediaTime(item, kind, start)!),
          duration: (to - start) / 1000,
          outputStart: (outputStart + (start - clip.sourceStart) / clip.speed) / 1000,
          speed: clip.speed,
          volume,
        })
      }
    }
  }
  return pieces
}
