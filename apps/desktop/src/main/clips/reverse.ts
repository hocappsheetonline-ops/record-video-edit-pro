import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  clipSegment,
  mediaTime,
  parseProject,
  PROJECT_FILE,
  REVERSE_MAX_MS,
  reversedFileName,
  type Clip,
  type Project,
  type TrackKind,
} from '@lumora/core'
import type { FfmpegRunner } from '../ffmpeg/runner'

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

/** Độ dài mỗi mảnh khi đảo ngược hình (giây): bộ lọc `reverse` giữ cả mảnh trong bộ nhớ. */
const CHUNK_S = 1
const KINDS: TrackKind[] = ['screen', 'camera', 'mic', 'system']

export type ReversedFiles = Partial<Record<TrackKind, string>>

/**
 * Tạo file đảo ngược cho từng track của một clip (để xem trước và xuất clip phát ngược). Hình được
 * đảo theo từng mảnh 1 giây rồi nối lại (không cần giữ cả đoạn trong bộ nhớ); tiếng đảo một lần.
 * Mỗi clip chỉ tạo một lần, gọi trùng thì chờ chung.
 */
export class ClipReverser {
  private readonly running = new Map<string, Promise<ReversedFiles>>()

  constructor(private readonly run: FfmpegRunner) {}

  async ensure(
    projectDir: string,
    clip: Pick<Clip, 'sourceStart' | 'sourceEnd'>,
    project?: Project,
  ): Promise<ReversedFiles> {
    const p =
      project ?? parseProject(JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8')))
    if (!p) throw new Error('reverse_failed')
    if (clip.sourceEnd - clip.sourceStart > REVERSE_MAX_MS) throw new Error('reverse_too_long')
    const item = clipSegment(p.segments, clip)
    if (!item) throw new Error('reverse_segments')
    const key = join(projectDir, reversedFileName(item.segment.index, clip, 'screen'))
    const running = this.running.get(key)
    if (running) return running
    const task = this.build(projectDir, clip, item).finally(() => this.running.delete(key))
    this.running.set(key, task)
    return task
  }

  private async build(
    projectDir: string,
    clip: Pick<Clip, 'sourceStart' | 'sourceEnd'>,
    item: NonNullable<ReturnType<typeof clipSegment>>,
  ): Promise<ReversedFiles> {
    const out: ReversedFiles = {}
    for (const kind of KINDS) {
      const track = item.segment.tracks[kind]
      if (!track) continue
      const start = Math.max(0, mediaTime(item, kind, clip.sourceStart)!)
      const end = mediaTime(item, kind, clip.sourceEnd)!
      if (end - start < 0.05) continue
      const name = reversedFileName(item.segment.index, clip, kind)
      const target = join(projectDir, name)
      if (!(await exists(target))) {
        const input = join(projectDir, track.file)
        if (kind === 'screen' || kind === 'camera')
          await this.reverseVideo(projectDir, input, start, end, target)
        else await this.reverseAudio(input, start, end, target)
      }
      out[kind] = name
    }
    return out
  }

  private async reverseAudio(input: string, start: number, end: number, target: string) {
    const tmp = `${target}.part.m4a`
    const r = await this.run(
      ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-t']
        .concat([(end - start).toFixed(3), '-i', input, '-vn', '-af', 'areverse'])
        .concat(['-c:a', 'aac', '-b:a', '192k', tmp]),
      10 * 60_000,
    )
    if (r.code !== 0) {
      await rm(tmp, { force: true })
      throw new Error(`reverse_failed: ${r.stderr.slice(-300)}`)
    }
    await rename(tmp, target)
  }

  private async reverseVideo(
    projectDir: string,
    input: string,
    start: number,
    end: number,
    target: string,
  ) {
    const work = await mkdtemp(join(projectDir, '.rev-'))
    try {
      // Mảnh 0 là giây cuối của đoạn (đảo ngược), mảnh sau lùi dần về đầu.
      const parts: string[] = []
      for (let i = 0; ; i++) {
        const to = end - i * CHUNK_S
        if (to <= start + 0.001) break
        const from = Math.max(start, to - CHUNK_S)
        const part = join(work, `p${String(i).padStart(5, '0')}.mp4`)
        const r = await this.run(
          ['-hide_banner', '-loglevel', 'error', '-y', '-ss', from.toFixed(3), '-t']
            .concat([(to - from).toFixed(3), '-i', input, '-an', '-vf', 'reverse'])
            .concat(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'])
            .concat(['-pix_fmt', 'yuv420p', '-g', '15', part]),
          5 * 60_000,
        )
        if (r.code !== 0) throw new Error(`reverse_failed: ${r.stderr.slice(-300)}`)
        parts.push(part)
      }
      const list = join(work, 'list.txt')
      await writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
      const tmp = `${target}.part.mp4`
      const r = await this.run(
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          list,
        ].concat(['-c', 'copy', '-movflags', '+faststart', tmp]),
        5 * 60_000,
      )
      if (r.code !== 0) {
        await rm(tmp, { force: true })
        throw new Error(`reverse_failed: ${r.stderr.slice(-300)}`)
      }
      await rename(tmp, target)
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }
}
