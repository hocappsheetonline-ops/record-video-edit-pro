import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import { createDefaultEdit } from './edit-state'
import { applyProjectTemplate } from './templates'

const edit = createDefaultEdit({
  segments: [{ index: 0, startedAt: 0, endedAt: 1000, tracks: {} }] as Segment[],
  cursorHidden: false,
  fps: 30,
})

describe('mẫu dự án', () => {
  it('TikTok: 9:16 phủ kín, phụ đề kiểu TikTok; vuông: 1:1; hướng dẫn: giữ nguyên', () => {
    const tiktok = applyProjectTemplate(edit, 'tiktok')
    expect(tiktok.frame).toMatchObject({ aspect: '9:16', fill: true })
    expect(tiktok.captions.look).toMatchObject({ template: 'tiktok', y: 0.7 })
    expect(applyProjectTemplate(edit, 'square').frame.aspect).toBe('1:1')
    expect(applyProjectTemplate(edit, 'tutorial')).toBe(edit)
  })
})
