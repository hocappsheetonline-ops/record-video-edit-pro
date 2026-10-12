import { describe, expect, it } from 'vitest'
import {
  parseProject,
  projectDuration,
  projectFolderName,
  trackFileName,
  type Project,
} from './project'

const sample: Project = {
  version: 1,
  id: 'p1',
  name: 'Demo',
  createdAt: '2026-10-12T02:30:15.000Z',
  source: {
    kind: 'display',
    name: 'Màn hình 1',
    captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1.25,
  },
  engine: 'ffmpeg',
  encoder: 'h264_nvenc',
  fps: 60,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 1000,
      endedAt: 6000,
      tracks: {
        screen: { file: 'seg0-screen.mkv', startedAt: 1010 },
        mic: { file: 'seg0-mic.webm', startedAt: 1005 },
      },
    },
    {
      index: 1,
      startedAt: 9000,
      endedAt: 11000,
      tracks: { screen: { file: 'seg1-screen.mkv', startedAt: 9020 } },
    },
  ],
  hasEvents: true,
  inputMode: 'hook',
  durationMs: 7000,
}

describe('parseProject', () => {
  it('đọc lại dự án hợp lệ', () => {
    expect(parseProject(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('dự án cũ chưa có inputMode thì coi là null', () => {
    const old: Partial<Project> = { ...sample }
    delete old.inputMode
    expect(parseProject(old)?.inputMode).toBeNull()
  })

  it('tính lại thời lượng từ các đoạn, không tin số trong file', () => {
    expect(parseProject({ ...sample, durationMs: 999 })?.durationMs).toBe(7000)
  })

  it('từ chối file không phải dự án', () => {
    expect(parseProject(null)).toBeNull()
    expect(parseProject({ ...sample, version: 2 })).toBeNull()
    expect(parseProject({ ...sample, engine: 'obs' })).toBeNull()
    expect(parseProject({ ...sample, segments: [{ index: 'x' }] })).toBeNull()
  })

  it('bỏ track có tên file trỏ ra ngoài thư mục dự án', () => {
    const evil = {
      ...sample,
      segments: [
        {
          index: 0,
          startedAt: 0,
          endedAt: 1,
          tracks: { screen: { file: '../../Windows/system.ini', startedAt: 0 } },
        },
      ],
    }
    expect(parseProject(evil)?.segments[0]?.tracks).toEqual({})
  })
})

describe('helpers', () => {
  it('projectDuration bỏ qua thời gian tạm dừng', () => {
    expect(projectDuration(sample.segments)).toBe(7000)
  })

  it('projectFolderName dùng giờ địa phương', () => {
    expect(projectFolderName(new Date(2026, 9, 12, 9, 5, 7))).toBe('2026-10-12 09.05.07.lumora')
  })

  it('trackFileName', () => {
    expect(trackFileName(2, 'camera', 'webm')).toBe('seg2-camera.webm')
  })
})
