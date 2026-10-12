import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { thumbAt, type Project } from '@lumora/core'
import { runFfmpeg } from '../ffmpeg/runner'
import { loadFilmstrip } from './filmstrip'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-strip-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function makeVideo(name: string, color: string, seconds: number) {
  const made = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=1280x720:r=30:d=${seconds}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    join(dir, name),
  ])
  expect(made.code).toBe(0)
}

async function pixel(file: string, x: number, y: number): Promise<number[]> {
  const out = join(dir, `px-${x}-${y}.raw`)
  const r = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    file,
    '-vf',
    `format=rgb24,crop=1:1:${x}:${y}`,
    '-f',
    'rawvideo',
    out,
  ])
  expect(r.code).toBe(0)
  return [...(await readFile(out))]
}

function project(): Project {
  return {
    version: 1,
    id: 'f',
    name: 'f',
    createdAt: '2026-10-12T00:00:00.000Z',
    source: { kind: 'display', name: 'x', captureRect: null, scaleFactor: 1 },
    engine: 'ffmpeg',
    encoder: null,
    fps: 30,
    cursorHidden: true,
    segments: [
      {
        index: 0,
        startedAt: 1000,
        endedAt: 5000,
        tracks: { screen: { file: 'a.mp4', startedAt: 1000 } },
      },
      {
        index: 1,
        startedAt: 9000,
        endedAt: 12_000,
        tracks: { screen: { file: 'b.mp4', startedAt: 9000 } },
      },
    ],
    hasEvents: false,
    inputMode: null,
    durationMs: 7000,
  }
}

describe('loadFilmstrip (ffmpeg thật)', () => {
  it('mỗi đoạn một tấm ảnh ghép đúng kích thước; lần sau đọc từ file lưu sẵn', async () => {
    await makeVideo('a.mp4', 'red', 4)
    await makeVideo('b.mp4', 'blue', 3)
    const strip = (await loadFilmstrip(project(), dir, runFfmpeg))!
    expect(strip.intervalMs).toBe(1000)
    expect(strip.thumb).toEqual({ width: 128, height: 72 })
    expect(strip.sheets.map((s) => [s.file, s.count, s.columns, s.startMs, s.endMs])).toEqual([
      ['filmstrip-0.jpg', 4, 4, 0, 4000],
      ['filmstrip-1.jpg', 3, 3, 4000, 7000],
    ])
    for (const sheet of strip.sheets)
      expect((await stat(join(dir, sheet.file))).size).toBeGreaterThan(100)
    // Ảnh ghép đoạn 1 màu đỏ, đoạn 2 màu xanh.
    const [r0, g0, b0] = await pixel(join(dir, 'filmstrip-0.jpg'), 300, 36)
    expect(r0! - Math.max(g0!, b0!)).toBeGreaterThan(200)
    const [r1, , b1] = await pixel(join(dir, 'filmstrip-1.jpg'), 200, 36)
    expect(b1! - r1!).toBeGreaterThan(200)
    const probe = await runFfmpeg(['-hide_banner', '-i', join(dir, 'filmstrip-0.jpg')])
    expect(probe.stderr).toMatch(/512x72/)
    expect(thumbAt(strip, 5500)).toMatchObject({ index: 2, column: 2 })

    const run = vi.fn(runFfmpeg)
    expect(await loadFilmstrip(project(), dir, run)).toEqual(strip)
    expect(run).not.toHaveBeenCalled()

    // Mất file ảnh thì tạo lại.
    await rm(join(dir, 'filmstrip-1.jpg'))
    await loadFilmstrip(project(), dir, run)
    expect(run).toHaveBeenCalled()
  }, 60_000)

  it('không có video màn hình thì null', async () => {
    const p = project()
    p.segments = p.segments.map((s) => ({ ...s, tracks: {} }))
    expect(await loadFilmstrip(p, dir, runFfmpeg)).toBeNull()
  })
})
