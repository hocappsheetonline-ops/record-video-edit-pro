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

  it('nhạc nền lặp lại có fade vào/ra và hiệu ứng âm thanh được trộn đúng vị trí', async () => {
    const rendered = join(dir, 'rendered.mp4')
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30:duration=6',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      rendered,
    ])
    // Nhạc chỉ dài 1 giây → phải lặp để phủ 4 giây (từ 1s đến 5s).
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=500:duration=1',
      '-c:a',
      'aac',
      join(dir, 'asset-song.m4a'),
    ])
    const silent: Project = {
      ...project,
      segments: [{ index: 0, startedAt: 0, endedAt: 6000, tracks: {} }],
      durationMs: 6000,
    }
    const manager = new ExportManager(runFfmpeg)
    const id = await manager.start(dir)
    await manager.write(id, 0, await readFile(rendered))
    const edit = createDefaultEdit(silent)
    edit.audioClips = [
      {
        id: 'm',
        file: 'asset-song.m4a',
        name: 'Song',
        kind: 'music',
        start: 1000,
        offset: 0,
        duration: 4000,
        sourceDuration: 1000,
        volume: 1,
        fadeIn: 1000,
        fadeOut: 1000,
        loop: true,
      },
    ]
    const result = await manager.finish(id, silent, edit, dir, 'Music')

    /** Âm lượng trung bình (dB) trong khoảng [from, from + len] giây. */
    const loudness = async (from: number, len: number) => {
      const r = await runFfmpeg([
        '-hide_banner',
        '-ss',
        String(from),
        '-t',
        String(len),
        '-i',
        result.path,
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
      ])
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -100)
    }
    const before = await loudness(0.2, 0.6)
    const fadingIn = await loudness(1.05, 0.15)
    const full = await loudness(2.6, 0.8)
    const fadingOut = await loudness(4.8, 0.15)
    const after = await loudness(5.3, 0.5)
    expect(before).toBeLessThan(-60)
    expect(after).toBeLessThan(-60)
    // Sau 1 giây (hết file) vẫn có tiếng nhờ lặp lại.
    expect(full).toBeGreaterThan(-25)
    expect(fadingIn).toBeLessThan(full - 6)
    expect(fadingOut).toBeLessThan(full - 6)
  }, 60_000)

  it('tiếng của video meme được trộn đúng đoạn (bỏ phần đã cắt đầu, dừng khi hết lớp)', async () => {
    const rendered = join(dir, 'rendered.mp4')
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30:duration=5',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      rendered,
    ])
    // Video meme 3 giây: 1 giây đầu im lặng, sau đó có tiếng.
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x90:rate=30:duration=3',
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=if(gt(t\\,1)\\,0.5*sin(2*PI*440*t)\\,0):s=48000:d=3',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      join(dir, 'asset-meme.mp4'),
    ])
    const silent: Project = {
      ...project,
      segments: [{ index: 0, startedAt: 0, endedAt: 5000, tracks: {} }],
      durationMs: 5000,
    }
    const manager = new ExportManager(runFfmpeg)
    const id = await manager.start(dir)
    await manager.write(id, 0, await readFile(rendered))
    const edit = createDefaultEdit(silent)
    // Hiện từ 2s tới 3.5s, bắt đầu từ giây thứ 1 của video meme (đúng chỗ có tiếng).
    edit.overlays = [
      {
        id: 'v',
        kind: 'video',
        start: 2000,
        end: 3500,
        x: 0.5,
        y: 0.5,
        size: 0.4,
        rotation: 0,
        animation: 'none',
        text: 'Bruh',
        style: 'meme',
        color: '#ffffff',
        file: 'asset-meme.mp4',
        aspect: 16 / 9,
        mediaOffset: 1000,
        sourceDuration: 3000,
        hasAudio: true,
        volume: 1,
        keyColor: '',
        keyStrength: 0.4,
      },
    ]
    const result = await manager.finish(id, silent, edit, dir, 'Meme')
    const loudness = async (from: number, len: number) => {
      const r = await runFfmpeg([
        '-hide_banner',
        '-ss',
        String(from),
        '-t',
        String(len),
        '-i',
        result.path,
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
      ])
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -100)
    }
    expect(await loudness(0.3, 1.4)).toBeLessThan(-60)
    expect(await loudness(2.2, 1)).toBeGreaterThan(-20)
    expect(await loudness(3.7, 1)).toBeLessThan(-60)
    // Không có tiếng (hasAudio false) thì bỏ qua, xuất vẫn chạy.
    const id2 = await manager.start(dir)
    await manager.write(id2, 0, await readFile(rendered))
    edit.overlays = [{ ...edit.overlays[0]!, hasAudio: false }]
    const muted = await manager.finish(id2, silent, edit, dir, 'Meme2')
    const probe = await runFfmpeg(['-hide_banner', '-i', muted.path])
    expect(probe.stderr).not.toMatch(/Audio:/)
  }, 60_000)

  it('hai clip liền nhau cùng lấy từ một file micro (tách clip): ghép xong, không bị treo', async () => {
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
      'testsrc=size=320x240:rate=30:duration=4',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      rendered,
    ])
    const manager = new ExportManager((args, timeout) =>
      runFfmpeg(args, Math.min(timeout ?? 30_000, 20_000)),
    )
    const id = await manager.start(dir)
    await manager.write(id, 0, await readFile(rendered))
    const edit = createDefaultEdit(project)
    edit.clips = [
      { id: 'a', sourceStart: 0, sourceEnd: 2000, speed: 1 },
      { id: 'b', sourceStart: 2000, sourceEnd: 4000, speed: 1 },
    ]
    const started = Date.now()
    const result = await manager.finish(id, project, edit, dir, 'Split')
    expect(Date.now() - started).toBeLessThan(15_000)
    const probe = await runFfmpeg(['-hide_banner', '-i', result.path])
    expect(parseDurationMs(probe.stderr)).toBeGreaterThan(3900)
    expect(parseDurationMs(probe.stderr)).toBeLessThan(4200)
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
