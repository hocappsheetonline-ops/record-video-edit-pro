import { rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  audioFxFilters,
  isDefaultFx,
  needsAiDenoise,
  processedFileName,
  type AudioFx,
} from '@lumora/core'
import type { FfmpegRunner } from '../ffmpeg/runner'
import type { Denoiser } from './denoise'

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

const TIMEOUT_MS = 30 * 60_000

/**
 * Xử lý âm thanh (lọc tạp âm, hiệu ứng giọng) thành file `fx-….m4a` trong thư mục dự án. Mỗi
 * bộ (file, hiệu ứng) chỉ xử lý một lần: đã có file thì dùng lại, đang xử lý thì chờ chung.
 */
export class AudioProcessor {
  private readonly running = new Map<string, Promise<string>>()

  constructor(
    private readonly run: FfmpegRunner,
    /** Lọc tạp âm AI (RNNoise); null thì mức vừa / mạnh dùng lọc phổ. */
    private readonly denoiser: Denoiser | null,
  ) {}

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
    const source = join(projectDir, file)
    if (this.denoiser && needsAiDenoise(fx)) {
      try {
        await this.denoiser.render(source, tmp, audioFxFilters(fx, true), TIMEOUT_MS)
      } catch (error) {
        await rm(tmp, { force: true })
        throw error instanceof Error && error.message.startsWith('audio_fx_failed')
          ? error
          : new Error(`audio_fx_failed: ${String(error)}`)
      }
      await rename(tmp, target)
      return output
    }
    const filters = audioFxFilters(fx, false)
    const r = await this.run(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        source,
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
      TIMEOUT_MS,
    )
    if (r.code !== 0) {
      await rm(tmp, { force: true })
      throw new Error(`audio_fx_failed: ${r.stderr.slice(-300)}`)
    }
    await rename(tmp, target)
    return output
  }
}
