import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computePeaks,
  initialClips,
  parseWaveform,
  planAudio,
  sourceDuration,
  WAVEFORM_FILE,
  type Project,
  type Waveform,
} from '@lumora/core'
import { buildSpeechAudioArgs } from '../ffmpeg/args'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'

const SAMPLE_RATE = 8000

/**
 * Dạng sóng của cả bản quay (micro + âm thanh máy, theo thời gian nguồn) để vẽ trên timeline.
 * Tính một lần bằng FFmpeg rồi lưu `waveform.json` trong thư mục dự án. Không có âm thanh → null.
 */
export async function loadWaveform(
  project: Project,
  dir: string,
  run: FfmpegRunner,
): Promise<Waveform | null> {
  const cached = parseWaveform(await readJsonFile(join(dir, WAVEFORM_FILE)))
  if (cached) return cached.peaks.length > 0 ? cached : null

  const pieces = planAudio(project, initialClips(project), { mic: 1, system: 1 })
  let wave: Waveform = { bucketMs: 20, peaks: [] }
  if (pieces.length > 0) {
    const raw = join(dir, '.waveform.pcm')
    try {
      const result = await run(
        buildSpeechAudioArgs({
          pieces: pieces.map((p) => ({ ...p, path: join(dir, p.file), speed: 1, volume: 1 })),
          durationS: sourceDuration(project.segments) / 1000,
          output: raw,
          format: 'pcm',
        }),
        300_000,
      )
      if (result.code !== 0)
        throw new Error(`Không đọc được âm thanh: ${result.stderr.slice(-300)}`)
      let bytes = await readFile(raw)
      // Int16Array cần vùng nhớ bắt đầu ở vị trí chẵn.
      if (bytes.byteOffset % 2 !== 0) bytes = Buffer.from(bytes)
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2))
      wave = computePeaks(samples, SAMPLE_RATE)
    } finally {
      await rm(raw, { force: true })
    }
  }
  await writeJsonFile(join(dir, WAVEFORM_FILE), wave)
  return wave.peaks.length > 0 ? wave : null
}
