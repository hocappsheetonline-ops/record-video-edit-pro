import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUDIO_FX, type AudioFx } from '@lumora/core'
import { runFfmpeg } from '../ffmpeg/runner'
import { importVoiceover } from '../projects/assets'
import { AudioProcessor, filterPath } from './process'

const MODEL = resolve(__dirname, '../../../resources/rnnoise/sh.rnnn')

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-fx-'))
  // 4 giây: 0–2s chỉ có tạp âm trắng; 2–4s "giọng" (âm hài 180 Hz, nhấp nhô như tiếng nói) + tạp âm.
  const r = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    "aevalsrc='if(gt(t\\,2)\\,0.4*(sin(2*PI*180*t)+0.6*sin(2*PI*360*t)+0.4*sin(2*PI*540*t))*(0.6+0.4*sin(2*PI*4*t))\\,0)':s=48000:d=4",
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=d=4:c=white:a=0.08:r=48000',
    '-filter_complex',
    '[0][1]amix=inputs=2:normalize=0',
    '-c:a',
    'libopus',
    join(dir, 'seg0-mic.webm'),
  ])
  if (r.code !== 0) throw new Error(r.stderr)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function mean(file: string, from: number, len: number, filter = '') {
  const r = await runFfmpeg([
    '-hide_banner',
    '-ss',
    String(from),
    '-t',
    String(len),
    '-i',
    join(dir, file),
    '-af',
    `${filter ? `${filter},` : ''}volumedetect`,
    '-f',
    'null',
    '-',
  ])
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -100)
}

const fx = (patch: Partial<AudioFx>): AudioFx => ({ ...DEFAULT_AUDIO_FX, ...patch })

describe('AudioProcessor (FFmpeg thật)', () => {
  it('lọc tạp âm AI: đoạn chỉ có tạp âm nhỏ đi rõ rệt, giọng gần như giữ nguyên, độ dài không đổi', async () => {
    const audio = new AudioProcessor(runFfmpeg, MODEL)
    const out = await audio.process(dir, 'seg0-mic.webm', fx({ noise: 'medium' }))
    expect(out).toBe('fx-seg0-mic-n2.m4a')
    const noiseBefore = await mean('seg0-mic.webm', 0.2, 1.6)
    const noiseAfter = await mean(out, 0.2, 1.6)
    expect(noiseAfter).toBeLessThan(noiseBefore - 15)
    const voiceBefore = await mean('seg0-mic.webm', 2.2, 1.6)
    expect(Math.abs((await mean(out, 2.2, 1.6)) - voiceBefore)).toBeLessThan(5)
    const probe = await runFfmpeg(['-hide_banner', '-i', join(dir, out)])
    expect(probe.stderr).toMatch(/Duration: 00:00:0(3\.9|4\.0)/)
    // Không để lại file tạm.
    expect(readdirSync(dir).filter((f) => f.includes('.part'))).toEqual([])
  }, 60_000)

  it('mức mạnh lọc nhiều hơn mức nhẹ; không có model thì vẫn lọc bằng lọc phổ', async () => {
    const audio = new AudioProcessor(runFfmpeg, MODEL)
    const light = await audio.process(dir, 'seg0-mic.webm', fx({ noise: 'light' }))
    const strong = await audio.process(dir, 'seg0-mic.webm', fx({ noise: 'strong' }))
    expect(await mean(strong, 0.2, 1.6)).toBeLessThan((await mean(light, 0.2, 1.6)) - 10)
    const noModel = new AudioProcessor(runFfmpeg, join(dir, 'missing.rnnn'))
    const fallback = await noModel.process(dir, 'seg0-mic.webm', fx({ noise: 'medium' }))
    expect(await mean(fallback, 0.2, 1.6)).toBeLessThan((await mean('seg0-mic.webm', 0.2, 1.6)) - 6)
  }, 60_000)

  it('giọng sóc chuột đẩy cao độ lên, giọng trầm kéo xuống', async () => {
    const audio = new AudioProcessor(runFfmpeg, null)
    const up = await audio.process(dir, 'seg0-mic.webm', fx({ voice: 'chipmunk' }))
    const down = await audio.process(dir, 'seg0-mic.webm', fx({ pitch: -7 }))
    const band = (file: string, f: number) => mean(file, 2.2, 1.6, `bandpass=f=${f}:w=30`)
    expect(await band(up, 270)).toBeGreaterThan((await band(up, 180)) + 10)
    // -7 bán cung: 180 Hz → ~120 Hz.
    expect(await band(down, 120)).toBeGreaterThan((await band(down, 180)) + 10)
  }, 60_000)

  it('không có hiệu ứng thì dùng file gốc; xử lý một lần, gọi trùng thì chờ chung', async () => {
    const run = vi.fn(runFfmpeg)
    const audio = new AudioProcessor(run, null)
    expect(await audio.process(dir, 'seg0-mic.webm', DEFAULT_AUDIO_FX)).toBe('seg0-mic.webm')
    expect(await audio.process(dir, 'seg0-mic.webm', undefined)).toBe('seg0-mic.webm')
    expect(run).not.toHaveBeenCalled()
    const a = fx({ normalize: true })
    const [x, y] = await Promise.all([
      audio.process(dir, 'seg0-mic.webm', a),
      audio.process(dir, 'seg0-mic.webm', a),
    ])
    expect(x).toBe(y)
    expect(run).toHaveBeenCalledTimes(1)
    await audio.process(dir, 'seg0-mic.webm', a)
    expect(run).toHaveBeenCalledTimes(1)
    // Chuẩn hóa về khoảng -16 LUFS: to hơn bản gốc.
    expect(await mean(x, 2.2, 1.6)).toBeGreaterThan(await mean('seg0-mic.webm', 2.2, 1.6))
    await expect(audio.process(dir, '../evil', a)).rejects.toThrow('audio_unreadable')
  }, 60_000)

  it('đường dẫn model trong bộ lọc: thoát dấu hai chấm (ổ đĩa Windows), từ chối nháy đơn', () => {
    expect(filterPath('C:\\Users\\An\\sh.rnnn')).toBe("'C\\:/Users/An/sh.rnnn'")
    expect(filterPath("/a/it's/sh.rnnn")).toBeNull()
  })
})

describe('lồng tiếng', () => {
  it('lưu bản ghi WebM thành AAC trong dự án, đọc độ dài; dữ liệu hỏng thì báo lỗi', async () => {
    const { readFile } = await import('node:fs/promises')
    const asset = await importVoiceover(dir, await readFile(join(dir, 'seg0-mic.webm')), runFfmpeg)
    expect(asset.file).toMatch(/^asset-voice-[0-9a-f]{12}\.m4a$/)
    expect(asset.durationMs).toBeGreaterThan(3800)
    expect(existsSync(join(dir, asset.file))).toBe(true)
    await expect(importVoiceover(dir, new Uint8Array(500), runFfmpeg)).rejects.toThrow(
      'audio_unreadable',
    )
    expect(readdirSync(dir).filter((f) => f.startsWith('.'))).toEqual([])
  }, 60_000)
})
