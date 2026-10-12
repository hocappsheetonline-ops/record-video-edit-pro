import { randomBytes } from 'node:crypto'
import { access, copyFile, readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  computePeaks,
  parseWaveform,
  SOUND_EFFECT_IDS,
  type SoundEffectId,
  type Waveform,
} from '@lumora/core'
import { parseDurationMs } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'webm']

import type { AudioAsset } from '@shared/ipc'

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

async function probeDuration(path: string, run: FfmpegRunner): Promise<number> {
  const probe = await run(['-hide_banner', '-i', path], 30_000)
  const ms = parseDurationMs(probe.stderr)
  if (!ms || ms <= 0 || !/Audio:/.test(probe.stderr)) throw new Error('audio_unreadable')
  return ms
}

/** Sao chép file nhạc của người dùng vào dự án (để dự án tự chứa đủ, chia sẻ được). */
export async function importAudioFile(
  source: string,
  projectDir: string,
  run: FfmpegRunner,
): Promise<AudioAsset> {
  const ext = extname(source).slice(1).toLowerCase()
  if (!AUDIO_EXTENSIONS.includes(ext)) throw new Error('audio_unsupported')
  const durationMs = await probeDuration(source, run)
  const file = `asset-${randomBytes(6).toString('hex')}.${ext}`
  await copyFile(source, join(projectDir, file))
  return { file, name: basename(source, extname(source)), durationMs }
}

/**
 * Hiệu ứng âm thanh có sẵn, tạo bằng FFmpeg (tổng hợp âm thanh) nên không có vấn đề bản quyền.
 * `source`: nguồn lavfi; `filter`: bộ lọc thêm (nếu có).
 */
export const SOUND_EFFECTS: Record<SoundEffectId, { source: string; filter?: string }> = {
  whoosh: {
    source: 'anoisesrc=d=0.8:c=pink:a=0.7:r=44100',
    filter: 'highpass=f=300,lowpass=f=3500,afade=t=in:d=0.35,afade=t=out:st=0.4:d=0.4',
  },
  pop: { source: 'aevalsrc=0.8*sin(2*PI*(700-600*t)*t)*exp(-28*t):s=44100:d=0.25' },
  ding: {
    source: 'aevalsrc=0.45*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t))*exp(-3.5*t):s=44100:d=1.6',
  },
  boom: { source: 'aevalsrc=0.95*sin(2*PI*(55+70*exp(-9*t))*t)*exp(-2.6*t):s=44100:d=1.8' },
  click: { source: 'aevalsrc=0.8*sin(2*PI*2200*t)*exp(-140*t):s=44100:d=0.08' },
  rise: { source: 'aevalsrc=0.35*sin(2*PI*(180+900*t*t/4)*t)*min(1\\,t):s=44100:d=2' },
  sadTrombone: {
    // Bốn nốt đi xuống "wah wah wah wahhh" (giai điệu phổ biến, tự tổng hợp).
    source:
      'aevalsrc=0.4*sin(2*PI*if(lt(t\\,0.45)\\,392\\,if(lt(t\\,0.9)\\,370\\,if(lt(t\\,1.35)\\,349\\,330+12*sin(2*PI*6*t))))*t)*if(lt(mod(t\\,0.45)\\,0.03)\\,mod(t\\,0.45)/0.03\\,1):s=44100:d=2.6',
    filter: 'lowpass=f=1800,afade=t=out:st=2.1:d=0.5',
  },
  tada: {
    source:
      'aevalsrc=0.25*(sin(2*PI*523*t)+sin(2*PI*659*t)+sin(2*PI*784*t)+if(gt(t\\,0.18)\\,sin(2*PI*1046*t)\\,0))*exp(-1.6*t):s=44100:d=2',
  },
  bleep: {
    source: 'aevalsrc=0.4*sin(2*PI*1000*t):s=44100:d=0.6',
    filter: 'afade=t=out:st=0.55:d=0.05',
  },
  shutter: {
    source: 'anoisesrc=d=0.25:c=white:a=0.6:r=44100',
    filter: 'highpass=f=1500,volume=1.4,afade=t=out:st=0.03:d=0.2',
  },
  applause: {
    source: 'anoisesrc=d=3:c=pink:a=0.5:r=44100',
    filter:
      'bandpass=f=2500:width_type=o:w=2,tremolo=f=11:d=0.7,volume=4,afade=t=in:d=0.3,afade=t=out:st=2.2:d=0.8',
  },
}

export { SOUND_EFFECT_IDS }

/** Tạo (một lần) file hiệu ứng âm thanh trong dự án. */
export async function createSoundEffect(
  id: string,
  projectDir: string,
  run: FfmpegRunner,
): Promise<AudioAsset> {
  if (!(id in SOUND_EFFECTS)) throw new Error('sfx_unknown')
  const recipe = SOUND_EFFECTS[id as SoundEffectId]
  const file = `asset-sfx-${id}.m4a`
  const path = join(projectDir, file)
  if (!(await exists(path))) {
    const result = await run(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        recipe.source,
        ...(recipe.filter ? ['-af', recipe.filter] : []),
        '-ac',
        '2',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        path,
      ],
      60_000,
    )
    if (result.code !== 0) {
      await rm(path, { force: true })
      throw new Error(`Không tạo được hiệu ứng âm thanh: ${result.stderr.slice(-300)}`)
    }
  }
  return { file, name: id, durationMs: await probeDuration(path, run) }
}

/** Dạng sóng của một file âm thanh trong dự án (lưu kèm `<file>.peaks.json`). */
export async function assetPeaks(
  projectDir: string,
  file: string,
  run: FfmpegRunner,
): Promise<Waveform | null> {
  if (!/^asset-[\w.-]+$/.test(file)) throw new Error('Tên file không hợp lệ')
  const cacheFile = join(projectDir, `${file}.peaks.json`)
  const cached = parseWaveform(await readJsonFile(cacheFile))
  if (cached) return cached
  const raw = join(projectDir, `.${file}.pcm`)
  try {
    const r = await run(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        join(projectDir, file),
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        raw,
      ],
      120_000,
    )
    if (r.code !== 0) return null
    let bytes = await readFile(raw)
    if (bytes.byteOffset % 2 !== 0) bytes = Buffer.from(bytes)
    const wave = computePeaks(
      new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2)),
      8000,
    )
    await writeJsonFile(cacheFile, wave)
    return wave
  } finally {
    await rm(raw, { force: true })
  }
}
