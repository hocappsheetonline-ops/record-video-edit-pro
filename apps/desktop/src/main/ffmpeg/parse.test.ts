import { describe, expect, it } from 'vitest'
import { isCaptureStartedLine, parseDurationMs, parseInputResolution } from './parse'

const DDAGRAB_LOG = `Input #0, lavfi, from 'ddagrab=output_idx=0:framerate=5':
  Duration: N/A, start: 1234.5, bitrate: N/A
  Stream #0:0: Video: wrapped_avframe, d3d11(progressive), 2560x1440 [SAR 1:1 DAR 16:9], 5 fps, 5 tbr, 1000000 tbn
Stream mapping:
  Stream #0:0 -> #0:0 (wrapped_avframe (native) -> wrapped_avframe (native))
Output #0, null, to 'pipe:':
  Stream #0:0: Video: wrapped_avframe, d3d11, 1280x720, q=2-31`

describe('parseInputResolution', () => {
  it('đọc độ phân giải của luồng đầu vào', () => {
    expect(parseInputResolution(DDAGRAB_LOG)).toEqual({ width: 2560, height: 1440 })
  })

  it('trả về null khi không có luồng video', () => {
    expect(parseInputResolution('Error opening input')).toBeNull()
  })
})

describe('parseDurationMs', () => {
  it('đọc thời lượng', () => {
    expect(parseDurationMs('  Duration: 00:01:02.50, start: 0.000000')).toBe(62_500)
  })

  it('trả về null khi không có', () => {
    expect(parseDurationMs('Duration: N/A')).toBeNull()
  })
})

describe('isCaptureStartedLine', () => {
  it('nhận ra lúc ffmpeg bắt đầu ghi', () => {
    expect(isCaptureStartedLine('Press [q] to stop, [?] for help')).toBe(true)
    expect(isCaptureStartedLine('frame=   12 fps=0.0 q=-1.0 size=')).toBe(true)
    expect(isCaptureStartedLine('Input #0, gdigrab, from desktop:')).toBe(false)
  })
})
