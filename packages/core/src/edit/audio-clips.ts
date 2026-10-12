/** Một đoạn âm thanh thêm vào video: nhạc nền hoặc hiệu ứng âm thanh (kiểu CapCut). */
export interface AudioClip {
  id: string
  /** Tên file trong thư mục dự án (đã sao chép vào dự án, nên chia sẻ dự án vẫn có). */
  file: string
  name: string
  kind: 'music' | 'sfx'
  /** Vị trí bắt đầu trên video xuất (ms). */
  start: number
  /** Bắt đầu phát từ ms thứ mấy của file. */
  offset: number
  /** Độ dài đoạn trên timeline (ms). */
  duration: number
  /** Độ dài thật của file (ms). */
  sourceDuration: number
  /** Âm lượng 0..2 (1 = giữ nguyên). */
  volume: number
  /** Thời gian âm lượng tăng dần lúc đầu / giảm dần lúc cuối (ms). */
  fadeIn: number
  fadeOut: number
  /** Lặp lại file khi đoạn dài hơn file (nhạc nền). */
  loop: boolean
}

export const MIN_AUDIO_CLIP_MS = 200

/** Hiệu ứng âm thanh có sẵn (tự tổng hợp bằng FFmpeg, không vướng bản quyền). */
export const SOUND_EFFECT_IDS = [
  'whoosh',
  'pop',
  'ding',
  'boom',
  'click',
  'rise',
  'sadTrombone',
  'tada',
  'bleep',
  'shutter',
  'applause',
  // Âm thanh meme (tự tổng hợp).
  'vineBoom',
  'failBuzzer',
  'recordScratch',
  'airhorn',
  'drumroll',
  'cashRegister',
  'crickets',
  'boing',
  'swooshUp',
  'heartbeat',
] as const
export type SoundEffectId = (typeof SOUND_EFFECT_IDS)[number]

let counter = 0
export function newAudioClipId(): string {
  counter += 1
  return `a${Date.now().toString(36)}${counter}`
}

/** Hệ số âm lượng tại thời điểm xuất `t` (0 ngoài đoạn), gồm cả fade vào/ra. */
export function audioClipGain(clip: AudioClip, t: number): number {
  const local = t - clip.start
  if (local < 0 || local >= clip.duration) return 0
  let gain = clip.volume
  if (clip.fadeIn > 0 && local < clip.fadeIn) gain *= local / clip.fadeIn
  const remaining = clip.duration - local
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) gain *= remaining / clip.fadeOut
  return Math.max(0, gain)
}

/** Vị trí cần phát trong file (ms) tại thời điểm xuất `t`; null nếu ngoài đoạn hoặc đã hết file. */
export function audioClipMediaTime(clip: AudioClip, t: number): number | null {
  const local = t - clip.start
  if (local < 0 || local >= clip.duration) return null
  const raw = clip.offset + local
  if (raw < clip.sourceDuration) return raw
  if (!clip.loop || clip.sourceDuration <= 0) return null
  return raw % clip.sourceDuration
}

export interface AudioClipPiece {
  file: string
  /** Giây trong file bắt đầu lấy. */
  mediaStart: number
  /** Độ dài (giây) trên video xuất. */
  duration: number
  /** Vị trí trên video xuất (giây). */
  outputStart: number
  volume: number
  fadeIn: number
  fadeOut: number
  loop: boolean
}

/** Các đoạn nhạc/hiệu ứng cần trộn khi xuất, cắt gọn trong độ dài video. */
export function planAudioClips(
  clips: readonly AudioClip[],
  outputDurationMs: number,
): AudioClipPiece[] {
  return clips.flatMap((c) => {
    const end = Math.min(c.start + c.duration, outputDurationMs)
    // Không lặp thì không phát quá cuối file.
    const fileEnd = c.loop ? Infinity : c.start + (c.sourceDuration - c.offset)
    const stop = Math.min(end, fileEnd)
    if (stop - c.start < 20 || c.volume <= 0) return []
    const duration = stop - c.start
    return [
      {
        file: c.file,
        mediaStart: c.offset / 1000,
        duration: duration / 1000,
        outputStart: c.start / 1000,
        volume: c.volume,
        fadeIn: Math.min(c.fadeIn, duration / 2) / 1000,
        fadeOut: Math.min(c.fadeOut, duration / 2) / 1000,
        loop: c.loop,
      },
    ]
  })
}

/** Kéo đoạn âm thanh trên timeline: di chuyển, hoặc cắt đầu/cuối, luôn trong giới hạn hợp lệ. */
export function dragAudioClip(
  origin: AudioClip,
  mode: 'move' | 'start' | 'end',
  deltaMs: number,
  outputDurationMs: number,
): AudioClip {
  if (mode === 'move') {
    const start = Math.max(
      0,
      Math.min(outputDurationMs - MIN_AUDIO_CLIP_MS, origin.start + deltaMs),
    )
    return { ...origin, start }
  }
  if (mode === 'start') {
    // Cắt đầu: lùi điểm bắt đầu trong file cùng lượng, giữ nguyên điểm kết thúc.
    const minDelta = Math.max(-origin.start, -origin.offset)
    const maxDelta = origin.duration - MIN_AUDIO_CLIP_MS
    const d = Math.max(minDelta, Math.min(maxDelta, deltaMs))
    return {
      ...origin,
      start: origin.start + d,
      offset: origin.offset + d,
      duration: origin.duration - d,
    }
  }
  const maxDuration = origin.loop ? Infinity : origin.sourceDuration - origin.offset
  const duration = Math.max(MIN_AUDIO_CLIP_MS, Math.min(maxDuration, origin.duration + deltaMs))
  return { ...origin, duration }
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

export function parseAudioClips(value: unknown): AudioClip[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v): AudioClip[] => {
    if (typeof v !== 'object' || v === null) return []
    const c = v as Record<string, unknown>
    if (typeof c.id !== 'string' || typeof c.file !== 'string' || !/^[\w.-]+$/.test(c.file))
      return []
    const sourceDuration = num(c.sourceDuration, 0, 0, 24 * 3600_000)
    if (sourceDuration <= 0) return []
    return [
      {
        id: c.id,
        file: c.file,
        name: typeof c.name === 'string' ? c.name.slice(0, 120) : c.file,
        kind: c.kind === 'sfx' ? 'sfx' : 'music',
        start: num(c.start, 0, 0, 24 * 3600_000),
        offset: num(c.offset, 0, 0, sourceDuration),
        duration: num(c.duration, sourceDuration, MIN_AUDIO_CLIP_MS, 24 * 3600_000),
        sourceDuration,
        volume: num(c.volume, 1, 0, 2),
        fadeIn: num(c.fadeIn, 0, 0, 10_000),
        fadeOut: num(c.fadeOut, 0, 0, 10_000),
        loop: c.loop === true,
      },
    ]
  })
}

/** Cột dạng sóng (0..1) để vẽ một đoạn nhạc/hiệu ứng trên timeline, theo đúng phần đã cắt và lặp. */
export function audioClipBars(
  clip: AudioClip,
  wave: { bucketMs: number; peaks: readonly number[] },
  bars: number,
): number[] {
  const n = Math.max(0, Math.floor(bars))
  const loudest = Math.max(24, ...wave.peaks)
  return Array.from({ length: n }, (_, i) => {
    const t = clip.start + ((i + 0.5) * clip.duration) / n
    const at = audioClipMediaTime(clip, t)
    if (at === null) return 0
    return Math.min(1, (wave.peaks[Math.floor(at / wave.bucketMs)] ?? 0) / loudest)
  })
}
