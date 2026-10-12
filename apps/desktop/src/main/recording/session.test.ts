import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProject } from '@lumora/core'
import { RecordingSession, type SessionDeps, type SessionMeta } from './session'

let dir: string
let clock: number

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-session-'))
  clock = 1_000
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const meta = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  id: 'p1',
  name: 'Demo',
  createdAt: '2026-10-12T00:00:00.000Z',
  source: {
    kind: 'display',
    name: 'Màn hình 1',
    captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  },
  engine: 'ffmpeg',
  encoder: 'libx264',
  fps: 60,
  cursorHidden: true,
  rendererTracks: ['camera', 'mic'],
  ...overrides,
})

function makeDeps(overrides: Partial<SessionDeps> = {}) {
  const screenStops: number[] = []
  const tracker = {
    mode: 'hook' as const,
    start: vi.fn(async (file: string) => void (await writeFile(file, ''))),
    stop: vi.fn(async () => {}),
  }
  const deps: SessionDeps = {
    dir,
    now: () => (clock += 100),
    startScreen: vi.fn(async (path: string) => {
      await writeFile(path, 'screen-data')
      return { startedAt: clock + 5, stop: async () => void screenStops.push(clock) }
    }),
    tracker,
    remux: vi.fn(async (input: string, output: string) => {
      await writeFile(output, await readFile(input))
    }),
    thumbnail: vi.fn(async (_input: string, output: string) => writeFile(output, 'jpg')),
    ...overrides,
  }
  return { deps, tracker, screenStops }
}

const bytes = (s: string) => new TextEncoder().encode(s)

