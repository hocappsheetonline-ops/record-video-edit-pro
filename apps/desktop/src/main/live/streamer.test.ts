import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildLiveArgs } from '../ffmpeg/args'
import { ffmpegPath } from '../ffmpeg/binary'
import { parseDurationMs } from '../ffmpeg/parse'
import { runFfmpeg } from '../ffmpeg/runner'
import { failedDestination, LiveStreamer, parseStats, type DestinationState } from './streamer'

describe('đọc log ffmpeg', () => {
  it('thống kê khi đang phát', () => {
    expect(
      parseStats(
        'frame=  120 fps= 30 q=21.0 size=     512KiB time=00:00:04.00 bitrate=1048.6kbits/s speed=1x',
        30,
      ),
    ).toEqual({
      seconds: 4,
      bitrate: 1048.6,
      fps: 30,
    })
    // Muxer tee không báo thời gian: tính từ số khung hình.
    expect(
      parseStats('frame=   90 fps= 30 q=21.0 size=N/A time=N/A bitrate=N/A speed=1x', 30),
    ).toEqual({ seconds: 3, bitrate: 0, fps: 30 })
    expect(parseStats('Input #0, matroska', 30)).toBeNull()
  })

  it('nhận ra đích nào bị lỗi', () => {
    const urls = ['rtmp://a.rtmp.youtube.com/live2/k1', 'rtmp://127.0.0.1:1935/live/k2']
    expect(
      failedDestination(
        '[tee @ 0x1] Slave rtmp://127.0.0.1:1935/live/k2: Connection refused',
        urls,
      ),
    ).toBe(1)
    expect(failedDestination('rtmp://a.rtmp.youtube.com/live2/k1: Input/output error', urls)).toBe(
      0,
    )
    expect(failedDestination('Stream mapping:', urls)).toBe(-1)
  })
})

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-live-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('LiveStreamer (ffmpeg thật)', () => {
  it('phát tới máy chủ RTMP và ghi file cùng lúc, dừng gọn gàng', async () => {
    // Nguồn WebM giống MediaRecorder: hình test + âm thanh sine.
    const source = join(dir, 'source.webm')
    const made = await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x360:rate=30:duration=4',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=500:duration=4',
      '-c:v',
      'libvpx',
      '-deadline',
      'realtime',
      '-b:v',
      '1M',
      '-c:a',
      'libopus',
      source,
    ])
    expect(made.code).toBe(0)

    // ffmpeg đóng vai máy chủ RTMP (giống YouTube) để nhận luồng phát.
    const port = await freePort()
    const received = join(dir, 'received.flv')
    const server = spawn(ffmpegPath(), [
      '-hide_banner',
      '-loglevel',
      'error',
      '-listen',
      '1',
      '-timeout',
      '20',
      '-i',
      `rtmp://127.0.0.1:${port}/live/key1`,
      '-c',
      'copy',
      '-y',
      received,
    ])
    const serverDone = new Promise((resolve) => server.on('close', resolve))
    await new Promise((r) => setTimeout(r, 800))

    const states: Record<string, DestinationState[]> = {}
    let lastSeconds = 0
    const url = `rtmp://127.0.0.1:${port}/live/key1`
    const recording = join(dir, 'live.mkv')
    const streamer = new LiveStreamer([{ id: 'local-rtmp', url }], {
      onStats: (s) => (lastSeconds = s.seconds),
      onDestination: (id, state) => (states[id] ??= []).push(state),
      onExit: () => undefined,
    })
    streamer.start(
      buildLiveArgs(
        [
          { kind: 'rtmp', url },
          { kind: 'file', path: recording },
        ],
        { encoder: 'libx264', fps: 30, videoBitrate: 1500, audioBitrate: 128 },
      ),
    )
    // Gửi dữ liệu theo từng phần như MediaRecorder.
    const bytes = await readFile(source)
    for (let i = 0; i < bytes.length; i += 32_000) {
      await streamer.write(bytes.subarray(i, i + 32_000))
      await new Promise((r) => setTimeout(r, 20))
    }
    await streamer.stop()
    await serverDone

    expect(states['local-rtmp']).toEqual(['connecting', 'live'])
    expect(lastSeconds).toBeGreaterThan(2)
    for (const file of [received, recording]) {
      expect((await stat(file)).size).toBeGreaterThan(10_000)
      const probe = await runFfmpeg(['-hide_banner', '-i', file])
      expect(probe.stderr).toMatch(/Video: h264/)
      expect(probe.stderr).toMatch(/Audio: aac/)
      expect(parseDurationMs(probe.stderr)).toBeGreaterThan(3000)
    }
  }, 60_000)
})
