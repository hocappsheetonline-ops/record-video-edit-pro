import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import { createDefaultEdit } from './edit-state'
import { describeChange } from './history'
import { NO_ANIM } from './overlay-fx'

const edit = createDefaultEdit({
  segments: [{ index: 0, startedAt: 0, endedAt: 5000, tracks: {} }] as Segment[],
  cursorHidden: false,
  fps: 30,
})

describe('mô tả bước chỉnh sửa', () => {
  it('thêm / xóa / sửa theo phần đã đổi', () => {
    const fx = { id: 'a', kind: 'shake' as const, start: 0, end: 500, intensity: 0.5 }
    const added = { ...edit, effects: [fx] }
    expect(describeChange(edit, added)).toEqual({ area: 'effects', op: 'add' })
    expect(describeChange(added, edit)).toEqual({ area: 'effects', op: 'remove' })
    expect(describeChange(added, { ...added, effects: [{ ...fx, end: 900 }] })).toEqual({
      area: 'effects',
      op: 'edit',
    })
    expect(describeChange(edit, { ...edit, camera: { ...edit.camera, size: 0.3 } })).toEqual({
      area: 'camera',
      op: 'edit',
    })
    expect(describeChange(edit, { ...edit })).toBeNull()
  })

  it('nhiều phần cùng đổi: lấy phần quan trọng hơn (clip trước lớp phủ)', () => {
    const o = {
      id: 'o',
      kind: 'text' as const,
      start: 0,
      end: 100,
      x: 0.5,
      y: 0.5,
      size: 0.1,
      rotation: 0,
      anim: NO_ANIM,
      text: 'a',
      style: 'meme' as const,
      color: '#fff',
      file: '',
      aspect: 1,
      mediaOffset: 0,
      sourceDuration: 0,
      hasAudio: false,
      volume: 1,
      keyColor: '',
      keyStrength: 0.4,
    }
    const next = { ...edit, overlays: [o], clips: [...edit.clips, { ...edit.clips[0]!, id: 'x' }] }
    expect(describeChange(edit, next)).toEqual({ area: 'clips', op: 'add' })
  })
})
