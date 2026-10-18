/** Hiệu ứng hình áp lên một khoảng thời gian của video xuất (kiểu CapCut "Hiệu ứng"). */
export const EFFECT_KINDS = [
  // Chuyển động
  'shake',
  'pulse',
  'zoomPunch',
  'bounce',
  'mirror',
  // Glitch / retro
  'glitch',
  'vhs',
  'rgbSplit',
  'pixelate',
  'grain',
  // Màu sắc
  'bw',
  'vintage',
  'invert',
  'duotone',
  'warm',
  'cool',
  // Ánh sáng & khung
  'flash',
  'strobe',
  'glow',
  'lightLeak',
  'vignette',
  'spotlight',
  'letterbox',
  'blur',
  // Hạt
  'confetti',
  'sparkle',
  'snow',
] as const
export type EffectKind = (typeof EFFECT_KINDS)[number]

export const EFFECT_CATEGORIES = ['motion', 'glitch', 'color', 'light', 'particles'] as const
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number]

/** Nhóm của từng hiệu ứng (để bày trong Thư viện và cho AI chọn theo mục đích). */
export const EFFECT_CATEGORY: Record<EffectKind, EffectCategory> = {
  shake: 'motion',
  pulse: 'motion',
  zoomPunch: 'motion',
  bounce: 'motion',
  mirror: 'motion',
  glitch: 'glitch',
  vhs: 'glitch',
  rgbSplit: 'glitch',
  pixelate: 'glitch',
  grain: 'glitch',
  bw: 'color',
  vintage: 'color',
  invert: 'color',
  duotone: 'color',
  warm: 'color',
  cool: 'color',
  flash: 'light',
  strobe: 'light',
  glow: 'light',
  lightLeak: 'light',
  vignette: 'light',
  spotlight: 'light',
  letterbox: 'light',
  blur: 'light',
  confetti: 'particles',
  sparkle: 'particles',
  snow: 'particles',
}

/** Mô tả ngắn (tiếng Anh, cho lời nhắc AI) — khi nào nên dùng hiệu ứng này. */
export const EFFECT_INFO: Record<EffectKind, string> = {
  shake: 'camera shake; impact, surprise, "boom" moments',
  pulse: 'rhythmic zoom pulse every 0.5 s; music beats, energetic intros',
  zoomPunch: 'one quick punch-in that settles back; emphasise a reveal or a key word',
  bounce: 'frame bobs up and down; playful, meme-like moments',
  mirror: 'left half mirrored to the right; abstract, music-video look',
  glitch: 'digital glitch bursts; errors, bugs, tech transitions',
  vhs: 'retro VHS tape: scanlines, noise, colour bleed; nostalgia',
  rgbSplit: 'chromatic aberration (red / blue offset); edgy, cyber feel',
  pixelate: 'whole frame pixelated to big blocks; "loading", 8-bit, censor jokes',
  grain: 'film grain; cinematic, documentary feel',
  bw: 'black & white; flashbacks, serious or "before" segments',
  vintage: 'sepia faded film; old memories',
  invert: 'inverted colours; shock, "wrong!" moments',
  duotone: 'two-colour poster look (purple / orange); stylised intros',
  warm: 'warm golden tint; cosy, friendly segments',
  cool: 'cool teal / blue tint; calm, professional, night mood',
  flash: 'white flash every 0.5 s fading out; beat drops',
  strobe: 'fast strobe flashes (6 / s); hype, countdowns (use briefly)',
  glow: 'soft bloom glow; dreamy, highlight something beautiful',
  lightLeak: 'drifting warm light leak; vlogs, summer, memories',
  vignette: 'dark edges; focus the centre, cinematic',
  spotlight: 'darken everything except the centre; focus attention on one spot',
  letterbox: 'cinematic black bars (2.35:1); film-like segments',
  blur: 'whole frame blurred; dreamy or "unfocused" segments, behind text',
  confetti: 'falling confetti; success, celebration, "done!"',
  sparkle: 'twinkling sparkles; premium, magic, beautiful results',
  snow: 'falling snow; winter, holidays, calm',
}

export interface EffectRegion {
  id: string
  kind: EffectKind
  /** Khoảng trên video xuất (ms). */
  start: number
  end: number
  /** Độ mạnh 0..1. */
  intensity: number
}

export interface ActiveEffect {
  kind: EffectKind
  intensity: number
  /** Thời gian đã chạy kể từ đầu hiệu ứng (ms) — cho chuyển động theo thời gian. */
  local: number
  /** Tiến trình 0..1 qua cả hiệu ứng. */
  progress: number
}

export const DEFAULT_EFFECT_MS = 2000
export const MIN_REGION_MS = 200

let counter = 0
export function newEffectId(): string {
  counter += 1
  return `e${Date.now().toString(36)}${counter}`
}

/** Các hiệu ứng đang chạy tại thời điểm xuất `t`, theo thứ tự thêm vào. */
export function effectsAt(effects: readonly EffectRegion[], t: number): ActiveEffect[] {
  return effects
    .filter((e) => t >= e.start && t < e.end && e.intensity > 0)
    .map((e) => ({
      kind: e.kind,
      intensity: e.intensity,
      local: t - e.start,
      progress: (t - e.start) / (e.end - e.start),
    }))
}

/** Kéo một khoảng thời gian trên timeline (di chuyển hoặc kéo mép), luôn nằm trong video. */
export function dragRegion<T extends { start: number; end: number }>(
  origin: T,
  mode: 'move' | 'start' | 'end',
  delta: number,
  total: number,
  min = MIN_REGION_MS,
): T {
  if (mode === 'move') {
    const shift = Math.min(Math.max(delta, -origin.start), total - origin.end)
    return { ...origin, start: origin.start + shift, end: origin.end + shift }
  }
  if (mode === 'start')
    return { ...origin, start: Math.min(origin.end - min, Math.max(0, origin.start + delta)) }
  return { ...origin, end: Math.max(origin.start + min, Math.min(total, origin.end + delta)) }
}

export function parseEffects(value: unknown): EffectRegion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v): EffectRegion[] => {
    if (typeof v !== 'object' || v === null) return []
    const e = v as Record<string, unknown>
    if (typeof e.id !== 'string' || !EFFECT_KINDS.includes(e.kind as EffectKind)) return []
    const start = typeof e.start === 'number' && e.start >= 0 ? e.start : NaN
    const end = typeof e.end === 'number' ? e.end : NaN
    if (!(end - start >= MIN_REGION_MS)) return []
    const intensity =
      typeof e.intensity === 'number' && Number.isFinite(e.intensity)
        ? Math.min(1, Math.max(0, e.intensity))
        : 0.7
    return [{ id: e.id, kind: e.kind as EffectKind, start, end, intensity }]
  })
}
