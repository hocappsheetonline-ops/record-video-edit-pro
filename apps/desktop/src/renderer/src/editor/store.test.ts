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

  it('đầu phát không vượt quá độ dài video', () => {
    useEditorStore.getState().setTime(99_999)
    expect(useEditorStore.getState().time).toBe(7000)
  })
})
