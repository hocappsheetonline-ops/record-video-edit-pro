import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RECORDING_OPTIONS, type TrackKind } from '@lumora/core'
import type { ActiveSession } from '@shared/ipc'
import { BarController, type BarApi, type BarDeps, type Recorder } from './bar-controller'

function setup(overrides: { session?: Partial<ActiveSession>; failKinds?: TrackKind[] } = {}) {
  let clock = 0
  const log: string[] = []
  const session: ActiveSession = {
    options: {
      ...DEFAULT_RECORDING_OPTIONS,
      countdown: 0,
      source: { kind: 'display', displayId: '1' },
    },
    rendererTracks: ['camera', 'mic'],
    screenSourceId: null,
    ...overrides.session,
  }
  let segment = 0
  const api: BarApi = {
    getActiveSession: vi.fn(async () => session),
    beginSegment: vi.fn(async () => {
      log.push('begin')
      return { index: segment++, rendererTracks: session.rendererTracks }
    }),
    endSegment: vi.fn(async () => void log.push('end')),
    finishRecording: vi.fn(async () => void log.push('finish')),
    cancelRecording: vi.fn(async () => void log.push('cancel')),
    trackStarted: vi.fn(async () => {}),
    writeChunk: vi.fn(async () => {}),
  }
  const stopped: MediaStreamTrack[] = []
  const stream = () => {
    const track = { stop: vi.fn(() => stopped.push(track as unknown as MediaStreamTrack)) }
    return { getTracks: () => [track] } as unknown as MediaStream
  }
  const deps: BarDeps = {
    api,
    openStream: vi.fn(async (kind: TrackKind) => {
      if (overrides.failKinds?.includes(kind)) throw new Error('NotFound')
      return stream()
    }),
    createRecorder: (kind): Recorder => ({
      start: async (i) => void log.push(`start ${kind}#${i}`),
      stop: async () => void log.push(`stop ${kind}`),
    }),
    sleep: vi.fn(async (ms: number) => {
      clock += ms
    }),
    now: () => clock,
  }
  return {
    controller: new BarController(deps),
    api,
    deps,
    log,
    stopped,
    tick: (ms: number) => (clock += ms),
  }
}

describe('BarController', () => {
  it('mở thiết bị, đếm ngược rồi bắt đầu quay', async () => {
    const { controller, deps, log } = setup({
      session: {
        options: {
          ...DEFAULT_RECORDING_OPTIONS,
          countdown: 3,
          source: { kind: 'display', displayId: '1' },
        },
      },
    })
    const phases: string[] = []
    controller.subscribe((s) =>
      phases.push(s.phase === 'countdown' ? `countdown ${s.countdown}` : s.phase),
    )
    await controller.init()
    expect(phases).toEqual(['preparing', 'countdown 3', 'countdown 2', 'countdown 1', 'recording'])
    expect(deps.sleep).toHaveBeenCalledTimes(3)
    expect(log).toEqual(['begin', 'start camera#0', 'start mic#0'])
  })

  it('tạm dừng rồi tiếp tục tạo đoạn mới; thời gian tạm dừng không tính', async () => {
    const { controller, log, tick } = setup()
    await controller.init()
    tick(4000)
    await controller.togglePause()
    expect(controller.state.phase).toBe('paused')
    tick(10_000)
    expect(controller.elapsedMs()).toBe(4000)
    await controller.togglePause()
    tick(1000)
    expect(controller.elapsedMs()).toBe(5000)
    expect(log).toEqual([
      'begin',
      'start camera#0',
      'start mic#0',
      'stop camera',
      'stop mic',
      'end',
      'begin',
      'start camera#1',
      'start mic#1',
    ])
  })

  it('dừng: chờ recorder ghi xong rồi mới báo lưu, giải phóng thiết bị', async () => {
    const { controller, log, stopped } = setup()
    await controller.init()
    await controller.stop()
    expect(log.slice(-3)).toEqual(['stop camera', 'stop mic', 'finish'])
    expect(stopped).toHaveLength(2)
    expect(controller.state.phase).toBe('saving')
  })

  it('bấm dừng khi đang đếm ngược thì hủy bản quay', async () => {
    const { controller, api } = setup()
    await controller.stop()
    expect(api.cancelRecording).toHaveBeenCalled()
    expect(api.finishRecording).not.toHaveBeenCalled()
  })

  it('bỏ qua thiết bị không mở được nhưng vẫn quay phần còn lại', async () => {
    const { controller, log } = setup({ failKinds: ['camera'] })
    await controller.init()
    expect(controller.state.failedTracks).toEqual(['camera'])
    expect(log).toEqual(['begin', 'start mic#0'])
  })

  it('không mở được màn hình (quay cửa sổ) thì hủy và báo lỗi', async () => {
    const { controller, api } = setup({
      session: { rendererTracks: ['screen'] },
      failKinds: ['screen'],
    })
    await controller.init()
    expect(controller.state).toMatchObject({ phase: 'error', error: 'screen_unavailable' })
    expect(api.cancelRecording).toHaveBeenCalled()
    expect(api.beginSegment).not.toHaveBeenCalled()
  })

  it('báo lỗi khi main process không bắt đầu được (ví dụ ffmpeg lỗi)', async () => {
    const { controller, api } = setup()
    vi.mocked(api.beginSegment).mockRejectedValueOnce(new Error('ffmpeg đã thoát'))
    await controller.init()
    expect(controller.state).toMatchObject({ phase: 'error', error: 'ffmpeg đã thoát' })
  })

  it('lỗi giữa chừng từ main: lưu lại phần đã quay', async () => {
    const { controller, api } = setup()
    await controller.init()
    await controller.handleError('ffmpeg crashed')
    expect(api.finishRecording).toHaveBeenCalled()
  })

  it('bấm dừng hai lần chỉ lưu một lần', async () => {
    const { controller, api } = setup()
    await controller.init()
    await Promise.all([controller.stop(), controller.stop()])
    expect(api.finishRecording).toHaveBeenCalledTimes(1)
  })

  it('bấm dừng khi đang tạm dừng dở dang: dừng ngay sau khi tạm dừng xong', async () => {
    const { controller, api, log } = setup()
    await controller.init()
    const pausing = controller.togglePause()
    await controller.stop()
    await pausing
    await vi.waitFor(() => expect(api.finishRecording).toHaveBeenCalledTimes(1))
    expect(log.slice(-1)).toEqual(['finish'])
  })
})
