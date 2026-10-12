import { describe, expect, it } from 'vitest'
import { createDefaultEdit, type CursorTrack, type Segment } from '@lumora/core'
import { computeScene } from './scene'

const project = {
  segments: [{ index: 0, startedAt: 0, endedAt: 10_000, tracks: {} }] as Segment[],
  cursorHidden: true,
  fps: 60,
}
const output = { width: 1920, height: 1080 }
const video = { width: 1920, height: 1080 }

function track(x: number, y: number, clicks: number[] = []): CursorTrack {
  return {
    stepMs: 100,
    samples: Array.from({ length: 101 }, (_, i) => ({ s: i * 100, x, y })),
    clicks: clicks.map((s) => ({ s, x, y, button: 'left' as const })),
    keys: [],
    moves: [0, 5000, 10_000],
  }
}

describe('computeScene', () => {
  it('không zoom: video nằm giữa khung có lề, thấy toàn bộ video', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0.1
    const scene = computeScene({
      edit,
      output,
      video,
      source: 1000,
      cursor: null,
      follow: null,
      hasCamera: false,
    })
    expect(scene.content).toEqual({ x: 192, y: 108, width: 1536, height: 864 })
    expect(scene.view).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(scene.camera).toBeNull()
  })

  it('con trỏ được đặt đúng vị trí trong khung', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0
    const scene = computeScene({
      edit,
      output,
      video,
      source: 1000,
      cursor: track(0.25, 0.5),
      follow: null,
      hasCamera: false,
    })
    expect(scene.cursor).toMatchObject({ x: 480, y: 540, opacity: 1 })
  })

  it('khi zoom gấp đôi vào giữa, con trỏ ở 1/4 bị đẩy ra mép trái và to gấp đôi', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0
    edit.zooms = [{ id: 'z', start: 0, end: 10_000, scale: 2, mode: 'fixed', x: 0.5, y: 0.5 }]
    const base = computeScene({
      edit: { ...edit, zooms: [] },
      output,
      video,
      source: 5000,
      cursor: track(0.25, 0.5),
      follow: null,
      hasCamera: false,
    })
    const zoomed = computeScene({
      edit,
      output,
      video,
      source: 5000,
      cursor: track(0.25, 0.5),
      follow: null,
      hasCamera: false,
    })
    expect(zoomed.view).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(zoomed.cursor!.x).toBeCloseTo(0)
    expect(zoomed.cursor!.size).toBeCloseTo(base.cursor!.size * 2)
  })

  it('hiệu ứng click ngay sau khi click', () => {
    const edit = createDefaultEdit(project)
    const scene = computeScene({
      edit,
      output,
      video,
      source: 2100,
      cursor: track(0.5, 0.5, [2000]),
      follow: null,
      hasCamera: false,
    })
    expect(scene.ripple?.opacity).toBeGreaterThan(0.5)
  })

  it('ẩn con trỏ khi tắt, hiện webcam khi có', () => {
    const edit = createDefaultEdit(project)
    edit.cursor.visible = false
    const scene = computeScene({
      edit,
      output,
      video,
      source: 1000,
      cursor: track(0.5, 0.5),
      follow: null,
      hasCamera: true,
    })
    expect(scene.cursor).toBeNull()
    expect(scene.camera?.shape).toBe('circle')
  })
})
