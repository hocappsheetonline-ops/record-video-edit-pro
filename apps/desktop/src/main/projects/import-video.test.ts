import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseProject, PROJECT_VERSION, type Project } from '@lumora/core'
import { parseDurationMs, parseInputResolution } from '../ffmpeg/parse'
import { runFfmpeg } from '../ffmpeg/runner'
import { importVideoSegment, mergeProject } from './import-video'

let dir: string
const T0 = 1_700_000_000_000

const project = (): Project => ({
  version: PROJECT_VERSION,
  id: 'p',
  name: 'Demo',
  createdAt: new Date(T0).toISOString(),
  source: { kind: 'display', name: 'Màn hình', captureRect: null, scaleFactor: 1 },
  engine: 'ffmpeg',
  encoder: 'libx264',
  fps: 30,
  cursorHidden: false,
  segments: [
    {
      index: 0,
      startedAt: T0,
      endedAt: T0 + 3000,
      tracks: { screen: { file: 'seg0-screen.mp4', startedAt: T0 } },
    },
  ],
  hasEvents: false,
  inputMode: null,
  durationMs: 3000,
})

async function make(name: string, args: string[]) {
  const r = await runFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-y', ...args, join(dir, name)],
    60_000,
  )
  expect(r.code).toBe(0)
  return join(dir, name)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-import-'))
  writeFileSync(join(dir, 'waveform.json'), '{}')
  writeFileSync(join(dir, 'filmstrip.json'), '{}')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('nhập video ngoài làm clip chính', () => {
  it('webm có tiếng → mp4 H.264 + track âm thanh, đoạn mới nối sau đoạn cũ, ghi project.json', async () => {
    const src = await make('in.webm', [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=640x360:r=25:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:d=2',
      '-c:v',
      'libvpx-vp9',
      '-deadline',
      'realtime',
      '-c:a',
      'libopus',
      '-shortest',
    ])
    const next = await importVideoSegment(dir, project(), src, runFfmpeg)
    const seg = next.segments[1]!
    expect(seg).toMatchObject({ index: 1, kind: 'imported', startedAt: T0 + 4000 })
    expect(seg.endedAt - seg.startedAt).toBeGreaterThan(1900)
    expect(seg.endedAt - seg.startedAt).toBeLessThan(2200)
    expect(seg.tracks.screen?.file).toBe('import1-screen.mp4')
    expect(seg.tracks.system?.file).toBe('import1-system.m4a')
    expect(next.durationMs).toBe(3000 + seg.endedAt - seg.startedAt)
    const v = await runFfmpeg(['-hide_banner', '-i', join(dir, 'import1-screen.mp4')])
    expect(v.stderr).toMatch(/Video: h264/)
    expect(v.stderr).not.toMatch(/Audio:/)
    expect(v.stderr).toMatch(/30 fps/)
    const a = await runFfmpeg(['-hide_banner', '-i', join(dir, 'import1-system.m4a')])
    expect(a.stderr).toMatch(/Audio: aac/)
    expect(parseDurationMs(a.stderr)).toBeGreaterThan(1900)
    // Lưu xuống đĩa, đọc lại đúng; bộ nhớ đệm dạng sóng / dải phim bị xóa để tạo lại.
    const saved = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')))
    expect(saved?.segments[1]).toEqual(seg)
    expect(existsSync(join(dir, 'waveform.json'))).toBe(false)
    expect(existsSync(join(dir, 'filmstrip.json'))).toBe(false)
  }, 60_000)

  it('video 1440p không tiếng → thu về 1080p, không có track âm thanh; file không phải video thì báo lỗi', async () => {
    const src = await make('big.mp4', [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=2560x1440:r=30:d=1',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
    ])
    const next = await importVideoSegment(dir, project(), src, runFfmpeg)
    expect(next.segments[1]!.tracks.system).toBeUndefined()
    const v = await runFfmpeg(['-hide_banner', '-i', join(dir, 'import1-screen.mp4')])
    expect(parseInputResolution(v.stderr)).toEqual({ width: 1920, height: 1080 })

    const wav = await make('a.wav', ['-f', 'lavfi', '-i', 'sine=d=1'])
    await expect(importVideoSegment(dir, project(), wav, runFfmpeg)).rejects.toThrow(
      'import_no_video',
    )
    await expect(
      importVideoSegment(dir, project(), join(dir, 'missing.mp4'), runFfmpeg),
    ).rejects.toThrow('import_no_video')
  }, 60_000)
})

describe('ghép bản quay khác', () => {
  const other = (rect: Project['source']['captureRect']): Project => ({
    ...project(),
    id: 'q',
    source: { kind: 'display', name: 'x', captureRect: rect, scaleFactor: 1 },
    hasEvents: true,
    segments: [
      {
        index: 0,
        startedAt: 50_000,
        endedAt: 52_000,
        tracks: {
          screen: { file: 'seg0-screen.mp4', startedAt: 50_000 },
          mic: { file: 'seg0-mic.webm', startedAt: 50_100 },
        },
      },
    ],
    durationMs: 2000,
  })

  async function otherDir() {
    const d = await mkdtemp(join(tmpdir(), 'lumora-other-'))
    writeFileSync(join(d, 'seg0-screen.mp4'), 'video')
    writeFileSync(join(d, 'seg0-mic.webm'), 'mic')
    writeFileSync(
      join(d, 'events.jsonl'),
      `${JSON.stringify({ type: 'move', t: 50_500, x: 10, y: 20 })}\nhỏng\n`,
    )
    return d
  }

  it('cùng vùng quay: chép file, dời thời gian, ghép cả sự kiện chuột', async () => {
    const rect = { x: 0, y: 0, width: 1920, height: 1080 }
    const base = { ...project(), source: { ...project().source, captureRect: rect } }
    writeFileSync(
      join(dir, 'events.jsonl'),
      `${JSON.stringify({ type: 'move', t: T0 + 10, x: 1, y: 1 })}\n`,
    )
    const od = await otherDir()
    try {
      const next = await mergeProject(dir, base, od, other(rect))
      const seg = next.segments[1]!
      // Nối sau đoạn cuối (T0 + 3000) cách 1 giây.
      expect(seg).toMatchObject({ index: 1, startedAt: T0 + 4000, endedAt: T0 + 6000 })
      expect(seg.kind).toBeUndefined()
      expect(seg.tracks).toEqual({
        screen: { file: 'merge1-screen.mp4', startedAt: T0 + 4000 },
        mic: { file: 'merge1-mic.webm', startedAt: T0 + 4100 },
      })
      expect(readFileSync(join(dir, 'merge1-mic.webm'), 'utf8')).toBe('mic')
      const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n')
      expect(events).toHaveLength(2)
      expect(JSON.parse(events[1]!)).toMatchObject({ t: T0 + 4500, x: 10 })
      expect(next).toMatchObject({ durationMs: 5000, hasEvents: true })
    } finally {
      await rm(od, { recursive: true, force: true })
    }
  })

  it('khác vùng quay: đoạn ghép không có con trỏ (không ghép sự kiện)', async () => {
    const od = await otherDir()
    try {
      const next = await mergeProject(
        dir,
        project(),
        od,
        other({ x: 5, y: 5, width: 800, height: 600 }),
      )
      expect(next.segments[1]!.kind).toBe('imported')
      expect(existsSync(join(dir, 'events.jsonl'))).toBe(false)
    } finally {
      await rm(od, { recursive: true, force: true })
    }
  })
})
