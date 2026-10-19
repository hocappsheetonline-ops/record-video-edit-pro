import { describe, expect, it } from 'vitest'
import {
  dragOverlay,
  overlayAudioClips,
  overlayMaxDuration,
  overlayMediaTime,
  overlayMotion,
  overlaysAt,
  parseOverlays,
  type Overlay,
} from './overlays'
import { DEFAULT_ANIM, NO_ANIM, parseAnim, STILL_MOTION } from './overlay-fx'

/** Lớp có hoạt ảnh kiểu cũ (`animation`), đổi sang dạng mới như khi mở dự án cũ. */
const legacy = (o: Overlay, animation: string): Overlay => ({
  ...o,
  anim: parseAnim(undefined, animation),
})

const base: Overlay = {
  id: 'o',
  kind: 'text',
  start: 1000,
  end: 4000,
  x: 0.5,
  y: 0.2,
  size: 0.1,
  rotation: 0,
  anim: DEFAULT_ANIM,
  text: 'Hết cứu',
  style: 'meme',
  color: '#ffffff',
  file: '',
  aspect: 1,
  mediaOffset: 0,
  sourceDuration: 0,
  hasAudio: false,
  volume: 1,
  keyColor: '',
  keyStrength: 0.4,
}

const meme: Overlay = {
  ...base,
  id: 'v',
  kind: 'video',
  text: 'Bruh',
  file: 'asset-meme-1.mp4',
  aspect: 16 / 9,
  start: 2000,
  end: 5000,
  mediaOffset: 500,
  sourceDuration: 4000,
  hasAudio: true,
  volume: 0.8,
  anim: NO_ANIM,
}

