import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFfmpeg } from '../ffmpeg/runner'
import { ClipReverser } from './reverse'

const T0 = 1_700_000_000_000
let dir: string

/** Độ sáng trung bình của khung hình tại giây t. */
async function brightness(file: string, t: number) {
  const r = await runFfmpeg(
    ['-hide_banner', '-ss', String(t), '-i', join(dir, file), '-frames:v', '1'].concat([
      '-vf',
      'signalstats,metadata=print',
      '-f',
      'null',
      '-',
    ]),
  )
  return Number(/signalstats\.YAVG=([\d.]+)/.exec(r.stderr)?.[1] ?? -1)
}

/** Độ to trung bình (dB) của đoạn [from, from + len). */
async function loudness(file: string, from: number, len: number) {
  const r = await runFfmpeg(
    ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', join(dir, file)].concat([
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]),
  )
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -100)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-rev-'))
  // Hình sáng dần theo từng khung (dễ thấy chiều thời gian); tiếng: 0.5s đầu có tiếng bíp, sau im.
  const video = await runFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i']
      .concat(["nullsrc=s=160x120:r=30:d=4,geq=lum='N*2':cb=128:cr=128"])
      .concat(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'seg0-screen.mkv')]),
  )
  if (video.code !== 0) throw new Error(video.stderr)
  const audio = await runFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i']
      .concat(["aevalsrc='if(between(t\\,1\\,1.5)\\,0.5*sin(2*PI*440*t)\\,0)':s=48000:d=4"])
      .concat(['-c:a', 'libopus', join(dir, 'seg0-mic.webm')]),
  )
  if (audio.code !== 0) throw new Error(audio.stderr)
  writeFileSync(
    join(dir, 'project.json'),
    JSON.stringify({
      version: 1,
      id: 'p',
      name: 'P',
      createdAt: '2026-01-01T00:00:00.000Z',
      source: {
        kind: 'display',
        name: 'Test',
        captureRect: { x: 0, y: 0, width: 160, height: 120 },
        scaleFactor: 1,
      },
      engine: 'ffmpeg',
      encoder: 'libx264',
      fps: 30,
      cursorHidden: true,
      segments: [
        {
          index: 0,
          startedAt: T0,
          endedAt: T0 + 4000,
          tracks: {
            screen: { file: 'seg0-screen.mkv', startedAt: T0 },
            mic: { file: 'seg0-mic.webm', startedAt: T0 },
          },
        },
      ],
      hasEvents: false,
      inputMode: 'hook',
      durationMs: 4000,
    }),
  )
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('ClipReverser (FFmpeg thật)', () => {
  it('đảo ngược hình và tiếng của đúng khoảng clip; khung đầu là khung cuối của khoảng', async () => {
    const run = vi.fn(runFfmpeg)
    const reverser = new ClipReverser(run)
    const clip = { sourceStart: 1000, sourceEnd: 3500 }
    const files = await reverser.ensure(dir, clip)
    expect(files).toEqual({
      screen: 'rev-s0-1000-3500-screen.mp4',
      mic: 'rev-s0-1000-3500-mic.m4a',
    })
    // Gốc: giây 1 tối hơn giây 3.4. Bản đảo: giây 0 sáng như 3.4 gốc, cuối tối như giây 1 gốc.
    const startOrig = await brightness('seg0-screen.mkv', 1.0)
    const endOrig = await brightness('seg0-screen.mkv', 3.45)
    expect(endOrig).toBeGreaterThan(startOrig + 50)
    expect(Math.abs((await brightness(files.screen!, 0)) - endOrig)).toBeLessThan(6)
    expect(Math.abs((await brightness(files.screen!, 2.45)) - startOrig)).toBeLessThan(6)
    const probe = await runFfmpeg(['-hide_banner', '-i', join(dir, files.screen!)])
    expect(probe.stderr).toMatch(/Duration: 00:00:02\.[45]/)
    // Tiếng bíp ở 1.0–1.5s gốc → cuối file đảo (2.0–2.5s), đầu file im lặng.
    expect(await loudness(files.mic!, 2.05, 0.4)).toBeGreaterThan(
      (await loudness(files.mic!, 0.2, 0.5)) + 20,
    )
    // Không để lại thư mục / file tạm; gọi lại thì dùng file có sẵn.
    expect(readdirSync(dir).filter((f) => f.startsWith('.') || f.includes('.part'))).toEqual([])
    const calls = run.mock.calls.length
    expect(await reverser.ensure(dir, clip)).toEqual(files)
    expect(run.mock.calls.length).toBe(calls)
  }, 120_000)

  it('từ chối clip quá dài hoặc trải qua nhiều đoạn quay', async () => {
    const reverser = new ClipReverser(runFfmpeg)
    await expect(reverser.ensure(dir, { sourceStart: 0, sourceEnd: 200_000 })).rejects.toThrow(
      'reverse_too_long',
    )
    await expect(reverser.ensure(dir, { sourceStart: 3000, sourceEnd: 9000 })).rejects.toThrow(
      'reverse_segments',
    )
    expect(existsSync(join(dir, 'rev-s0-3000-9000-screen.mp4'))).toBe(false)
  })
})
