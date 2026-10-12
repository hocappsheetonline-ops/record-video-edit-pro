import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import {
  LOUDNESS_SPECS,
  loudnormFilter,
  outputDuration,
  parseLoudnormJson,
  planAudio,
  overlayAudioClips,
  planAudioClips,
  type EditState,
  type Project,
  applyTrackState,
} from '@lumora/core'
import { buildExportMuxArgs, buildGifArgs, buildLoudnessMeasureArgs } from '../ffmpeg/args'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { AudioProcessor } from '../audio/process'
import { ClipReverser } from '../clips/reverse'

export const EXPORTS_DIR = 'exports'

interface ActiveExport {
  id: string
  dir: string
  tmpPath: string
  file: FileHandle
}

export interface ExportResult {
  path: string
  fileName: string
}

/** Tên file an toàn trên Windows (bỏ ký tự cấm). */
export function safeFileName(name: string): string {
  const cleaned = [...name]
    .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 120) || 'Lumora'
}

/**
 * Xuất video: giao diện mã hóa hình (MP4 chưa có tiếng) và gửi từng phần về đây để ghi đúng vị trí;
 * xong thì FFmpeg ghép âm thanh theo các clip và (nếu cần) đổi sang GIF.
 */
export class ExportManager {
  private readonly active = new Map<string, ActiveExport>()

  private readonly audio: Pick<AudioProcessor, 'process'>

  /**
   * `audio`: bộ xử lý lọc tạp âm / hiệu ứng giọng (mặc định: không có AI, dùng lọc phổ).
   * `reverser`: tạo file đảo ngược cho clip phát ngược.
   */
  constructor(
    private readonly run: FfmpegRunner,
    audio?: Pick<AudioProcessor, 'process'>,
    private readonly reverser?: Pick<ClipReverser, 'ensure'>,
  ) {
    this.audio = audio ?? new AudioProcessor(run, null)
  }

  async start(projectDir: string): Promise<string> {
    const dir = join(projectDir, EXPORTS_DIR)
    await mkdir(dir, { recursive: true })
    const id = randomUUID()
    const tmpPath = join(dir, `.render-${id}.mp4`)
    const file = await open(tmpPath, 'w')
    this.active.set(id, { id, dir, tmpPath, file })
    return id
  }

  private get(id: string): ActiveExport {
    const job = this.active.get(id)
    if (!job) throw new Error('Phiên xuất video không tồn tại')
    return job
  }

  async write(id: string, position: number, data: Uint8Array): Promise<void> {
    if (!Number.isInteger(position) || position < 0) throw new Error('Vị trí ghi không hợp lệ')
    await this.get(id).file.write(data, 0, data.byteLength, position)
  }

  async finish(
    id: string,
    project: Project,
    savedEdit: EditState,
    projectDir: string,
    baseName: string,
  ): Promise<ExportResult> {
    // Hàng bị tắt tiếng / ẩn trên timeline: không trộn vào video xuất.
    const edit = applyTrackState(savedEdit)
    const job = this.get(id)
    this.active.delete(id)
    await job.file.close()
    try {
      const durationS = outputDuration(edit.clips) / 1000
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
      const name = safeFileName(`${baseName} ${stamp}`)
      const mp4 = join(job.dir, `${name}.mp4`)
      // Clip phát ngược: cần file tiếng đảo ngược (tạo ngay nếu chưa có).
      for (const clip of edit.clips)
        if (clip.reversed && !clip.freeze)
          await (this.reverser ?? new ClipReverser(this.run)).ensure(projectDir, clip, project)
      // Track có lọc tạp âm / hiệu ứng giọng: dùng file đã xử lý (xử lý ngay nếu chưa có).
      const recorded = await Promise.all(
        planAudio(project, edit.clips, edit.audio).map(async (p) => ({
          path: join(
            projectDir,
            await this.audio.process(
              projectDir,
              p.file,
              p.kind === 'mic' ? edit.audio.micFx : edit.audio.systemFx,
            ),
          ),
          mediaStart: p.mediaStart,
          duration: p.duration,
          outputStart: p.outputStart,
          speed: p.speed,
          volume: p.volume,
        })),
      )
      // Nhạc nền, hiệu ứng âm thanh, lồng tiếng và tiếng của video meme.
      const extra = [...edit.audioClips, ...overlayAudioClips(edit.overlays)]
      const added = await Promise.all(
        planAudioClips(extra, durationS * 1000).map(async (p) => ({
          ...p,
          path: join(projectDir, await this.audio.process(projectDir, p.file, p.fx)),
          speed: 1,
        })),
      )
      const pieces = [...recorded, ...added]
      const loudnorm =
        edit.export.loudness !== 'off' && edit.export.format === 'mp4' && pieces.length > 0
          ? await this.measureLoudness(pieces, durationS, edit.export.loudness)
          : null
      const tmpOut = join(job.dir, `.mux-${id}.mp4`)
      const muxed = await this.run(
        buildExportMuxArgs({ video: job.tmpPath, pieces, durationS, output: tmpOut, loudnorm }),
        600_000,
      )
      if (muxed.code !== 0) throw new Error(`Ghép âm thanh thất bại: ${muxed.stderr.slice(-400)}`)
      await rename(tmpOut, mp4)
      if (edit.export.format === 'gif') {
        const gif = join(job.dir, `${name}.gif`)
        const width = Math.min(960, edit.export.resolution === 720 ? 720 : 960)
        const converted = await this.run(buildGifArgs(mp4, gif, width, 15), 600_000)
        await rm(mp4, { force: true })
        if (converted.code !== 0)
          throw new Error(`Tạo GIF thất bại: ${converted.stderr.slice(-400)}`)
        return { path: gif, fileName: `${name}.gif` }
      }
      return { path: mp4, fileName: `${name}.mp4` }
    } finally {
      await rm(job.tmpPath, { force: true })
    }
  }

  /**
   * Chuẩn hóa độ to hai lượt (chính xác như công cụ chuyên nghiệp): đo bản trộn trước, rồi trả về
   * bộ lọc chỉnh tuyến tính theo số đo. Đo lỗi thì chuẩn hóa một lượt; im lặng thì bỏ qua (null).
   */
  private async measureLoudness(
    pieces: Parameters<typeof buildLoudnessMeasureArgs>[0]['pieces'],
    durationS: number,
    target: keyof typeof LOUDNESS_SPECS,
  ): Promise<string | null> {
    const spec = LOUDNESS_SPECS[target]
    const measured = await this.run(buildLoudnessMeasureArgs({ pieces, durationS, spec }), 600_000)
    return loudnormFilter(spec, measured.code === 0 ? parseLoudnormJson(measured.stderr) : null)
  }

  async cancel(id: string): Promise<void> {
    const job = this.active.get(id)
    if (!job) return
    this.active.delete(id)
    await job.file.close().catch(() => undefined)
    await rm(job.tmpPath, { force: true })
  }
}
