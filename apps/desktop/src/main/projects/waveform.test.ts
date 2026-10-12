import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waveformSlice, type Project } from '@lumora/core'
import { runFfmpeg } from '../ffmpeg/runner'
import { loadWaveform } from './waveform'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-wave-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

function project(tracks: Project['segments'][number]['tracks']): Project {
  return {
    version: 1,
    id: 'w',
    name: 'w',
    createdAt: '2026-10-12T00:00:00.000Z',
    source: { kind: 'display', name: 'x', captureRect: null, scaleFactor: 1 },
    engine: 'ffmpeg',
    encoder: null,
    fps: 30,
    cursorHidden: true,
    segments: [{ index: 0, startedAt: 1000, endedAt: 4000, tracks }],
    hasEvents: false,
    inputMode: null,
    durationMs: 3000,
  }
}

describe('loadWaveform (ffmpeg thật)', () => {
  it('micro: im lặng 1 giây đầu, có tiếng 1 giây sau; micro bắt đầu trễ 1 giây so với đoạn quay', async () => {
    const made = await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=if(gt(t\\,1)\\,0.6*sin(2*PI*440*t)\\,0):s=48000:d=2',
      '-c:a',
      'libopus',
      join(dir, 'mic.webm'),
    ])
    expect(made.code).toBe(0)
    const p = project({ mic: { file: 'mic.webm', startedAt: 2000 } })

    const wave = await loadWaveform(p, dir, runFfmpeg)
    expect(wave).not.toBeNull()
    expect(wave!.peaks.length).toBeGreaterThanOrEqual(148)
    // Thời gian nguồn: 0–1s chưa có micro, 1–2s micro im lặng, 2–3s có tiếng.
    const bars = waveformSlice(wave!, 0, 3000, 30)
    expect(Math.max(...bars.slice(1, 19))).toBeLessThan(0.05)
    expect(Math.min(...bars.slice(21, 29))).toBeGreaterThan(0.6)

    // Lần sau đọc từ file lưu sẵn, không chạy ffmpeg nữa.
    const run = vi.fn(runFfmpeg)
    expect(await loadWaveform(p, dir, run)).toEqual(wave)
    expect(run).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(join(dir, 'waveform.json'), 'utf8')).bucketMs).toBe(20)
  }, 60_000)

  it('không có âm thanh: trả null và nhớ kết quả', async () => {
    await writeFile(join(dir, 'screen.mkv'), '')
    const run = vi.fn(runFfmpeg)
    expect(
      await loadWaveform(project({ screen: { file: 'screen.mkv', startedAt: 1000 } }), dir, run),
    ).toBeNull()
    expect(run).not.toHaveBeenCalled()
    expect(await loadWaveform(project({}), dir, run)).toBeNull()
  })
})
