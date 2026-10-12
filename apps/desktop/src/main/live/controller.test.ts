import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '@lumora/core'
import { EVENTS, type LiveEnded } from '@shared/ipc'
import { runFfmpeg } from '../ffmpeg/runner'
import { Vault } from '../vault'
import { LiveController } from './controller'
import type { SignalingServer } from './signaling'

const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
  decryptString: (data: Buffer) => data.toString('utf8'),
}

let dir: string
let sent: { channel: string; payload: unknown }[]
let live: LiveController

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-live-ctl-'))
  sent = []
  live = new LiveController({
    configPath: join(dir, 'live.json'),
    vault: new Vault(join(dir, 'vault.json'), cipher),
    signaling: {} as SignalingServer,
    projectsDir: async () => dir,
    encoder: async () => 'libx264',
    run: runFfmpeg,
    send: (channel, payload) => sent.push({ channel, payload }),
    elevenLabsKey: async () => undefined,
  })
})
afterEach(async () => {
  await live.stop()
  await rm(dir, { recursive: true, force: true })
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

/** Nguồn WebM giống MediaRecorder: hình test + âm thanh sine. */
async function makeSource(seconds: number): Promise<Buffer> {
  const file = join(dir, 'source.webm')
  const made = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=640x360:rate=30:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=500:duration=${seconds}`,
    '-c:v',
    'libvpx',
    '-deadline',
    'realtime',
    '-b:v',
    '1M',
    '-c:a',
    'libopus',
    file,
  ])
  expect(made.code).toBe(0)
  return readFile(file)
}

async function feed(bytes: Buffer) {
  for (let i = 0; i < bytes.length; i += 32_000) {
    await live.write(bytes.subarray(i, i + 32_000))
    await new Promise((r) => setTimeout(r, 15))
  }
}

describe('LiveController', () => {
  it('lưu cấu hình và cho biết kênh nào đã có stream key (không lộ key)', async () => {
    const config = await live.updateConfig({
      destinations: [
        {
          id: 'yt',
          platform: 'youtube',
          name: 'Kênh YT',
          server: 'rtmp://a.rtmp.youtube.com/live2',
          enabled: true,
        },
      ],
      resolution: 1080,
    })
    expect(config.resolution).toBe(1080)
    expect((await live.secrets()).streamKeys).toEqual({ yt: false })
    await live.setSecret('stream:yt', 'abcd-1234')
    const status = await live.secrets()
    expect(status.streamKeys).toEqual({ yt: true })
    expect(JSON.stringify(status)).not.toContain('abcd-1234')
  })

  it('báo lỗi rõ ràng khi thiếu stream key hoặc không có đầu ra', async () => {
    await live.updateConfig({
      destinations: [
        {
          id: 'fb',
          platform: 'facebook',
          name: 'Trang FB',
          server: 'rtmps://live-api-s.facebook.com:443/rtmp',
          enabled: true,
        },
      ],
      recordLocally: false,
    })
    await expect(live.start({ width: 1280, height: 720, fps: 30 })).rejects.toThrow(
      'missing_stream_key:Trang FB',
    )
    await live.updateConfig({ destinations: [] })
    await expect(live.start({ width: 1280, height: 720, fps: 30 })).rejects.toThrow('no_outputs')
  })

  it('chỉ ghi trong máy: kết thúc thì tạo dự án có thể chỉnh sửa', async () => {
    await live.updateConfig({ destinations: [], recordLocally: true })
    await live.start({ width: 640, height: 360, fps: 30 })
    await expect(live.start({ width: 640, height: 360, fps: 30 })).rejects.toThrow('already_live')
    await feed(await makeSource(3))
    const ended = await live.stop()

    expect(ended.error).toBeNull()
    expect(ended.folder).toMatch(/^Live .*\.lumora$/)
    const projectDir = join(dir, ended.folder!)
    const project = JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8')) as Project
    expect(project.durationMs).toBeGreaterThan(2500)
    expect(project.segments[0]!.tracks.screen?.file).toBe('live.mkv')
    expect((await stat(join(projectDir, 'thumbnail.jpg'))).size).toBeGreaterThan(1000)
    expect(sent.filter((e) => e.channel === EVENTS.liveEnded)).toHaveLength(1)
  }, 60_000)

  it('máy chủ RTMP không kết nối được: tự dừng và báo lỗi cho giao diện', async () => {
    const port = await freePort()
    await live.updateConfig({
      destinations: [
        {
          id: 'c1',
          platform: 'custom',
          name: 'Hỏng',
          server: `rtmp://127.0.0.1:${port}/live`,
          enabled: true,
        },
      ],
      recordLocally: false,
    })
    await live.setSecret('stream:c1', 'k')
    await live.start({ width: 640, height: 360, fps: 30 })
    await feed(await makeSource(2))
    await expect
      .poll(() => sent.find((e) => e.channel === EVENTS.liveEnded)?.payload, { timeout: 20_000 })
      .toBeTruthy()
    const ended = sent.find((e) => e.channel === EVENTS.liveEnded)!.payload as LiveEnded
    expect(ended.error).toMatch(/Connection refused|error/i)
    expect(ended.error).not.toContain('/live/k ')
    expect(ended.folder).toBeNull()
    expect(live.isLive).toBe(false)
  }, 60_000)
})
