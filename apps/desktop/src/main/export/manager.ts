import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { outputDuration, planAudio, type EditState, type Project } from '@lumora/core'
import { buildExportMuxArgs, buildGifArgs } from '../ffmpeg/args'
import type { FfmpegRunner } from '../ffmpeg/runner'

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

  constructor(private readonly run: FfmpegRunner) {}

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
    edit: EditState,
    projectDir: string,
    baseName: string,
  ): Promise<ExportResult> {
    const job = this.get(id)
    this.active.delete(id)
    await job.file.close()
    try {
      const durationS = outputDuration(edit.clips) / 1000
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
      const name = safeFileName(`${baseName} ${stamp}`)
      const mp4 = join(job.dir, `${name}.mp4`)
      const pieces = planAudio(project, edit.clips, edit.audio).map((p) => ({
        path: join(projectDir, p.file),
        mediaStart: p.mediaStart,
        duration: p.duration,
        outputStart: p.outputStart,
        speed: p.speed,
        volume: p.volume,
      }))
      const tmpOut = join(job.dir, `.mux-${id}.mp4`)
      const muxed = await this.run(
        buildExportMuxArgs({ video: job.tmpPath, pieces, durationS, output: tmpOut }),
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

  async cancel(id: string): Promise<void> {
    const job = this.active.get(id)
    if (!job) return
    this.active.delete(id)
    await job.file.close().catch(() => undefined)
    await rm(job.tmpPath, { force: true })
  }
}
