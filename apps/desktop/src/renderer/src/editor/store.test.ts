import { beforeEach, describe, expect, it } from 'vitest'
import { outputDuration } from '@lumora/core'
import { createFakeApi, sampleProject, sampleSummary } from '../test/fake-api'
import { useEditorStore } from './store'

const t0 = sampleProject.segments[0]!.startedAt

beforeEach(async () => {
  const fake = createFakeApi()
  fake.api.getEvents.mockResolvedValue([
    { type: 'move', t: t0 + 100, x: 960, y: 540 },
    { type: 'down', t: t0 + 1500, x: 960, y: 540, button: 'left' },
  ])
  window.lumora = fake.api
  useEditorStore.getState().reset()
  await useEditorStore.getState().load(sampleSummary.folder)
})

describe('editor store', () => {
  it('mở lần đầu: mỗi đoạn quay là một clip, tự tạo zoom từ click', () => {
    const { edit, cursor } = useEditorStore.getState()
    expect(edit!.clips).toHaveLength(2)
    expect(outputDuration(edit!.clips)).toBe(7000)
    expect(edit!.zooms).toHaveLength(1)
    expect(edit!.zooms[0]!.start).toBe(1000)
    expect(cursor!.clicks).toHaveLength(1)
  })

  it('tách, xóa clip rồi hoàn tác/làm lại', () => {
    const s = useEditorStore.getState
    s().setTime(2000)
    s().splitAtPlayhead()
    expect(s().edit!.clips).toHaveLength(3)
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    expect(s().edit!.clips).toHaveLength(2)
    expect(outputDuration(s().edit!.clips)).toBe(5000)
    s().undo()
    expect(s().edit!.clips).toHaveLength(3)
    s().undo()
    expect(s().edit!.clips).toHaveLength(2)
    s().redo()
    expect(s().edit!.clips).toHaveLength(3)
  })

  it('không xóa clip cuối cùng', () => {
    const s = useEditorStore.getState
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    expect(s().edit!.clips).toHaveLength(1)
  })

  it('kéo thanh trượt liên tục chỉ tính một bước hoàn tác', () => {
    const s = useEditorStore.getState
    for (const padding of [0.1, 0.12, 0.15])
      s().change((e) => ({ ...e, frame: { ...e.frame, padding } }), 'padding')
    expect(s().past).toHaveLength(1)
    s().undo()
    expect(s().edit!.frame.padding).toBe(0.06)
  })

  it('đổi độ mượt con trỏ thì tính lại đường đi', () => {
    const s = useEditorStore.getState
    const before = s().cursor
    s().change((e) => ({ ...e, cursor: { ...e.cursor, smoothing: 0 } }))
    expect(s().cursor).not.toBe(before)
  })

  it('thêm zoom tại đầu phát và chọn nó; đổi tốc độ clip', () => {
    const s = useEditorStore.getState
    s().setTime(5000)
    s().addZoomAtPlayhead()
    expect(s().edit!.zooms).toHaveLength(2)
    expect(s().selection?.kind).toBe('zoom')
    const id = s().edit!.clips[0]!.id
    s().setClipSpeed(id, 2)
    expect(outputDuration(s().edit!.clips)).toBe(4500)
  })

  it('đặt mức zoom cho tất cả đoạn; thay danh sách zoom thì bỏ chọn đoạn không còn', () => {
    const s = useEditorStore.getState
    s().setTime(5000)
    s().addZoomAtPlayhead()
    expect(s().edit!.zooms).toHaveLength(2)
    s().updateAllZooms({ scale: 3.2 })
    expect(s().edit!.zooms.map((z) => z.scale)).toEqual([3.2, 3.2])
    const before = s().edit
    s().updateAllZooms({ scale: 3.2 })
    expect(s().edit).toBe(before) // không ghi thêm bước lịch sử
    s().undo()
    expect(s().edit!.zooms.map((z) => z.scale)).toEqual([2, 2])

    const selected = s().selection
    expect(selected?.kind).toBe('zoom')
    s().setZooms([{ id: 'new', start: 0, end: 1500, scale: 2.5, mode: 'follow', x: 0.5, y: 0.5 }])
    expect(s().edit!.zooms).toEqual([
      { id: 'new', start: 0, end: 1500, scale: 2.5, mode: 'follow', x: 0.5, y: 0.5 },
    ])
    expect(s().selection).toBeNull()
  })

  it('đầu phát không vượt quá độ dài video', () => {
    useEditorStore.getState().setTime(99_999)
    expect(useEditorStore.getState().time).toBe(7000)
  })
})

describe('phím A / D', () => {
  it('A xóa phần trái của clip tại đầu phát, D xóa phần phải; hoàn tác được', () => {
    const s = useEditorStore.getState
    s().setTime(2000)
    s().trimAtPlayhead('left')
    expect(s().edit!.clips[0]).toMatchObject({ sourceStart: 2000, sourceEnd: 5000 })
    expect(s().time).toBe(0)
    expect(outputDuration(s().edit!.clips)).toBe(5000)
    s().setTime(1000)
    s().trimAtPlayhead('right')
    expect(s().edit!.clips[0]).toMatchObject({ sourceStart: 2000, sourceEnd: 3000 })
    expect(outputDuration(s().edit!.clips)).toBe(3000)
    s().undo()
    s().undo()
    expect(outputDuration(s().edit!.clips)).toBe(7000)
  })

  it('đổi tốc độ khung nhìn thì tính lại đường đi của khung nhìn', () => {
    const s = useEditorStore.getState
    const before = s().follow
    s().change((e) => ({ ...e, motion: { ...e.motion, cameraSpeed: 0.1 } }))
    expect(s().follow).not.toBe(before)
    expect(s().cursor).not.toBeNull()
  })
})

describe('chuyển tiếp', () => {
  it('đặt, đổi thời gian, bỏ; tách clip thì chuyển tiếp vẫn ở đúng chỗ nối cũ', () => {
    const s = useEditorStore.getState
    const [a] = s().edit!.clips
    s().setTransition(a!.id, 'fadeBlack')
    expect(s().edit!.transitions).toEqual([
      { afterClip: a!.id, kind: 'fadeBlack', durationMs: 600 },
    ])
    s().setTransition(a!.id, 'fadeBlack', 1200)
    expect(s().edit!.transitions[0]!.durationMs).toBe(1200)

    // Tách clip đầu ở giây 2: chỗ nối cũ (5s) giờ nằm sau mảnh bên phải.
    s().setTime(2000)
    s().splitAtPlayhead()
    const clips = s().edit!.clips
    expect(clips).toHaveLength(3)
    expect(s().edit!.transitions[0]!.afterClip).toBe(clips[1]!.id)

    s().applyTransitionToAll('zoom', 800)
    expect(s().edit!.transitions.map((t) => t.kind)).toEqual(['zoom', 'zoom'])

    // Xóa clip cuối: chỗ nối của nó biến mất, chuyển tiếp tương ứng bị bỏ.
    s().select({ kind: 'clip', id: clips[2]!.id })
    s().deleteSelection()
    expect(s().edit!.transitions).toHaveLength(1)

    s().setTransition(clips[0]!.id, null)
    expect(s().edit!.transitions).toEqual([])
  })
})
