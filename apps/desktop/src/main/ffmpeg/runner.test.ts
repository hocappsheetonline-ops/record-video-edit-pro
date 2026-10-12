import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDurationMs } from './parse'
import { launchCapture, runFfmpeg } from './runner'

// Test này chạy ffmpeg thật (ảnh test tổng hợp, không cần màn hình) để chắc chắn
// việc khởi động, dừng bằng "q" và đóng file hoạt động trên mọi hệ điều hành.
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-ffmpeg-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const testSource = ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30']

describe('ffmpeg thật', () => {
  it('quay rồi dừng an toàn, file có thời lượng', async () => {
    const out = join(dir, 'out.mkv')
    const capture = launchCapture([
      '-hide_banner',
      ...testSource,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'matroska',
      '-y',
      out,
    ])
    const startedAt = await capture.started
    expect(Math.abs(Date.now() - startedAt)).toBeLessThan(5000)
    await new Promise((r) => setTimeout(r, 1200))
    const result = await capture.stop()
    expect(result.code).toBe(0)
    expect((await stat(out)).size).toBeGreaterThan(1000)

    const probe = await runFfmpeg(['-hide_banner', '-i', out])
    expect(parseDurationMs(probe.stderr)).toBeGreaterThan(500)
  }, 20_000)

  it('báo lỗi khi ffmpeg không mở được nguồn', async () => {
    const capture = launchCapture([
      '-hide_banner',
      '-f',
      'lavfi',
      '-i',
      'khong_ton_tai',
      '-f',
      'null',
      '-',
    ])
    await expect(capture.started).rejects.toThrow(/ffmpeg đã thoát/)
  })

  it('gọi listener khi ffmpeg tự thoát giữa chừng', async () => {
    const capture = launchCapture([
      '-hide_banner',
      ...testSource,
      '-frames:v',
      '5',
      '-f',
      'null',
      '-',
    ])
    const exited = new Promise((resolve) => capture.onUnexpectedExit(resolve))
    await expect(exited).resolves.toMatchObject({ code: 0 })
  })
})
