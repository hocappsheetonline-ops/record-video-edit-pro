import { describe, expect, it } from 'vitest'
import {
  audioClipBars,
  audioClipGain,
  audioClipMediaTime,
  dragAudioClip,
  parseAudioClips,
  planAudioClips,
  type AudioClip,
} from './audio-clips'

const music: AudioClip = {
  id: 'm',
  file: 'asset-song.mp3',
  name: 'Song',
  kind: 'music',
  start: 1000,
  offset: 500,
  duration: 8000,
  sourceDuration: 3000,
  volume: 0.5,
  fadeIn: 1000,
  fadeOut: 2000,
  loop: true,
}

describe('audioClipGain / audioClipMediaTime', () => {
  it('âm lượng: tăng dần, giữ, giảm dần; ngoài đoạn = 0', () => {
    expect(audioClipGain(music, 999)).toBe(0)
    expect(audioClipGain(music, 1500)).toBeCloseTo(0.25)
    expect(audioClipGain(music, 4000)).toBe(0.5)
    expect(audioClipGain(music, 8000)).toBeCloseTo(0.25)
    expect(audioClipGain(music, 9000)).toBe(0)
  })

  it('vị trí trong file, có lặp lại khi hết file', () => {
    expect(audioClipMediaTime(music, 1000)).toBe(500)
    expect(audioClipMediaTime(music, 3400)).toBe(2900)
    expect(audioClipMediaTime(music, 3600)).toBe(100)
    expect(audioClipMediaTime({ ...music, loop: false }, 3600)).toBeNull()
    expect(audioClipMediaTime(music, 500)).toBeNull()
  })
})

describe('planAudioClips', () => {
  it('cắt gọn trong độ dài video; không lặp thì dừng ở cuối file', () => {
    expect(planAudioClips([music], 6000)).toEqual([
      {
        file: 'asset-song.mp3',
        kind: 'music',
        mediaStart: 0.5,
        duration: 5,
        outputStart: 1,
        volume: 0.5,
        fadeIn: 1,
        fadeOut: 2,
        loop: true,
      },
    ])
    const once = planAudioClips([{ ...music, loop: false }], 60_000)[0]!
    expect(once.duration).toBe(2.5)
    // Fade không dài quá nửa đoạn.
    expect(once.fadeOut).toBe(1.25)
    expect(planAudioClips([{ ...music, start: 7000 }], 7000)).toEqual([])
    expect(planAudioClips([{ ...music, volume: 0 }], 60_000)).toEqual([])
  })
})

describe('dragAudioClip', () => {
  it('di chuyển trong video', () => {
    expect(dragAudioClip(music, 'move', -5000, 20_000).start).toBe(0)
    expect(dragAudioClip(music, 'move', 50_000, 20_000).start).toBe(19_800)
  })

  it('cắt đầu: điểm cuối giữ nguyên, không lùi quá đầu file', () => {
    const r = dragAudioClip(music, 'start', 1000, 20_000)
    expect(r).toMatchObject({ start: 2000, offset: 1500, duration: 7000 })
    expect(dragAudioClip(music, 'start', -5000, 20_000)).toMatchObject({ start: 500, offset: 0 })
  })

  it('kéo dài cuối: nhạc lặp kéo thoải mái, hiệu ứng không lặp dừng ở cuối file', () => {
    expect(dragAudioClip(music, 'end', 10_000, 20_000).duration).toBe(18_000)
    const sfx = { ...music, loop: false, kind: 'sfx' as const, duration: 1000 }
    expect(dragAudioClip(sfx, 'end', 10_000, 20_000).duration).toBe(2500)
    expect(dragAudioClip(sfx, 'end', -5000, 20_000).duration).toBe(200)
  })
})

describe('audioClipBars', () => {
  it('theo phần đã cắt và lặp lại khi file ngắn hơn đoạn', () => {
    // File 3 giây: 1s im lặng, 2s có tiếng (đỉnh 200).
    const wave = { bucketMs: 100, peaks: Array.from({ length: 30 }, (_, i) => (i < 10 ? 0 : 200)) }
    const clip = { ...music, start: 0, offset: 0, duration: 6000, loop: true }
    const bars = audioClipBars(clip, wave, 6)
    expect(bars).toEqual([0, 1, 1, 0, 1, 1])
    expect(audioClipBars({ ...clip, loop: false }, wave, 6)).toEqual([0, 1, 1, 0, 0, 0])
    expect(audioClipBars({ ...clip, offset: 1000, duration: 2000 }, wave, 2)).toEqual([1, 1])
  })
})

describe('parseAudioClips', () => {
  it('bỏ mục hỏng và tên file có đường dẫn', () => {
    expect(parseAudioClips([music])).toEqual([music])
    expect(parseAudioClips([{ ...music, file: '../x.mp3' }, { id: 1 }, null])).toEqual([])
    expect(parseAudioClips('x')).toEqual([])
  })
})
