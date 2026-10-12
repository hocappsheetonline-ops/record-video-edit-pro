import { describe, expect, it } from 'vitest'
import {
  audioFxFilters,
  needsAiDenoise,
  type AudioFx,
  audioFxKey,
  DEFAULT_AUDIO_FX,
  isDefaultFx,
  parseAudioFx,
  processedFileName,
} from './audio-fx'

describe('audio-fx', () => {
  it('đọc file: giá trị sai về mặc định, cao độ kẹp và làm tròn', () => {
    expect(parseAudioFx(undefined)).toEqual(DEFAULT_AUDIO_FX)
    expect(
      parseAudioFx({ noise: 'max', enhance: 1, normalize: true, voice: 'cat', pitch: 30.4 }),
    ).toEqual({ noise: 'off', enhance: false, normalize: true, voice: 'none', pitch: 12 })
    expect(parseAudioFx({ noise: 'medium', voice: 'robot', pitch: -2.6 })).toMatchObject({
      noise: 'medium',
      voice: 'robot',
      pitch: -3,
    })
  })

  it('khóa ổn định, khác nhau theo từng thiết lập; tên file đã xử lý an toàn', () => {
    expect(isDefaultFx(DEFAULT_AUDIO_FX)).toBe(true)
    expect(isDefaultFx(undefined)).toBe(true)
    const a = { ...DEFAULT_AUDIO_FX, noise: 'medium' as const, enhance: true }
    expect(isDefaultFx(a)).toBe(false)
    expect(audioFxKey(a)).toBe('n2e')
    expect(audioFxKey({ ...DEFAULT_AUDIO_FX, pitch: -5 })).toBe('n0pd5')
    expect(audioFxKey({ ...DEFAULT_AUDIO_FX, voice: 'deep', pitch: 4 })).toBe('n0v2')
    const keys = new Set(
      [
        DEFAULT_AUDIO_FX,
        a,
        { ...a, normalize: true },
        { ...DEFAULT_AUDIO_FX, pitch: 5 },
        { ...DEFAULT_AUDIO_FX, pitch: -5 },
        { ...DEFAULT_AUDIO_FX, voice: 'echo' as const },
      ].map(audioFxKey),
    )
    expect(keys.size).toBe(6)
    expect(processedFileName('seg0-mic.webm', a)).toBe('fx-seg0-mic-n2e.m4a')
    expect(processedFileName('seg0-mic.webm', a)).toMatch(/^[\w.-]+$/)
  })

  it('chuỗi bộ lọc theo thứ tự: tạp âm → giọng → hiệu ứng → chuẩn hóa', () => {
    expect(audioFxFilters(DEFAULT_AUDIO_FX, true)).toEqual([])
    const strong = { noise: 'strong', enhance: true, normalize: true, voice: 'chipmunk', pitch: 0 }
    expect(needsAiDenoise(strong as AudioFx)).toBe(true)
    expect(needsAiDenoise({ ...DEFAULT_AUDIO_FX, noise: 'light' })).toBe(false)
    // Đã lọc bằng RNNoise: mức mạnh chỉ thêm lọc phổ nhẹ phía sau.
    expect(audioFxFilters(strong as AudioFx, true)).toEqual([
      'afftdn=nf=-20:nt=w',
      'highpass=f=80',
      'deesser=i=0.4',
      'acompressor=threshold=-18dB:ratio=3:attack=5:release=60:makeup=2',
      'rubberband=pitch=1.5',
      'loudnorm=I=-16:TP=-1.5:LRA=11',
      'aresample=48000',
    ])
    // Không chạy được AI thì dùng lọc phổ.
    expect(audioFxFilters({ ...DEFAULT_AUDIO_FX, noise: 'medium' }, false)).toEqual([
      'afftdn=nf=-25:nr=30:nt=w',
    ])
    expect(audioFxFilters({ ...DEFAULT_AUDIO_FX, noise: 'medium' }, true)).toEqual([])
    expect(audioFxFilters({ ...DEFAULT_AUDIO_FX, pitch: 12 }, false)).toEqual([
      'rubberband=pitch=2.00000',
    ])
  })
})
