/** Lọc tạp âm và hiệu ứng giọng (kiểu CapCut) cho micro, âm thanh máy và các đoạn âm thanh. */

export const NOISE_LEVELS = ['off', 'light', 'medium', 'strong'] as const
export type NoiseLevel = (typeof NOISE_LEVELS)[number]

export const VOICE_FX = ['none', 'chipmunk', 'deep', 'robot', 'echo', 'radio', 'megaphone'] as const
export type VoiceFx = (typeof VOICE_FX)[number]

export interface AudioFx {
  /** Lọc tạp âm: nhẹ (lọc phổ), vừa (AI rnnoise), mạnh (AI + lọc phổ). */
  noise: NoiseLevel
  /** Tăng cường giọng nói: bỏ tiếng ù tần thấp, khử tiếng xì, nén nhẹ cho giọng rõ, đều. */
  enhance: boolean
  /** Chuẩn hóa độ to về -16 LUFS (chuẩn YouTube / podcast). */
  normalize: boolean
  voice: VoiceFx
  /** Cao độ (bán cung, -12..12) khi không dùng hiệu ứng giọng có sẵn. */
  pitch: number
}

export const DEFAULT_AUDIO_FX: AudioFx = {
  noise: 'off',
  enhance: false,
  normalize: false,
  voice: 'none',
  pitch: 0,
}

export function isDefaultFx(fx: AudioFx | undefined): boolean {
  return (
    !fx ||
    (fx.noise === 'off' && !fx.enhance && !fx.normalize && fx.voice === 'none' && fx.pitch === 0)
  )
}

export function parseAudioFx(value: unknown): AudioFx {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_AUDIO_FX }
  const v = value as Record<string, unknown>
  const pitch =
    typeof v.pitch === 'number' && Number.isFinite(v.pitch)
      ? Math.round(Math.min(12, Math.max(-12, v.pitch)))
      : 0
  return {
    noise: NOISE_LEVELS.includes(v.noise as NoiseLevel) ? (v.noise as NoiseLevel) : 'off',
    enhance: v.enhance === true,
    normalize: v.normalize === true,
    voice: VOICE_FX.includes(v.voice as VoiceFx) ? (v.voice as VoiceFx) : 'none',
    pitch,
  }
}

/** Khóa ổn định, ngắn gọn của một bộ hiệu ứng (để đặt tên file đã xử lý). */
export function audioFxKey(fx: AudioFx): string {
  const p = fx.voice === 'none' ? fx.pitch : 0
  return [
    `n${NOISE_LEVELS.indexOf(fx.noise)}`,
    fx.enhance ? 'e' : '',
    fx.normalize ? 'z' : '',
    fx.voice === 'none' ? '' : `v${VOICE_FX.indexOf(fx.voice)}`,
    p ? `p${p > 0 ? 'u' : 'd'}${Math.abs(p)}` : '',
  ].join('')
}

/** Tên file đã xử lý trong thư mục dự án: `fx-<tên gốc>-<khóa>.m4a` (tạo lại được, không chia sẻ). */
export function processedFileName(file: string, fx: AudioFx): string {
  return `fx-${file.replace(/\.[^.]+$/, '')}-${audioFxKey(fx)}.m4a`
}

/**
 * Chuỗi bộ lọc FFmpeg cho bộ hiệu ứng. `model`: đường dẫn model rnnoise (đã thoát ký tự cho bộ lọc);
 * null thì mức vừa / mạnh dùng lọc phổ thay cho AI. Không đổi độ dài âm thanh (giữ khớp timeline).
 */
export function audioFxFilters(fx: AudioFx, model: string | null): string[] {
  const filters: string[] = []
  const ai = model ? `arnndn=m=${model}` : 'afftdn=nf=-25:nr=30:nt=w'
  if (fx.noise === 'light') filters.push('afftdn=nf=-25:nt=w')
  if (fx.noise === 'medium') filters.push(ai)
  if (fx.noise === 'strong') filters.push(ai, 'afftdn=nf=-20:nt=w')
  if (fx.enhance)
    filters.push(
      'highpass=f=80',
      'deesser=i=0.4',
      'acompressor=threshold=-18dB:ratio=3:attack=5:release=60:makeup=2',
    )
  switch (fx.voice) {
    case 'chipmunk':
      filters.push('rubberband=pitch=1.5')
      break
    case 'deep':
      filters.push('rubberband=pitch=0.7')
      break
    case 'robot':
      filters.push(
        "afftfilt=real='hypot(re\\,im)*sin(0)':imag='hypot(re\\,im)*cos(0)':win_size=512:overlap=0.75",
        'volume=2.5',
      )
      break
    case 'echo':
      filters.push('aecho=0.8:0.88:60:0.4')
      break
    case 'radio':
      filters.push('highpass=f=300', 'lowpass=f=3000', 'acompressor=ratio=4', 'volume=1.5')
      break
    case 'megaphone':
      filters.push('highpass=f=500', 'lowpass=f=2500', 'acrusher=bits=8:mix=0.3', 'volume=1.4')
      break
    case 'none':
      if (fx.pitch) filters.push(`rubberband=pitch=${(2 ** (fx.pitch / 12)).toFixed(5)}`)
  }
  // loudnorm đổi tần số lấy mẫu lên 192 kHz: đưa về 48 kHz.
  if (fx.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11', 'aresample=48000')
  return filters
}
