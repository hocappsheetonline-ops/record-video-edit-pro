import { describe, expect, it } from 'vitest'
import { createDefaultEdit, NO_ANIM, type Overlay } from '@lumora/core'
import { sampleProject } from '../test/fake-api'
import { planFrames } from './exporter'

const meme: Overlay = {
  id: 'v1',
  kind: 'video',
  start: 1000,
  end: 1500,
  x: 0.5,
  y: 0.5,
  size: 0.4,
  rotation: 0,
  anim: NO_ANIM,
  text: 'Bruh',
  style: 'meme',
  color: '#ffffff',
  file: 'asset-meme-b.mp4',
  aspect: 16 / 9,
  mediaOffset: 200,
  sourceDuration: 400,
  hasAudio: true,
  volume: 1,
  keyColor: '#00ff00',
  keyStrength: 0.4,
}

describe('planFrames', () => {
  it('video meme: lấy đúng khung của file theo thời gian, giữ khung cuối khi hết file', () => {
    const edit = { ...createDefaultEdit(sampleProject), overlays: [meme] }
    const plan = planFrames(sampleProject, edit, 10)
    // 10 hình/giây: khung 1.0s … 1.4s; file chỉ còn 0.2s (từ 0.2s tới 0.4s) nên giữ khung cuối.
    expect(plan.overlayTimestamps.get('v1')).toEqual([0.2, 0.3, 0.399, 0.399, 0.399])
    // Khung ngoài khoảng đó không giải mã video meme.
    expect([...plan.overlayTimestamps.keys()]).toEqual(['v1'])
    expect(plan.frames).toHaveLength(70)
  })

  it('không có video meme thì không có gì phải giải mã thêm', () => {
    const edit = createDefaultEdit(sampleProject)
    expect(planFrames(sampleProject, edit, 30).overlayTimestamps.size).toBe(0)
  })
})
