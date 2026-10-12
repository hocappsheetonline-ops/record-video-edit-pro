import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import { createDefaultEdit, parseEditState } from './edit-state'

const project = {
  segments: [{ index: 0, startedAt: 0, endedAt: 10_000, tracks: {} }] as Segment[],
  cursorHidden: true,
  fps: 60,
}

describe('edit-state', () => {
  it('mặc định: một clip cho mỗi đoạn, hiện con trỏ khi con trỏ gốc bị ẩn', () => {
    const edit = createDefaultEdit(project)
    expect(edit.clips).toHaveLength(1)
    expect(edit.cursor.visible).toBe(true)
    expect(edit.export).toEqual({ resolution: 1080, fps: 60, format: 'mp4' })
    expect(createDefaultEdit({ ...project, cursorHidden: false }).cursor.visible).toBe(false)
  })

  it('đọc lại đúng những gì đã lưu', () => {
    const edit = createDefaultEdit(project)
    edit.zooms = [{ id: 'z1', start: 1000, end: 3000, scale: 2.5, mode: 'fixed', x: 0.2, y: 0.7 }]
    edit.frame.background = { kind: 'solid', color: '#112233', color2: '#112233', angle: 0 }
    expect(parseEditState(JSON.parse(JSON.stringify(edit)), project)).toEqual(edit)
  })

  it('sửa giá trị sai về mặc định và giữ trong thời lượng thật', () => {
    const parsed = parseEditState(
      {
        version: 1,
        clips: [
          { id: 'a', sourceStart: -50, sourceEnd: 99_999, speed: 100 },
          { sourceStart: 5, sourceEnd: 6 },
          'x',
        ],
        zooms: [{ start: 9000, end: 20_000, scale: 99, mode: 'weird' }],
        frame: { aspect: '21:9', padding: 5, background: { kind: 'solid', color: 'red' } },
        cursor: { size: -1 },
        camera: { position: 'middle' },
        export: { resolution: 999, fps: 24, format: 'avi' },
      },
      project,
    )
    expect(parsed.clips).toEqual([{ id: 'a', sourceStart: 0, sourceEnd: 10_000, speed: 16 }])
    expect(parsed.zooms).toEqual([
      { id: 'z0', start: 9000, end: 10_000, scale: 5, mode: 'follow', x: 0.5, y: 0.5 },
    ])
    expect(parsed.frame.aspect).toBe('16:9')
    expect(parsed.frame.padding).toBe(0.45)
    expect(parsed.frame.background.color).toBe('#7c3aed')
    expect(parsed.cursor.size).toBe(0.5)
    expect(parsed.camera.position).toBe('bottom-right')
    expect(parsed.camera).toMatchObject({ x: 1, y: 1, zoom: 1, border: 0 })
    expect(parsed.export).toEqual({ resolution: 1080, fps: 60, format: 'mp4' })
  })

  it('webcam: bản cũ chỉ có góc → vị trí tự do đúng góc; giá trị tự do được giữ và kẹp', () => {
    const old = parseEditState({ version: 1, camera: { position: 'top-left' } }, project)
    expect(old.camera).toMatchObject({ position: 'top-left', x: 0, y: 0 })
    const free = parseEditState(
      {
        version: 1,
        camera: {
          position: 'top-left',
          x: 0.42,
          y: 7,
          zoom: 9,
          focusX: 0.3,
          focusY: -1,
          border: 0.5,
          borderColor: 'nope',
        },
      },
      project,
    )
    expect(free.camera).toMatchObject({
      x: 0.42,
      y: 1,
      zoom: 3,
      focusX: 0.3,
      focusY: 0,
      border: 0.5,
      borderColor: '#ffffff',
    })
  })

  it('âm lượng riêng của clip được đọc và kẹp; clip cũ không có thì giữ không có', () => {
    const parsed = parseEditState(
      {
        version: 1,
        clips: [
          { id: 'a', sourceStart: 0, sourceEnd: 4000, speed: 1, audio: { mic: 9, muted: true } },
          { id: 'b', sourceStart: 4000, sourceEnd: 8000, speed: 1 },
        ],
      },
      project,
    )
    expect(parsed.clips[0]!.audio).toEqual({ mic: 2, system: 1, muted: true })
    expect(parsed.clips[1]).not.toHaveProperty('audio')
  })

  it('file sai phiên bản thì dùng mặc định', () => {
    expect(parseEditState({ version: 9 }, project).clips).toHaveLength(1)
  })
})
