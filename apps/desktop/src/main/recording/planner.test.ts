import { describe, expect, it } from 'vitest'
import { DEFAULT_RECORDING_OPTIONS, scaleRect, type RecordingOptions } from '@lumora/core'
import { NO_CAPTURE, type CaptureCapabilities } from '../ffmpeg/capabilities'
import { planRecording, RecordingPlanError, type DisplayInfo } from './planner'

// Màn hình chính 1920x1080 ở 125% (1536x864 DIP) và màn hình phụ 2560x1440 ở 100% bên phải.
const displays: DisplayInfo[] = [
  {
    id: '1',
    label: 'Dell',
    bounds: { x: 0, y: 0, width: 1536, height: 864 },
    scaleFactor: 1.25,
    physicalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  },
  {
    id: '2',
    label: '',
    bounds: { x: 1536, y: 0, width: 2560, height: 1440 },
    scaleFactor: 1,
    physicalBounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  },
]

// Giả lập dipToScreenRect của Windows cho hai màn hình trên.
const env = {
  toPhysical: (r: { x: number; y: number; width: number; height: number }) =>
    r.x < 1536 ? scaleRect(r, 1.25) : { ...r, x: r.x - 1536 + 1920 },
}

const caps: CaptureCapabilities = {
  ...NO_CAPTURE,
  ddagrabOutputs: [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ],
  ddagrab: { encoder: 'h264_nvenc' },
  gdigrab: { encoder: 'libx264' },
}

const opts = (
  source: RecordingOptions['source'],
  extra: Partial<RecordingOptions> = {},
): RecordingOptions => ({
  ...DEFAULT_RECORDING_OPTIONS,
  source,
  ...extra,
})

describe('planRecording', () => {
  it('quay cả màn hình bằng ffmpeg, ẩn con trỏ', () => {
    const plan = planRecording(
      opts({ kind: 'display', displayId: '1' }, { micId: 'm', cameraId: 'c' }),
      displays,
      caps,
      env,
    )
    expect(plan.engine).toBe('ffmpeg')
    expect(plan.screen?.spec).toMatchObject({
      backend: 'ddagrab',
      outputIdx: 0,
      rect: { x: 0, y: 0, width: 1920, height: 1080 },
    })
    expect(plan.source).toEqual({
      kind: 'display',
      name: 'Dell',
      captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1.25,
    })
    expect(plan.rendererTracks).toEqual(['camera', 'mic'])
    expect(plan.browserSource).toBeNull()
  })

  it('quay một vùng: đổi DIP sang pixel vật lý theo DPI', () => {
    const plan = planRecording(
      opts({ kind: 'region', displayId: '1', region: { x: 100, y: 100, width: 801, height: 401 } }),
      displays,
      caps,
      env,
    )
    expect(plan.source.captureRect).toEqual({ x: 125, y: 125, width: 1000, height: 500 })
    expect(plan.screen?.spec.rect).toEqual({ x: 125, y: 125, width: 1000, height: 500 })
  })

  it('vùng trên màn hình phụ dùng tọa độ tương đối với màn hình đó cho ddagrab', () => {
    const plan = planRecording(
      opts({ kind: 'region', displayId: '2', region: { x: 10, y: 20, width: 640, height: 360 } }),
      displays,
      caps,
      env,
    )
    expect(plan.source.captureRect).toEqual({ x: 1930, y: 20, width: 640, height: 360 })
    expect(plan.screen?.spec).toMatchObject({
      outputIdx: 1,
      rect: { x: 10, y: 20, width: 640, height: 360 },
    })
    expect(plan.source.name).toBe('Display 2')
  })

  it('cắt vùng tràn ra ngoài màn hình', () => {
    const plan = planRecording(
      opts({ kind: 'region', displayId: '1', region: { x: 1400, y: 0, width: 400, height: 200 } }),
      displays,
      caps,
      env,
    )
    expect(plan.source.captureRect).toEqual({ x: 1750, y: 0, width: 170, height: 250 })
  })

  it('không có ffmpeg: giao diện tự quay màn hình', () => {
    const plan = planRecording(
      opts({ kind: 'display', displayId: '2' }, { systemAudio: true }),
      displays,
      NO_CAPTURE,
      env,
    )
    expect(plan.engine).toBe('browser')
    expect(plan.browserSource).toEqual({ kind: 'display', displayId: '2' })
    expect(plan.rendererTracks).toEqual(['screen', 'system'])
  })

  it('quay cửa sổ luôn dùng bộ quay của Electron', () => {
    const plan = planRecording(
      opts({ kind: 'window', sourceId: 'window:42:0', name: 'Chrome' }),
      displays,
      caps,
      env,
    )
    expect(plan).toMatchObject({
      engine: 'browser',
      browserSource: { kind: 'window', sourceId: 'window:42:0' },
      source: { kind: 'window', name: 'Chrome', captureRect: null },
      rendererTracks: ['screen'],
    })
  })

  it('báo lỗi khi không tìm thấy màn hình hoặc vùng cần ffmpeg', () => {
    expect(() =>
      planRecording(opts({ kind: 'display', displayId: '9' }), displays, caps, env),
    ).toThrow(RecordingPlanError)
    expect(() =>
      planRecording(
        opts({ kind: 'region', displayId: '1', region: { x: 0, y: 0, width: 100, height: 100 } }),
        displays,
        NO_CAPTURE,
        env,
      ),
    ).toThrow('region_requires_ffmpeg')
  })
})
