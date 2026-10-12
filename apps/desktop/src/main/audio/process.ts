import { copyFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { audioFxFilters, isDefaultFx, processedFileName, type AudioFx } from '@lumora/core'
import type { FfmpegRunner } from '../ffmpeg/runner'

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

/**
 * Viết đường dẫn model vào chuỗi bộ lọc FFmpeg: đặt trong nháy đơn, thoát dấu hai chấm (ổ đĩa
 * Windows `C:`). Đường dẫn có dấu nháy đơn thì không viết an toàn được → null.
 */
export function filterPath(path: string): string | null {
  if (path.includes("'")) return null
  return `'${path.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
}

/**
 * Xử lý âm thanh (lọc tạp âm, hiệu ứng giọng) thành file `fx-….m4a` trong thư mục dự án. Mỗi
 * bộ (file, hiệu ứng) chỉ xử lý một lần: đã có file thì dùng lại, đang xử lý thì chờ chung.
 */
export class AudioProcessor {
  private readonly running = new Map<string, Promise<string>>()

  constructor(
    private readonly run: FfmpegRunner,
    /** Model rnnoise (AI lọc tạp âm); null thì dùng lọc phổ. */
    private readonly modelPath: string | null,
  ) {}

  private async model(): Promise<string | null> {
    if (!this.modelPath || !(await exists(this.modelPath))) return null
    const direct = filterPath(this.modelPath)
    if (direct) return direct
    // Đường dẫn có ký tự khó viết vào bộ lọc: chép model ra thư mục tạm.
    const copy = join(tmpdir(), 'lumora-rnnoise.rnnn')
    if (!(await exists(copy))) await copyFile(this.modelPath, copy)
    return filterPath(copy)
  }

  /** Trả về tên file đã xử lý (hoặc tên gốc nếu không có hiệu ứng). */
  process(projectDir: string, file: string, fx: AudioFx | undefined): Promise<string> {
    if (!fx || isDefaultFx(fx)) return Promise.resolve(file)
    if (!/^[\w.-]+$/.test(file)) return Promise.reject(new Error('audio_unreadable'))
    const output = processedFileName(file, fx)
    const key = join(projectDir, output)
    const running = this.running.get(key)
    if (running) return running
    const task = this.doProcess(projectDir, file, fx, output).finally(() =>
      this.running.delete(key),
    )
    this.running.set(key, task)
    return task
  }

  private async doProcess(projectDir: string, file: string, fx: AudioFx, output: string) {
    const target = join(projectDir, output)
    if (await exists(target)) return output
    const tmp = join(projectDir, `.${output}.part.m4a`)
    const filters = audioFxFilters(fx, await this.model())
    const r = await this.run(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        join(projectDir, file),
        '-vn',
        '-af',
        filters.join(','),
        '-ar',
        '48000',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        tmp,
      ],
      30 * 60_000,
    )
    if (r.code !== 0) {
      await rm(tmp, { force: true })
      throw new Error(`audio_fx_failed: ${r.stderr.slice(-300)}`)
    }
    await rename(tmp, target)
    return output
  }
}
