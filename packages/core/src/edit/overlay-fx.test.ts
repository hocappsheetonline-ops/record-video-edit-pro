import { describe, expect, it } from 'vitest'
import {
  animMotion,
  ANIM_IN,
  ANIM_LOOP,
  ANIM_OUT,
  compositeOf,
  easeValue,
  editPose,
  keyframeAt,
  moveKeyframe,
  NO_ANIM,
  parseAnim,
  parseKeyframes,
  parseMask,
  poseAt,
  removeKeyframe,
  setKeyframe,
  STILL_MOTION,
  type Keyframe,
  type Pose,
} from './overlay-fx'
import { dragOverlay, overlayPose, parseOverlays, posedOverlay, type Overlay } from './overlays'

const span = { start: 1000, end: 4000 }

describe('hoạt ảnh vào / ra / lặp', () => {
  it('mọi kiểu vào: bắt đầu khác trạng thái tĩnh, hết thời lượng thì đứng yên đúng chỗ', () => {
    for (const kind of ANIM_IN.filter((k) => k !== 'none')) {
      const anim = { ...NO_ANIM, in: kind, inMs: 400 }
      expect(animMotion({ ...span, anim }, 1000), kind).not.toEqual(STILL_MOTION)
      const settled = animMotion({ ...span, anim }, 1400)
      for (const [key, value] of Object.entries(STILL_MOTION))
        expect(settled[key as keyof typeof settled], `${kind}.${key}`).toBeCloseTo(value, 5)
    }
  })

  it('mọi kiểu ra: còn nguyên giữa chừng, khác đi khi sắp hết', () => {
    for (const kind of ANIM_OUT.filter((k) => k !== 'none')) {
      const anim = { ...NO_ANIM, out: kind, outMs: 400 }
      expect(animMotion({ ...span, anim }, 2000), kind).toEqual(STILL_MOTION)
      expect(animMotion({ ...span, anim }, 3950), kind).not.toEqual(STILL_MOTION)
    }
    // Mờ dần: còn nửa ở 200ms trước khi hết (thời lượng 400ms).
    const fade = { ...NO_ANIM, out: 'fade' as const, outMs: 400 }
    expect(animMotion({ ...span, anim: fade }, 3800).opacity).toBeCloseTo(0.5)
  })

  it('mọi kiểu lặp đều chuyển động theo chu kỳ', () => {
    for (const kind of ANIM_LOOP.filter((k) => k !== 'none')) {
      const anim = { ...NO_ANIM, loop: kind, loopMs: 1000 }
      const samples = [1100, 1250, 1400, 1650].map((t) => animMotion({ ...span, anim }, t))
      expect(new Set(samples.map((m) => JSON.stringify(m))).size, kind).toBeGreaterThan(1)
      // Hết một chu kỳ thì quay về như cũ.
      const a = animMotion({ ...span, anim }, 1100)
      const b = animMotion({ ...span, anim }, 2100)
      for (const key of Object.keys(a) as (keyof typeof a)[])
        expect(b[key], `${kind}.${key}`).toBeCloseTo(a[key], 9)
    }
  })

  it('máy đánh chữ hiện dần; trượt lên đi từ dưới lên; độ mờ luôn trong 0..1', () => {
    const type = { ...NO_ANIM, in: 'typewriter' as const, inMs: 1000 }
    expect(animMotion({ ...span, anim: type }, 1500).reveal).toBeCloseTo(0.5)
    const up = { ...NO_ANIM, in: 'slideUp' as const, inMs: 400 }
    expect(animMotion({ ...span, anim: up }, 1000).dy).toBeGreaterThan(0)
    const flicker = { ...NO_ANIM, in: 'fade' as const, loop: 'flicker' as const }
    for (let t = 1000; t < 4000; t += 37) {
      const o = animMotion({ ...span, anim: flicker }, t).opacity
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThanOrEqual(1)
    }
  })

  it('đọc: giá trị sai về mặc định, thời lượng kẹp', () => {
    expect(parseAnim({ in: 'warp', inMs: 99_999, out: 'spin', loop: 'pulse' })).toMatchObject({
      in: 'none',
      inMs: 5000,
      out: 'spin',
      loop: 'pulse',
    })
  })
})

const base: Pose = { x: 0.5, y: 0.5, size: 0.2, rotation: 0, opacity: 1 }
const kf = (t: number, x: number, ease: Keyframe['ease'] = 'linear'): Keyframe => ({
  ...base,
  id: `k${t}`,
  t,
  x,
  ease,
})

