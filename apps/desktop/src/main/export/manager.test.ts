import { readdir, readFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultEdit, type Project } from '@lumora/core'
import { parseDurationMs } from '../ffmpeg/parse'
import { runFfmpeg } from '../ffmpeg/runner'
import { ExportManager, safeFileName } from './manager'

// Dùng ffmpeg thật để chắc chắn lệnh ghép âm thanh chạy đúng.
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-export-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const project: Project = {
  version: 1,
  id: 'p',
  name: 'Demo',
  createdAt: '2026-01-01T00:00:00.000Z',
  source: {
    kind: 'display',
    name: 'A',
    captureRect: { x: 0, y: 0, width: 320, height: 240 },
    scaleFactor: 1,
  },
  engine: 'ffmpeg',
  encoder: 'libx264',
  fps: 30,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 0,
      endedAt: 4000,
      tracks: { mic: { file: 'seg0-mic.webm', startedAt: 0 } },
    },
  ],
  hasEvents: false,
  inputMode: null,
  durationMs: 4000,
}

async function ffmpeg(args: string[]) {
  const r = await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...args])
  if (r.code !== 0) throw new Error(r.stderr)
}

describe('ExportManager', () => {
  it('ghi video theo vị trí, ghép âm thanh theo clip, đúng thời lượng', async () => {
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4',
      '-c:a',
      'libopus',
      join(dir, 'seg0-mic.webm'),
    ])
    const rendered = join(dir, 'rendered.mp4')
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30:duration=3',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      rendered,
    ])
    const bytes = await readFile(rendered)

    const manager = new ExportManager(runFfmpeg)
    const id = await manager.start(dir)
    // Ghi phần sau trước để kiểm tra ghi theo vị trí.
    const half = Math.floor(bytes.length / 2)
    await manager.write(id, half, bytes.subarray(half))
    await manager.write(id, 0, bytes.subarray(0, half))

    const edit = createDefaultEdit(project)
    // Cắt bỏ 1 giây giữa: còn 0-1s và 2-4s → 3 giây.
    edit.clips = [
      { id: 'a', sourceStart: 0, sourceEnd: 1000, speed: 1 },
      { id: 'b', sourceStart: 2000, sourceEnd: 4000, speed: 1 },
    ]
    const result = await manager.finish(id, project, edit, dir, 'Demo: video/1')
    expect(result.fileName).toMatch(/^Demo video1 \d{4}-\d{2}-\d{2}/)
    const probe = await runFfmpeg(['-hide_banner', '-i', result.path])
    expect(probe.stderr).toMatch(/Audio: aac/)
    expect(probe.stderr).toMatch(/Video: h264/)
    expect(parseDurationMs(probe.stderr)).toBeGreaterThan(2900)
    expect(parseDurationMs(probe.stderr)).toBeLessThan(3200)
    // Không để lại file tạm.
    expect((await readdir(join(dir, 'exports'))).filter((f) => f.startsWith('.'))).toEqual([])
  }, 60_000)

  it('xuất GIF', async () => {
    const rendered = join(dir, 'rendered.mp4')
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30:duration=1',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      rendered,
    ])
    const manager = new ExportManager(runFfmpeg)
    const id = await manager.start(dir)
    await manager.write(id, 0, await readFile(rendered))
    const edit = createDefaultEdit({
      ...project,
      segments: [{ ...project.segments[0]!, endedAt: 1000, tracks: {} }],
    })
    edit.export.format = 'gif'
    const result = await manager.finish(
      id,
      { ...project, segments: [{ ...project.segments[0]!, endedAt: 1000, tracks: {} }] },
      edit,
      dir,
      'Gif',
    )
    expect(result.fileName.endsWith('.gif')).toBe(true)
    const head = (await readFile(result.path)).subarray(0, 6).toString('ascii')
    expect(head).toBe('GIF89a')
    expect((await readdir(join(dir, 'exports'))).filter((f) => f.endsWith('.mp4'))).toEqual([])
  }, 60_000)

  it('hủy thì xóa file tạm; phiên không tồn tại thì báo lỗi', async () => {
    const manager = new ExportManager(runFfmpeg)
    const id = await manager.start(dir)
    await manager.cancel(id)
    expect(await readdir(join(dir, 'exports'))).toEqual([])
    await expect(manager.write(id, 0, new Uint8Array(1))).rejects.toThrow(/không tồn tại/)
  })

  it('safeFileName bỏ ký tự cấm của Windows', () => {
    expect(safeFileName('a<b>:c"d/e\\f|g?h*')).toBe('abcdefgh')
    expect(safeFileName('   ')).toBe('Lumora')
  })
})
