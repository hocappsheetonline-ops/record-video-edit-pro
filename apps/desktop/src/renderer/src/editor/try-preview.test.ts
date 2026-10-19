import { describe, expect, it } from 'vitest'
import {
  createDefaultEdit,
  DEFAULT_EFFECT_MS,
  DEFAULT_TRANSITION_MS,
  type EditState,
} from '@lumora/core'
import { sampleProject } from '../test/fake-api'
import { PREVIEW_ID, previewWindow, samePreview, withPreview } from './try-preview'

/** Hai clip 5 s + 2 s (chỗ nối ở 5000 ms). */
function edit(): EditState {
  const e = createDefaultEdit(sampleProject)
  return {
    ...e,
    clips: [
      { id: 'c1', sourceStart: 0, sourceEnd: 5000, speed: 1 },
      { id: 'c2', sourceStart: 5000, sourceEnd: 7000, speed: 1 },
    ],
  }
}

describe('withPreview', () => {
  it('hiệu ứng: thêm vùng xem thử tại đầu phát, không chạm hiệu ứng thật', () => {
    const out = withPreview(edit(), { kind: 'effect', effect: 'shake' }, 1000)
    expect(out.effects).toEqual([
      { id: PREVIEW_ID, kind: 'shake', start: 1000, end: 1000 + DEFAULT_EFFECT_MS, intensity: 0.7 },
    ])
    // Gần cuối video thì lùi lại để còn chỗ xem.
    expect(withPreview(edit(), { kind: 'effect', effect: 'shake' }, 6950).effects[0]!.start).toBe(
      6800,
    )
  })

  it('bộ lọc: thay tạm cho cả video / clip / lớp theo đích', () => {
    const all = withPreview(
      edit(),
      { kind: 'filter', filter: 'cinematic', target: { kind: 'all' } },
      0,
    )
    expect(all.look).toMatchObject({ filter: 'cinematic', intensity: 1 })
    const clip = withPreview(
      edit(),
      { kind: 'filter', filter: 'vintage', target: { kind: 'clip', id: 'c2' } },
      0,
    )
    expect(clip.clips[1]!.look).toMatchObject({ filter: 'vintage' })
    expect(clip.clips[0]!.look).toBeUndefined()
    expect(clip.look.filter).toBe('none')
  })

  it('chuyển cảnh: đặt tạm tại chỗ nối, thay chuyển cảnh đang có ở đó', () => {
    const base = {
      ...edit(),
      transitions: [{ afterClip: 'c1', kind: 'fadeBlack' as const, durationMs: 300 }],
    }
    const out = withPreview(base, { kind: 'transition', transition: 'slide', afterClip: 'c1' }, 0)
    expect(out.transitions).toEqual([
      { afterClip: 'c1', kind: 'slide', durationMs: DEFAULT_TRANSITION_MS },
    ])
  })

  it('lớp (meme / nhãn dán / chữ): thêm lớp xem thử tại đầu phát với file / URL giữ nguyên', () => {
    const out = withPreview(
      edit(),
      {
        kind: 'overlay',
        overlay: { kind: 'image', file: 'lumora-media://library/memes/a.gif', aspect: 2 },
      },
      2000,
    )
    const o = out.overlays.find((x) => x.id === PREVIEW_ID)!
    expect(o).toMatchObject({
      kind: 'image',
      file: 'lumora-media://library/memes/a.gif',
      start: 2000,
      size: 0.35,
    })
    const base = edit()
    expect(withPreview(base, { kind: 'music', url: 'x', name: 'x' }, 0)).toBe(base)
  })
})

describe('previewWindow / samePreview', () => {
  it('khoảng phát thử theo loại; nhạc thì không chạy timeline', () => {
    expect(previewWindow(edit(), { kind: 'effect', effect: 'shake' }, 1000)).toEqual({
      start: 1000,
      end: 3500,
    })
    expect(previewWindow(edit(), { kind: 'effect', effect: 'shake' }, 6000)).toEqual({
      start: 4500,
      end: 7000,
    })
    expect(
      previewWindow(edit(), { kind: 'transition', transition: 'slide', afterClip: 'c1' }, 0),
    ).toEqual({
      start: 5000 - 750,
      end: 5000 + 750,
    })
    expect(
      previewWindow(edit(), { kind: 'transition', transition: 'slide', afterClip: 'nope' }, 0),
    ).toBeNull()
    expect(previewWindow(edit(), { kind: 'music', url: 'x', name: 'x' }, 0)).toBeNull()
  })

  it('so sánh mục xem thử theo nội dung', () => {
    expect(
      samePreview({ kind: 'effect', effect: 'shake' }, { kind: 'effect', effect: 'shake' }),
    ).toBe(true)
    expect(
      samePreview({ kind: 'effect', effect: 'shake' }, { kind: 'effect', effect: 'blur' }),
    ).toBe(false)
    expect(samePreview(null, { kind: 'effect', effect: 'shake' })).toBe(false)
  })
})