describe('RecordingSession', () => {
  it('quay một đoạn: màn hình bằng ffmpeg, webcam và micro từ giao diện', async () => {
    const { deps, tracker } = makeDeps()
    const session = new RecordingSession(meta(), deps)

    const seg = await session.beginSegment()
    expect(seg).toEqual({ index: 0, rendererTracks: ['camera', 'mic'] })
    expect(tracker.start).toHaveBeenCalledWith(join(dir, 'events.jsonl'))

    await session.trackStarted(0, 'camera', 1_150)
    await session.trackStarted(0, 'mic', 1_140)
    await session.writeChunk(0, 'camera', bytes('cam-1'))
    await session.writeChunk(0, 'camera', bytes('cam-2'))
    await session.writeChunk(0, 'mic', bytes('mic-1'))

    const project = await session.finish()
    expect(tracker.stop).toHaveBeenCalled()
    expect(project.segments).toEqual([
      {
        index: 0,
        startedAt: 1_100,
        endedAt: 1_200,
        tracks: {
          screen: { file: 'seg0-screen.mkv', startedAt: 1_105 },
          camera: { file: 'seg0-camera.mkv', startedAt: 1_150 },
          mic: { file: 'seg0-mic.webm', startedAt: 1_140 },
        },
      },
    ])
    expect(project.durationMs).toBe(100)
    expect(project.hasEvents).toBe(true)
    expect(project.inputMode).toBe('hook')

    expect(await readFile(join(dir, 'seg0-camera.mkv'), 'utf8')).toBe('cam-1cam-2')
    expect(await readFile(join(dir, 'seg0-mic.webm'), 'utf8')).toBe('mic-1')
    const files = await readdir(dir)
    expect(files.filter((f) => f.includes('.rec.'))).toEqual([])
    expect(files).toContain('thumbnail.jpg')

    const saved = parseProject(JSON.parse(await readFile(join(dir, 'project.json'), 'utf8')))
    expect(saved).toEqual(project)
    expect(session.state).toBe('finished')
  })

  it('tạm dừng rồi quay tiếp tạo đoạn mới, thời gian tạm dừng không tính', async () => {
    const { deps, screenStops } = makeDeps()
    const session = new RecordingSession(meta({ rendererTracks: [] }), deps)
    await session.beginSegment()
    await session.endSegment()
    expect(session.state).toBe('paused')
    expect(screenStops).toHaveLength(1)
    clock += 5_000 // tạm dừng 5 giây
    const second = await session.beginSegment()
    expect(second.index).toBe(1)
    const project = await session.finish()
    expect(project.segments.map((s) => s.tracks.screen?.file)).toEqual([
      'seg0-screen.mkv',
      'seg1-screen.mkv',
    ])
    expect(project.durationMs).toBe(200)
    expect(deps.tracker!.start).toHaveBeenCalledTimes(1)
  })

  it('lưu project.json sau mỗi đoạn để không mất dữ liệu nếu app bị tắt', async () => {
    const { deps } = makeDeps()
    const session = new RecordingSession(meta({ rendererTracks: [] }), deps)
    await session.beginSegment()
    await session.endSegment()
    const saved = parseProject(JSON.parse(await readFile(join(dir, 'project.json'), 'utf8')))
    expect(saved?.segments).toHaveLength(1)
  })

  it('quay cửa sổ: giao diện tự ghi màn hình', async () => {
    const { deps } = makeDeps({ startScreen: undefined })
    const session = new RecordingSession(
      meta({ engine: 'browser', cursorHidden: false, rendererTracks: ['screen'] }),
      deps,
    )
    await session.beginSegment()
    await session.trackStarted(0, 'screen', 1_120)
    await session.writeChunk(0, 'screen', bytes('frames'))
    const project = await session.finish()
    expect(project.segments[0]?.tracks).toEqual({
      screen: { file: 'seg0-screen.mkv', startedAt: 1_120 },
    })
    expect(deps.thumbnail).toHaveBeenCalledWith(
      join(dir, 'seg0-screen.mkv'),
      join(dir, 'thumbnail.jpg'),
    )
  })

  it('giữ dữ liệu gốc khi ghi lại container bị lỗi', async () => {
    const { deps } = makeDeps({ remux: vi.fn(async () => Promise.reject(new Error('bad'))) })
    const session = new RecordingSession(meta({ rendererTracks: ['mic'] }), deps)
    await session.beginSegment()
    await session.trackStarted(0, 'mic', 1)
    await session.writeChunk(0, 'mic', bytes('audio'))
    await session.finish()
    expect(await readFile(join(dir, 'seg0-mic.webm'), 'utf8')).toBe('audio')
  })

  it('bỏ track không có dữ liệu (ví dụ webcam bị rút giữa chừng)', async () => {
    const { deps } = makeDeps()
    const session = new RecordingSession(meta(), deps)
    await session.beginSegment()
    await session.trackStarted(0, 'camera', 1)
    const project = await session.finish()
    expect(project.segments[0]?.tracks.camera).toBeUndefined()
  })

  it('từ chối dữ liệu cho track không đăng ký hoặc đoạn đã kết thúc', async () => {
    const { deps } = makeDeps()
    const session = new RecordingSession(meta(), deps)
    await session.beginSegment()
    await expect(session.writeChunk(0, 'system', bytes('x'))).rejects.toThrow(/Track không hợp lệ/)
    await session.endSegment()
    await expect(session.writeChunk(0, 'camera', bytes('x'))).rejects.toThrow(/không còn đang quay/)
  })

  it('không cho bắt đầu đoạn mới khi đang quay', async () => {
    const { deps } = makeDeps()
    const session = new RecordingSession(meta(), deps)
    await session.beginSegment()
    await expect(session.beginSegment()).rejects.toThrow()
  })

  it('hủy phiên quay sẽ dừng ffmpeg và xóa thư mục', async () => {
    const { deps, screenStops } = makeDeps()
    const session = new RecordingSession(meta(), deps)
    await session.beginSegment()
    await session.writeChunk(0, 'camera', bytes('x'))
    await session.cancel()
    expect(screenStops).toHaveLength(1)
    await expect(stat(dir)).rejects.toThrow()
    expect(session.state).toBe('cancelled')
  })
})