describe('keyframe', () => {
  it('nội suy giữa hai keyframe; trước / sau thì giữ; không có thì dùng giá trị gốc', () => {
    const list = [kf(0, 0.2), kf(2000, 0.8)]
    expect(poseAt(base, undefined, 500)).toEqual(base)
    expect(poseAt(base, list, -100).x).toBe(0.2)
    expect(poseAt(base, list, 500).x).toBeCloseTo(0.35)
    expect(poseAt(base, list, 5000).x).toBe(0.8)
    // Chậm dần: đi nhanh lúc đầu.
    const eased = [kf(0, 0.2, 'easeOut'), kf(2000, 0.8)]
    expect(poseAt(base, eased, 500).x).toBeGreaterThan(0.35)
    expect(easeValue('easeInOut', 0.5)).toBeCloseTo(0.5)
    expect(easeValue('easeIn', 0.5)).toBeCloseTo(0.25)
  })

  it('sửa khi chưa có keyframe: sửa giá trị gốc; đã có: thêm / sửa keyframe tại đầu phát', () => {
    expect(editPose(base, undefined, 700, { x: 0.1 })).toEqual({
      base: { ...base, x: 0.1 },
      keyframes: undefined,
    })
    const list = [kf(0, 0.2), kf(2000, 0.8)]
    const added = editPose(base, list, 1000, { y: 0.9 }).keyframes!
    expect(added.map((k) => k.t)).toEqual([0, 1000, 2000])
    // Keyframe mới mang tư thế đang thấy (x nội suy = 0.5) + phần sửa.
    expect(added[1]).toMatchObject({ x: 0.5, y: 0.9 })
    const updated = editPose(base, added, 1020, { x: 0.6 }).keyframes!
    expect(updated).toHaveLength(3)
    expect(keyframeAt(updated, 1000)?.x).toBe(0.6)
    expect(setKeyframe(base, undefined, 300)).toEqual([
      expect.objectContaining({ t: 300, x: 0.5, ease: 'linear' }),
    ])
  })

  it('dời / xóa keyframe giữ thứ tự và giới hạn trong lớp', () => {
    const list = [kf(0, 0.2), kf(1000, 0.5), kf(2000, 0.8)]
    expect(moveKeyframe(list, 'k0', 1500, 3000).map((k) => k.id)).toEqual(['k1000', 'k0', 'k2000'])
    expect(moveKeyframe(list, 'k2000', 99_999, 3000)[2]!.t).toBe(3000)
    expect(removeKeyframe(list, 'k1000').map((k) => k.id)).toEqual(['k0', 'k2000'])
  })

  it('đọc keyframe: bỏ mục hỏng, sắp theo thời gian', () => {
    expect(parseKeyframes('x')).toBeUndefined()
    const list = parseKeyframes([{ t: 900, x: 9 }, { t: 'a' }, { t: 100, ease: 'bogus' }])!
    expect(list.map((k) => [k.t, k.ease])).toEqual([
      [100, 'linear'],
      [900, 'linear'],
    ])
    expect(list[1]!.x).toBe(1.5)
  })
})

const overlay: Overlay = {
  id: 'o',
  kind: 'image',
  start: 1000,
  end: 4000,
  x: 0.5,
  y: 0.5,
  size: 0.3,
  rotation: 0,
  anim: NO_ANIM,
  text: '',
  style: 'meme',
  color: '#ffffff',
  file: 'meme-a.png',
  aspect: 1,
  mediaOffset: 0,
  sourceDuration: 0,
  hasAudio: false,
  volume: 1,
  keyColor: '',
  keyStrength: 0.4,
}

describe('lớp phủ nâng cao', () => {
  it('tư thế theo keyframe tính từ lúc lớp xuất hiện; lớp không keyframe giữ nguyên', () => {
    const moving = { ...overlay, keyframes: [kf(0, 0.2), kf(2000, 0.8)] }
    expect(overlayPose(moving, 1500).x).toBeCloseTo(0.35)
    expect(posedOverlay(moving, 3000).x).toBeCloseTo(0.8)
    expect(posedOverlay(overlay, 3000)).toBe(overlay)
    expect(overlayPose({ ...overlay, opacity: 0.4 }, 2000).opacity).toBe(0.4)
  })

  it('cắt đầu lớp trên timeline: keyframe đứng yên trên video xuất', () => {
    const moving = { ...overlay, keyframes: [kf(0, 0.2), kf(2000, 0.8)] }
    const trimmed = dragOverlay(moving, 'start', 500, 10_000)
    expect(trimmed.start).toBe(1500)
    expect(trimmed.keyframes!.map((k) => k.t)).toEqual([0, 1500])
    expect(overlayPose(trimmed, 3000).x).toBeCloseTo(overlayPose(moving, 3000).x)
    // Dời cả lớp: keyframe đi theo.
    expect(dragOverlay(moving, 'move', 500, 10_000).keyframes).toEqual(moving.keyframes)
  })

  it('hòa trộn → phép ghép canvas; mặt nạ chỉ cho ảnh / video; đọc lại đủ', () => {
    expect(compositeOf(undefined)).toBe('source-over')
    expect(compositeOf('add')).toBe('lighter')
    expect(compositeOf('screen')).toBe('screen')
    expect(parseMask({ shape: 'none' })).toBeUndefined()
    expect(parseMask({ shape: 'heart', scale: 9, feather: -1 })).toMatchObject({
      shape: 'heart',
      scale: 2,
      feather: 0,
    })
    const [img, text] = parseOverlays([
      {
        ...overlay,
        opacity: 0.5,
        blend: 'screen',
        flipH: true,
        mask: { shape: 'circle' },
        keyframes: [{ t: 0, x: 0.1 }],
      },
      { ...overlay, id: 't', kind: 'text', text: 'hi', mask: { shape: 'circle' }, blend: 'normal' },
    ])
    expect(img).toMatchObject({ opacity: 0.5, blend: 'screen', flipH: true })
    expect(img!.mask?.shape).toBe('circle')
    expect(img!.keyframes).toHaveLength(1)
    expect(text).not.toHaveProperty('mask')
    expect(text).not.toHaveProperty('blend')
    expect(text).not.toHaveProperty('opacity')
  })
})