describe('overlays', () => {
  it('chỉ hiện trong khoảng của nó, lớp sau đè lớp trước', () => {
    const list = [base, { ...base, id: 'p', start: 2000 }]
    expect(overlaysAt(list, 500)).toEqual([])
    expect(overlaysAt(list, 1500).map((o) => o.id)).toEqual(['o'])
    expect(overlaysAt(list, 2500).map((o) => o.id)).toEqual(['o', 'p'])
    expect(overlaysAt(list, 4000)).toEqual([])
  })

  it('pop: nở từ 0, vượt nhẹ rồi về đúng cỡ', () => {
    expect(overlayMotion(base, 1000).scale).toBeCloseTo(0)
    const mid = [1100, 1200, 1250, 1300].map((t) => overlayMotion(base, t).scale)
    expect(Math.max(...mid)).toBeGreaterThan(1)
    expect(overlayMotion(base, 1350).scale).toBeCloseTo(1)
    expect(overlayMotion(base, 3000).scale).toBe(1)
  })

  it('fade: hiện dần, mờ dần lúc cuối; slide: trượt từ trái vào', () => {
    const fade = legacy(base, 'fade')
    expect(overlayMotion(fade, 1150).opacity).toBeCloseTo(0.5)
    expect(overlayMotion(fade, 2000).opacity).toBe(1)
    expect(overlayMotion(fade, 3850).opacity).toBeCloseTo(0.5)
    const slide = legacy(base, 'slide')
    expect(overlayMotion(slide, 1000).dx).toBeCloseTo(-0.6)
    expect(overlayMotion(slide, 1400).dx).toBeCloseTo(0)
  })

  it('bounce / shake chuyển động lặp lại; none đứng yên', () => {
    expect(overlayMotion(legacy(base, 'bounce'), 1250).dy).toBeCloseTo(-0.03)
    expect(Math.abs(overlayMotion(legacy(base, 'shake'), 1035).rotate)).toBeGreaterThan(3)
    expect(overlayMotion(legacy(base, 'none'), 1000)).toEqual(STILL_MOTION)
  })

  it('đọc file: ảnh phải có tên file an toàn; giá trị sai về mặc định', () => {
    expect(parseOverlays([base])).toEqual([base])
    expect(parseOverlays([{ ...base, kind: 'image', file: '../x.png' }])).toEqual([])
    expect(parseOverlays([{ ...base, kind: 'gif' }])).toEqual([])
    const fixed = parseOverlays([
      { ...base, anim: undefined, size: 9, animation: 'spin', color: 'red', style: 'x' },
    ])[0]!
    expect(fixed).toMatchObject({ size: 4, color: '#ffffff', style: 'meme' })
    expect(fixed.anim.in).toBe('pop')
    // Dự án cũ: "fade" thành vào + ra mờ dần; "shake" thành lặp.
    const old = parseOverlays([{ ...base, anim: undefined, animation: 'fade' }])[0]!
    expect(old.anim).toMatchObject({ in: 'fade', out: 'fade', loop: 'none' })
  })

  it('vùng che: kiểu và độ mạnh có mặc định, giá trị sai được kẹp', () => {
    const blur = parseOverlays([{ ...base, kind: 'blur', aspect: 1.6 }])[0]!
    expect(blur).toMatchObject({ kind: 'blur', blurMode: 'blur', blurStrength: 0.5, aspect: 1.6 })
    const mosaic = parseOverlays([
      { ...base, kind: 'blur', blurMode: 'pixelate', blurStrength: 9 },
    ])[0]!
    expect(mosaic).toMatchObject({ blurMode: 'pixelate', blurStrength: 1 })
    expect(parseOverlays([{ ...base, kind: 'blur', blurMode: 'swirl' }])[0]!.blurMode).toBe('blur')
    // Lớp chữ không mang trường của vùng che.
    expect(parseOverlays([{ ...base, blurMode: 'pixelate' }])[0]).not.toHaveProperty('blurMode')
  })

  it('video meme: đọc file kiểm tra độ dài, màu phông hợp lệ', () => {
    expect(parseOverlays([meme])).toEqual([meme])
    expect(parseOverlays([{ ...meme, sourceDuration: 0 }])).toEqual([])
    expect(parseOverlays([{ ...meme, file: '' }])).toEqual([])
    const keyed = parseOverlays([
      { ...meme, keyColor: '#00FF00', keyStrength: 5, volume: -1, mediaOffset: 99_999 },
    ])[0]!
    expect(keyed).toMatchObject({
      keyColor: '#00ff00',
      keyStrength: 1,
      volume: 0,
      mediaOffset: 3900,
    })
    expect(parseOverlays([{ ...meme, keyColor: 'green' }])[0]!.keyColor).toBe('')
  })

  it('bộ lọc của ảnh / video meme được đọc lại; chữ và bộ lọc rỗng thì bỏ', () => {
    const base = { id: 'a', start: 0, end: 1000, file: 'meme-a.png' }
    const [img, text, plain] = parseOverlays([
      { ...base, kind: 'image', look: { filter: 'vivid', intensity: 0.7 } },
      { ...base, id: 't', kind: 'text', text: 'hi', look: { filter: 'bw' } },
      { ...base, id: 'p', kind: 'image', look: { filter: 'none' } },
    ])
    expect(img!.look).toMatchObject({ filter: 'vivid', intensity: 0.7 })
    expect(text).not.toHaveProperty('look')
    expect(plain).not.toHaveProperty('look')
  })

  it('video meme: thời điểm trong file, giữ khung cuối khi hết file', () => {
    expect(overlayMediaTime(meme, 2000)).toBe(500)
    expect(overlayMediaTime(meme, 3000)).toBe(1500)
    expect(overlayMediaTime(meme, 9000)).toBe(3999)
    expect(overlayMaxDuration(meme)).toBe(3500)
    expect(overlayMaxDuration(base)).toBe(Infinity)
  })

  it('kéo video meme: cắt đầu bỏ bớt đầu file, kéo dài không quá file', () => {
    const trimmed = dragOverlay(meme, 'start', 300, 60_000)
    expect(trimmed).toMatchObject({ start: 2300, end: 5000, mediaOffset: 800 })
    // Lùi đầu tối đa tới điểm 0 của file.
    expect(dragOverlay(meme, 'start', -2000, 60_000)).toMatchObject({ start: 1500, mediaOffset: 0 })
    expect(dragOverlay(meme, 'end', 5000, 60_000).end).toBe(5500)
    expect(dragOverlay(meme, 'move', 1000, 60_000)).toMatchObject({
      start: 3000,
      end: 6000,
      mediaOffset: 500,
    })
    // Lớp chữ vẫn kéo tự do như cũ.
    expect(dragOverlay(base, 'end', 10_000, 60_000).end).toBe(14_000)
  })

  it('tiếng video meme được trộn như một đoạn âm thanh', () => {
    expect(overlayAudioClips([base, meme])).toEqual([
      expect.objectContaining({
        file: 'asset-meme-1.mp4',
        start: 2000,
        offset: 500,
        duration: 3000,
        sourceDuration: 4000,
        volume: 0.8,
        loop: false,
      }),
    ])
    expect(overlayAudioClips([{ ...meme, hasAudio: false }])).toEqual([])
    expect(overlayAudioClips([{ ...meme, volume: 0 }])).toEqual([])
  })
})
