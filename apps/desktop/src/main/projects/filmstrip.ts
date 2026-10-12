import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  FILMSTRIP_FILE,
  FILMSTRIP_HEIGHT,
  filmstripInterval,
  parseFilmstrip,
  sheetGrid,
  sourceDuration,
  sourceSegments,
  type Filmstrip,
  type FilmstripSheet,
  type Project,
  type Size,
} from '@lumora/core'
import { parseInputResolution } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/**
 * Ảnh thu nhỏ của video màn hình cho dải phim trên timeline. Mỗi đoạn quay một tấm ảnh ghép JPEG
 * (FFmpeg: lấy 1 khung mỗi `intervalMs`, thu nhỏ, ghép thành lưới). Lưu `filmstrip.json` để lần
 * sau mở ngay. Không có video màn hình → null.
 */
export async function loadFilmstrip(
  project: Project,
  dir: string,
  run: FfmpegRunner,
): Promise<Filmstrip | null> {
  const cached = parseFilmstrip(await readJsonFile(join(dir, FILMSTRIP_FILE)))
  if (cached) {
    const files = await Promise.all(cached.sheets.map((s) => exists(join(dir, s.file))))
    if (files.every(Boolean)) return cached.sheets.length > 0 ? cached : null
  }

  const intervalMs = filmstripInterval(sourceDuration(project.segments))
  let thumb: Size | null = null
  const sheets: FilmstripSheet[] = []
  for (const item of sourceSegments(project.segments)) {
    const track = item.segment.tracks.screen
    if (!track) continue
    const input = join(dir, track.file)
    if (!thumb) {
      const probe = await run(['-hide_banner', '-i', input], 30_000)
      const size = parseInputResolution(probe.stderr) ?? { width: 16, height: 9 }
      thumb = {
        width: even((FILMSTRIP_HEIGHT * size.width) / size.height),
        height: FILMSTRIP_HEIGHT,
      }
    }
    // Video màn hình có thể bắt đầu trễ hơn đoạn quay một chút.
    const offsetMs = item.offset + (track.startedAt - item.segment.startedAt)
    const mediaMs = Math.max(1, item.segment.endedAt - track.startedAt)
    const count = Math.floor((mediaMs - 1) / intervalMs) + 1
    const { columns, rows } = sheetGrid(count)
    const file = `filmstrip-${item.segment.index}.jpg`
    const result = await run(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        input,
        '-vf',
        `fps=${(1000 / intervalMs).toFixed(6)},scale=${thumb.width}:${thumb.height},tile=${columns}x${rows}`,
        '-frames:v',
        '1',
        '-q:v',
        '5',
        join(dir, file),
      ],
      300_000,
    )
    if (result.code !== 0) {
      await rm(join(dir, file), { force: true })
      throw new Error(`Không tạo được ảnh thu nhỏ: ${result.stderr.slice(-300)}`)
    }
    sheets.push({
      segment: item.segment.index,
      file,
      count,
      columns,
      rows,
      startMs: item.offset,
      endMs: item.offset + item.duration,
      offsetMs,
    })
  }
  const strip: Filmstrip = {
    version: 1,
    intervalMs,
    thumb: thumb ?? { width: 128, height: FILMSTRIP_HEIGHT },
    sheets,
  }
  await writeJsonFile(join(dir, FILMSTRIP_FILE), strip)
  return sheets.length > 0 ? strip : null
}
