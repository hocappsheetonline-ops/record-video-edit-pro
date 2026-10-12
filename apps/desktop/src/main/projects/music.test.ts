import { existsSync } from 'node:fs'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runFfmpeg } from '../ffmpeg/runner'
import { cleanName, MusicLibrary, recentDownloads } from './music'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-music-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function makeAudio(name: string, seconds = 1.2) {
  const path = join(dir, name)
  const r = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    path,
  ])
  expect(r.code).toBe(0)
  return path
}

describe('MusicLibrary', () => {
  it('thêm bài (tên sạch, độ dài, nguồn), liệt kê mới nhất trước, dùng trong dự án, xóa', async () => {
    const lib = new MusicLibrary(join(dir, 'music'), runFfmpeg)
    const a = await makeAudio('Sunny_Day (1).mp3')
    const b = await makeAudio('beat.wav', 0.8)
    let t = 1000
    await lib.add([a], 'youtube', () => t++)
    const list = await lib.add([b], 'file', () => t++)
    expect(list.map((x) => [x.name, x.source])).toEqual([
      ['beat', 'file'],
      ['Sunny Day', 'youtube'],
    ])
    expect(list[1]!.durationMs).toBeGreaterThan(1000)
    expect(list[1]!.file).toMatch(/^music-[0-9a-f]{12}\.mp3$/)

    const project = join(dir, 'project')
    await rm(project, { recursive: true, force: true })
    await (await import('node:fs/promises')).mkdir(project)
    const asset = await lib.useInProject(list[1]!.file, project)
    expect(asset).toMatchObject({ name: 'Sunny Day', file: `asset-${list[1]!.file}` })
    expect(existsSync(join(project, asset.file))).toBe(true)
    // Dùng lại không chép lần hai, bài không tồn tại báo lỗi.
    expect((await lib.useInProject(list[1]!.file, project)).file).toBe(asset.file)
    await expect(lib.useInProject('music-nope.mp3', project)).rejects.toThrow('music_missing')

    const after = await lib.remove(list[1]!.file)
    expect(after).toHaveLength(1)
    expect(existsSync(join(dir, 'music', list[1]!.file))).toBe(false)
  }, 30_000)

  it('từ chối file không phải nhạc hoặc không đọc được, giữ các bài đã thêm trước đó', async () => {
    const lib = new MusicLibrary(join(dir, 'music'), runFfmpeg)
    const ok = await makeAudio('ok.mp3')
    await writeFile(join(dir, 'bad.mp3'), 'not audio')
    await expect(lib.add([ok, join(dir, 'bad.mp3')])).rejects.toThrow('audio_unreadable')
    expect(await lib.list()).toHaveLength(1)
    await expect(lib.add([join(dir, 'x.txt')])).rejects.toThrow('audio_unsupported')
    await expect(lib.add(['relative.mp3'])).rejects.toThrow('audio_unsupported')
  }, 30_000)
})

describe('recentDownloads', () => {
  it('chỉ file nhạc mới, mới nhất trước, bỏ file rỗng và file cũ', async () => {
    const now = 1_700_000_000_000
    await writeFile(join(dir, 'Track One.mp3'), 'x'.repeat(10))
    await writeFile(join(dir, 'older.m4a'), 'x')
    await writeFile(join(dir, 'empty.mp3'), '')
    await writeFile(join(dir, 'video.mp4'), 'x')
    await writeFile(join(dir, 'ancient.wav'), 'x')
    await utimes(join(dir, 'Track One.mp3'), now / 1000, now / 1000)
    await utimes(join(dir, 'older.m4a'), (now - 60_000) / 1000, (now - 60_000) / 1000)
    await utimes(join(dir, 'empty.mp3'), now / 1000, now / 1000)
    await utimes(join(dir, 'video.mp4'), now / 1000, now / 1000)
    await utimes(
      join(dir, 'ancient.wav'),
      (now - 48 * 3_600_000) / 1000,
      (now - 48 * 3_600_000) / 1000,
    )
    const list = await recentDownloads(dir, { now: () => now })
    expect(list.map((d) => d.name)).toEqual(['Track One', 'older'])
    expect(list[0]).toMatchObject({ path: join(dir, 'Track One.mp3'), bytes: 10 })
    expect(await recentDownloads(join(dir, 'missing'))).toEqual([])
  })

  it('tên bài sạch: bỏ số tải trùng và gạch dưới', () => {
    expect(cleanName('Happy_Ukulele (2)')).toBe('Happy Ukulele')
    expect(cleanName('(3)')).toBe('(3)')
  })
})
