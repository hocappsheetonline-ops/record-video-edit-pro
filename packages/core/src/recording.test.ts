import { describe, expect, it } from 'vitest'
import { DEFAULT_RECORDING_OPTIONS, formatDuration, parseRecordingOptions } from './recording'

describe('parseRecordingOptions', () => {
  it('chấp nhận tùy chọn hợp lệ', () => {
    expect(
      parseRecordingOptions({
        source: { kind: 'display', displayId: '1' },
        fps: 30,
        countdown: 0,
        cameraId: 'cam',
        micId: 'mic',
        systemAudio: true,
      }),
    ).toEqual({
      source: { kind: 'display', displayId: '1' },
      fps: 30,
      countdown: 0,
      cameraId: 'cam',
      micId: 'mic',
      systemAudio: true,
    })
  })

  it('dùng mặc định cho giá trị sai', () => {
    expect(
      parseRecordingOptions({
        source: { kind: 'display', displayId: '1' },
        fps: 144,
        countdown: 9,
        cameraId: '',
      }),
    ).toEqual({ source: { kind: 'display', displayId: '1' }, ...DEFAULT_RECORDING_OPTIONS })
  })

  it('từ chối nguồn quay không hợp lệ', () => {
    expect(parseRecordingOptions({})).toBeNull()
    expect(parseRecordingOptions({ source: { kind: 'camera' } })).toBeNull()
    expect(parseRecordingOptions({ source: { kind: 'display' } })).toBeNull()
  })

  it('từ chối vùng quá nhỏ', () => {
    expect(
      parseRecordingOptions({
        source: { kind: 'region', displayId: '1', region: { x: 0, y: 0, width: 4, height: 100 } },
      }),
    ).toBeNull()
  })

  it('giữ vùng quay hợp lệ', () => {
    const region = { x: 10, y: 20, width: 800, height: 600 }
    expect(
      parseRecordingOptions({ source: { kind: 'region', displayId: '1', region } })?.source,
    ).toEqual({ kind: 'region', displayId: '1', region })
  })
})

describe('formatDuration', () => {
  it('định dạng thời lượng', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_400)).toBe('1:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatDuration(-5)).toBe('0:00')
  })
})
