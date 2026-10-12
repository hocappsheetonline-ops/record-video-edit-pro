import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFfmpeg } from '../ffmpeg/runner'
import { assetPeaks, createSoundEffect, importAudioFile, SOUND_EFFECT_IDS } from './assets'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-assets-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('hiệu ứng âm thanh có sẵn (ffmpeg thật)', () => {
  it.each(SOUND_EFFECT_IDS)(
    '%s: tạo được file có tiếng, độ dài hợp lý',
    async (id) => {
      const asset = await createSoundEffect(id, dir, runFfmpeg)
      expect(asset.file).toBe(`asset-sfx-${id}.m4a`)
      expect(asset.durationMs).toBeGreaterThan(50)
      expect(asset.durationMs).toBeLessThan(4000)
      const peaks = (await assetPeaks(dir, asset.file, runFfmpeg))!
      expect(Math.max(...peaks.peaks)).toBeGreaterThan(20)
    },
    30_000,
  )

  it('đã có file thì không tạo lại; mã lạ thì báo lỗi', async () => {
    await createSoundEffect('pop', dir, runFfmpeg)
    const run = vi.fn(runFfmpeg)
    await createSoundEffect('pop', dir, run)
    // Chỉ đọc độ dài, không tổng hợp lại.
    expect(run).toHaveBeenCalledTimes(1)
    await expect(createSoundEffect('nope', dir, runFfmpeg)).rejects.toThrow('sfx_unknown')
  })
})

describe('thêm nhạc từ máy', () => {
  it('sao chép vào dự án với tên an toàn, đọc độ dài', async () => {
    const song = join(dir, 'Bài hát của tôi.mp3')
    const made = await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=330:duration=3',
      song,
    ])
    expect(made.code).toBe(0)
    const project = join(dir, 'p')
    await rm(project, { recursive: true, force: true })
    await import('node:fs/promises').then((fs) => fs.mkdir(project))
    const asset = await importAudioFile(song, project, runFfmpeg)
    expect(asset.file).toMatch(/^asset-[0-9a-f]{12}\.mp3$/)
    expect(asset.name).toBe('Bài hát của tôi')
    expect(asset.durationMs).toBeGreaterThan(2900)
    expect((await stat(join(project, asset.file))).size).toBeGreaterThan(1000)
  })

  it('từ chối đuôi không hỗ trợ và file không có âm thanh', async () => {
    await writeFile(join(dir, 'x.exe'), 'x')
    await expect(importAudioFile(join(dir, 'x.exe'), dir, runFfmpeg)).rejects.toThrow(
      'audio_unsupported',
    )
    await writeFile(join(dir, 'fake.mp3'), 'not audio')
    await expect(importAudioFile(join(dir, 'fake.mp3'), dir, runFfmpeg)).rejects.toThrow(
      'audio_unreadable',
    )
  })

  it('dạng sóng: chỉ nhận file asset-, có lưu đệm', async () => {
    await expect(assetPeaks(dir, '../secret.mp3', runFfmpeg)).rejects.toThrow()
    await createSoundEffect('ding', dir, runFfmpeg)
    const first = await assetPeaks(dir, 'asset-sfx-ding.m4a', runFfmpeg)
    const run = vi.fn(runFfmpeg)
    expect(await assetPeaks(dir, 'asset-sfx-ding.m4a', run)).toEqual(first)
    expect(run).not.toHaveBeenCalled()
  })
})
