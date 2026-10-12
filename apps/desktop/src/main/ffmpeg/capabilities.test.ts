import { describe, expect, it } from 'vitest'
import {
  detectCaptureCapabilities,
  matchDdagrabOutput,
  NO_CAPTURE,
  planScreenCapture,
  type DisplayGeometry,
} from './capabilities'
import type { FfmpegRunner } from './runner'

const ok = (stderr = '') => ({ code: 0, stderr })
const fail = { code: 1, stderr: 'error' }
const resolutionLog = (w: number, h: number) =>
  `Input #0, lavfi:\n  Stream #0:0: Video: wrapped_avframe, d3d11, ${w}x${h}, 5 fps`

/** Runner giả: trả lời theo nội dung lệnh. */
function fakeRunner(
  handler: (args: string) => { code: number | null; stderr: string },
): FfmpegRunner & { calls: string[] } {
  const calls: string[] = []
  const run = (async (args: string[]) => {
    const joined = args.join(' ')
    calls.push(joined)
    return handler(joined)
  }) as FfmpegRunner & { calls: string[] }
  run.calls = calls
  return run
}

describe('detectCaptureCapabilities (Windows)', () => {
  it('liệt kê màn hình ddagrab và chọn bộ mã hóa phần cứng đầu tiên chạy được', async () => {
    const run = fakeRunner((cmd) => {
      if (cmd.includes('framerate=5')) {
        if (cmd.includes('output_idx=0')) return ok(resolutionLog(1920, 1080))
        if (cmd.includes('output_idx=1')) return ok(resolutionLog(2560, 1440))
        return fail
      }
      if (cmd.includes('h264_nvenc')) return fail // máy không có card NVIDIA
      if (cmd.includes('h264_amf')) return ok()
      return ok()
    })
    const caps = await detectCaptureCapabilities(run, 'win32')
    expect(caps.ddagrabOutputs).toEqual([
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
    ])
    expect(caps.ddagrab).toEqual({ encoder: 'h264_amf' })
    expect(caps.gdigrab).toEqual({ encoder: 'h264_amf' })
    expect(caps.x11grab).toBeNull()
  })

  it('dùng libx264 khi không có bộ mã hóa phần cứng', async () => {
    const run = fakeRunner((cmd) => {
      if (cmd.includes('framerate=5'))
        return cmd.includes('output_idx=0') ? ok(resolutionLog(1920, 1080)) : fail
      return cmd.includes('libx264') ? ok() : fail
    })
    const caps = await detectCaptureCapabilities(run, 'win32')
    expect(caps.ddagrab).toEqual({ encoder: 'libx264' })
  })

  it('bỏ qua ddagrab khi không mở được màn hình nào (ví dụ Remote Desktop)', async () => {
    const run = fakeRunner((cmd) => (cmd.includes('ddagrab') ? fail : ok()))
    const caps = await detectCaptureCapabilities(run, 'win32')
    expect(caps.ddagrab).toBeNull()
    expect(caps.ddagrabOutputs).toEqual([])
    expect(caps.gdigrab).toEqual({ encoder: 'h264_nvenc' })
  })
})

describe('detectCaptureCapabilities (Linux)', () => {
  it('dùng x11grab khi có DISPLAY', async () => {
    const run = fakeRunner(() => ok())
    const caps = await detectCaptureCapabilities(run, 'linux', { display: ':99' })
    expect(caps.x11grab).toEqual({ encoder: 'libx264' })
    expect(run.calls[0]).toContain(':99.0+0,0')
  })

  it('không quay được khi không có DISPLAY', async () => {
    expect(
      await detectCaptureCapabilities(
        fakeRunner(() => ok()),
        'linux',
      ),
    ).toEqual(NO_CAPTURE)
  })
})

const display = (id: string, x: number, width: number, height: number): DisplayGeometry => ({
  id,
  physicalBounds: { x, y: 0, width, height },
})

describe('matchDdagrabOutput', () => {
  it('một màn hình thì luôn là output 0', () => {
    expect(
      matchDdagrabOutput([display('a', 0, 1920, 1080)], 'a', [{ width: 1920, height: 1080 }]),
    ).toBe(0)
  })

  it('ghép theo độ phân giải khi không trùng', () => {
    const displays = [display('a', 0, 1920, 1080), display('b', 1920, 2560, 1440)]
    const outputs = [
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
    ]
    expect(matchDdagrabOutput(displays, 'a', outputs)).toBe(1)
    expect(matchDdagrabOutput(displays, 'b', outputs)).toBe(0)
  })

  it('không đoán khi hai màn hình cùng độ phân giải', () => {
    const displays = [display('a', 0, 1920, 1080), display('b', 1920, 1920, 1080)]
    const outputs = [
      { width: 1920, height: 1080 },
      { width: 1920, height: 1080 },
    ]
    expect(matchDdagrabOutput(displays, 'a', outputs)).toBeNull()
  })
})

describe('planScreenCapture', () => {
  const displays = [display('a', 0, 1920, 1080), display('b', 1920, 2560, 1440)]

  it('ddagrab dùng tọa độ tương đối với màn hình', () => {
    const plan = planScreenCapture(
      {
        ...NO_CAPTURE,
        ddagrabOutputs: [
          { width: 1920, height: 1080 },
          { width: 2560, height: 1440 },
        ],
        ddagrab: { encoder: 'h264_nvenc' },
        gdigrab: { encoder: 'libx264' },
      },
      displays,
      'b',
      { x: 2020, y: 100, width: 800, height: 600 },
      60,
    )
    expect(plan?.spec).toEqual({
      backend: 'ddagrab',
      encoder: 'h264_nvenc',
      fps: 60,
      outputIdx: 1,
      rect: { x: 100, y: 100, width: 800, height: 600 },
    })
    expect(plan?.captureRect).toEqual({ x: 2020, y: 100, width: 800, height: 600 })
  })

  it('chuyển sang gdigrab khi không xác định được màn hình DXGI', () => {
    const plan = planScreenCapture(
      {
        ...NO_CAPTURE,
        ddagrabOutputs: [],
        ddagrab: { encoder: 'h264_nvenc' },
        gdigrab: { encoder: 'libx264' },
      },
      displays,
      'a',
      { x: 0, y: 0, width: 1920, height: 1080 },
      30,
    )
    expect(plan?.spec.backend).toBe('gdigrab')
    expect(plan?.spec.rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('trả về null khi ffmpeg không quay được', () => {
    expect(
      planScreenCapture(NO_CAPTURE, displays, 'a', { x: 0, y: 0, width: 10, height: 10 }, 30),
    ).toBeNull()
  })
})
