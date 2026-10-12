/**
 * Lớp phủ nâng cao (kiểu CapCut): hoạt ảnh vào / ra / lặp, keyframe, độ mờ, chế độ hòa trộn, lật và
 * mặt nạ.
 */

export const ANIM_IN = [
  'none',
  'pop',
  'fade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'zoomIn',
  'spin',
  'bounceIn',
  'flipIn',
  'blurIn',
  'typewriter',
] as const
export type AnimIn = (typeof ANIM_IN)[number]

export const ANIM_OUT = [
  'none',
  'fade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'zoomOut',
  'spin',
  'blurOut',
] as const
export type AnimOut = (typeof ANIM_OUT)[number]

export const ANIM_LOOP = ['none', 'bounce', 'shake', 'pulse', 'swing', 'float', 'flicker'] as const
export type AnimLoop = (typeof ANIM_LOOP)[number]

export interface OverlayAnim {
  in: AnimIn
  /** Thời lượng hoạt ảnh vào / ra (ms) và chu kỳ lặp (ms). */
  inMs: number
  out: AnimOut
  outMs: number
  loop: AnimLoop
  loopMs: number
}

export const DEFAULT_ANIM: OverlayAnim = {
  in: 'pop',
  inMs: 350,
  out: 'none',
  outMs: 300,
  loop: 'none',
  loopMs: 1000,
}
export const NO_ANIM: OverlayAnim = { ...DEFAULT_ANIM, in: 'none' }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d
const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T =>
  list.includes(v as T) ? (v as T) : d

/**
 * Đọc hoạt ảnh; bản cũ chỉ có `animation` (pop / fade / slide / bounce / shake / none) được đổi
 * sang dạng vào / ra / lặp cho giống hệt cách chạy cũ.
 */
export function parseAnim(value: unknown, legacy?: unknown): OverlayAnim {
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>
    return {
      in: pick(ANIM_IN, v.in, 'none'),
      inMs: num(v.inMs, DEFAULT_ANIM.inMs, 100, 5000),
      out: pick(ANIM_OUT, v.out, 'none'),
      outMs: num(v.outMs, DEFAULT_ANIM.outMs, 100, 5000),
      loop: pick(ANIM_LOOP, v.loop, 'none'),
      loopMs: num(v.loopMs, DEFAULT_ANIM.loopMs, 200, 5000),
    }
  }
  switch (legacy) {
    case 'none':
      return { ...NO_ANIM }
    case 'fade':
      return { ...NO_ANIM, in: 'fade', inMs: 300, out: 'fade', outMs: 300 }
    case 'slide':
      return { ...NO_ANIM, in: 'slideLeft', inMs: 400 }
    case 'bounce':
      return { ...NO_ANIM, loop: 'bounce' }
    case 'shake':
      return { ...NO_ANIM, loop: 'shake' }
    default:
      return { ...DEFAULT_ANIM }
  }
}

/** Biến đổi do hoạt ảnh tại một thời điểm. */
export interface OverlayMotion {
  scale: number
  opacity: number
  /** Dịch chuyển, tỉ lệ theo chiều cao khung. */
  dx: number
  dy: number
  /** Góc xoay thêm (độ). */
  rotate: number
  /** Co giãn theo chiều ngang (lật vào: 0 → 1). */
  scaleX: number
  /** Độ nhòe, tỉ lệ theo chiều cao khung. */
  blur: number
  /** Phần chữ đã hiện (máy đánh chữ) 0..1. */
  reveal: number
}

export const STILL_MOTION: OverlayMotion = {
  scale: 1,
  opacity: 1,
  dx: 0,
  dy: 0,
  rotate: 0,
  scaleX: 1,
  blur: 0,
  reveal: 1,
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeOutBounce = (t: number) => {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

/** Áp dụng một hoạt ảnh vào (`p` 0 → 1 khi xuất hiện) hoặc ra (`p` 1 → 0 khi sắp biến mất). */
function applyEdge(m: OverlayMotion, kind: AnimIn | AnimOut, p: number, entering: boolean) {
  const q = 1 - p
  switch (kind) {
    case 'pop':
      m.scale *= Math.max(0, easeOutBack(p))
      break
    case 'fade':
      m.opacity *= p
      break
    case 'slideLeft':
    case 'slideRight': {
      // Vào: trượt từ trái (slideLeft) / phải sang. Ra: trượt ra trái / phải.
      const side = kind === 'slideLeft' ? -1 : 1
      const e = entering ? 1 - easeOutBack(p) : q * q
      m.dx += side * e * 0.6
      m.opacity *= Math.min(1, p * 2)
      break
    }
    case 'slideUp':
    case 'slideDown': {
      // slideUp: đi lên (vào từ dưới / ra phía trên); slideDown ngược lại.
      const dir = kind === 'slideUp' ? 1 : -1
      const e = entering ? 1 - easeOutCubic(p) : q * q
      m.dy += (entering ? dir : -dir) * e * 0.4
      m.opacity *= Math.min(1, p * 2)
      break
    }
    case 'zoomIn':
      m.scale *= 0.3 + 0.7 * easeOutCubic(p)
      m.opacity *= p
      break
    case 'zoomOut':
      m.scale *= p
      m.opacity *= Math.min(1, p * 2)
      break
    case 'spin':
      m.rotate += (entering ? -1 : 1) * q * 180
      m.scale *= easeOutCubic(p)
      break
    case 'bounceIn':
      m.scale *= easeOutBounce(p)
      break
    case 'flipIn':
      m.scaleX *= Math.sin((p * Math.PI) / 2)
      break
    case 'blurIn':
    case 'blurOut':
      m.blur += q * 0.02
      m.opacity *= p
      break
    case 'typewriter':
      m.reveal = p
      break
  }
}

/** Hoạt ảnh lặp theo thời gian từ lúc hiện (`local`, ms), chu kỳ `period` ms. */
function applyLoop(m: OverlayMotion, kind: AnimLoop, local: number, period: number) {
  const phase = (local / period) * Math.PI * 2
  switch (kind) {
    case 'bounce':
      m.dy += -Math.abs(Math.sin(phase)) * 0.03
      break
    case 'shake':
      m.rotate += Math.sin(phase * 7) * 6
      break
    case 'pulse':
      m.scale *= 1 + 0.08 * Math.sin(phase)
      break
    case 'swing':
      m.rotate += 12 * Math.sin(phase)
      break
    case 'float':
      m.dy += 0.02 * Math.sin(phase)
      break
    case 'flicker':
      m.opacity *= 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(phase * 4))
      break
  }
}

/** Biến đổi do hoạt ảnh vào / ra / lặp tại thời điểm `t` (ms trên video xuất). */
export function animMotion(
  o: { anim: OverlayAnim; start: number; end: number },
  t: number,
): OverlayMotion {
  const m = { ...STILL_MOTION }
  const local = t - o.start
  const remaining = o.end - t
  const a = o.anim
  if (a.in !== 'none') applyEdge(m, a.in, clamp(local / a.inMs, 0, 1), true)
  if (a.out !== 'none') applyEdge(m, a.out, clamp(remaining / a.outMs, 0, 1), false)
  if (a.loop !== 'none') applyLoop(m, a.loop, Math.max(0, local), a.loopMs)
  m.opacity = clamp(m.opacity, 0, 1)
  return m
}

// ─── Keyframe ──────────────────────────────────────────────────────────────────────────────────

export const EASES = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const
export type Ease = (typeof EASES)[number]

/** Tư thế của lớp tại một thời điểm (vị trí, cỡ, góc, độ mờ). */
export interface Pose {
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
}
export const POSE_KEYS = ['x', 'y', 'size', 'rotation', 'opacity'] as const

/** Keyframe: ảnh chụp tư thế ở thời điểm `t` (ms tính từ lúc lớp xuất hiện). */
export interface Keyframe extends Pose {
  id: string
  t: number
  /** Cách đi tới keyframe kế tiếp. */
  ease: Ease
}

/** Hai keyframe gần nhau hơn chừng này (ms) coi như cùng một chỗ. */
export const KEYFRAME_SNAP_MS = 40

let keyframeCounter = 0
export function newKeyframeId(): string {
  keyframeCounter += 1
  return `k${Date.now().toString(36)}${keyframeCounter.toString(36)}`
}

export function easeValue(ease: Ease, p: number): number {
  switch (ease) {
    case 'easeIn':
      return p * p
    case 'easeOut':
      return 1 - (1 - p) * (1 - p)
    case 'easeInOut':
      return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
    default:
      return p
  }
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p

/**
 * Tư thế tại `local` ms: nội suy giữa hai keyframe bao quanh (theo kiểu chuyển của keyframe trước);
 * trước keyframe đầu / sau keyframe cuối thì giữ nguyên. Không có keyframe thì dùng `base`.
 */
export function poseAt(
  base: Pose,
  keyframes: readonly Keyframe[] | undefined,
  local: number,
): Pose {
  if (!keyframes || keyframes.length === 0) return base
  const first = keyframes[0]!
  if (local <= first.t) return pick5(first)
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!
    const b = keyframes[i + 1]!
    if (local <= b.t) {
      const p = easeValue(a.ease, b.t > a.t ? (local - a.t) / (b.t - a.t) : 1)
      return {
        x: lerp(a.x, b.x, p),
        y: lerp(a.y, b.y, p),
        size: lerp(a.size, b.size, p),
        rotation: lerp(a.rotation, b.rotation, p),
        opacity: lerp(a.opacity, b.opacity, p),
      }
    }
  }
  return pick5(keyframes[keyframes.length - 1]!)
}

const pick5 = (k: Pose): Pose => ({
  x: k.x,
  y: k.y,
  size: k.size,
  rotation: k.rotation,
  opacity: k.opacity,
})

/** Keyframe ở (gần) thời điểm `local`, nếu có. */
export function keyframeAt(keyframes: readonly Keyframe[] | undefined, local: number) {
  return keyframes?.find((k) => Math.abs(k.t - local) <= KEYFRAME_SNAP_MS) ?? null
}

/**
 * Sửa tư thế tại `local`: chưa có keyframe thì sửa thẳng giá trị gốc; đã có thì sửa keyframe ở đó
 * (hoặc thêm keyframe mới mang tư thế hiện tại + phần sửa) — giống CapCut.
 */
export function editPose(
  base: Pose,
  keyframes: readonly Keyframe[] | undefined,
  local: number,
  patch: Partial<Pose>,
): { base: Pose; keyframes: Keyframe[] | undefined } {
  if (!keyframes || keyframes.length === 0)
    return { base: { ...base, ...patch }, keyframes: undefined }
  return { base, keyframes: setKeyframe(base, keyframes, local, patch) }
}

/** Thêm (hoặc cập nhật) keyframe tại `local` với tư thế hiện tại + phần sửa. */
export function setKeyframe(
  base: Pose,
  keyframes: readonly Keyframe[] | undefined,
  local: number,
  patch: Partial<Pose> = {},
): Keyframe[] {
  const list = [...(keyframes ?? [])]
  const hit = keyframeAt(list, local)
  if (hit) return list.map((k) => (k === hit ? { ...k, ...patch } : k))
  const pose = poseAt(base, list, local)
  list.push({
    id: newKeyframeId(),
    t: Math.max(0, Math.round(local)),
    ease: 'linear',
    ...pose,
    ...patch,
  })
  return list.sort((a, b) => a.t - b.t)
}

export function removeKeyframe(keyframes: readonly Keyframe[] | undefined, id: string): Keyframe[] {
  return (keyframes ?? []).filter((k) => k.id !== id)
}

/** Dời keyframe theo thời gian, giữ trong [0, `duration`]; giữ danh sách theo thứ tự. */
export function moveKeyframe(
  keyframes: readonly Keyframe[],
  id: string,
  t: number,
  duration: number,
): Keyframe[] {
  return keyframes
    .map((k) => (k.id === id ? { ...k, t: Math.round(clamp(t, 0, duration)) } : k))
    .sort((a, b) => a.t - b.t)
}

/**
 * Đổi đầu lớp (cắt / kéo dài phía trước `delta` ms): keyframe đứng yên trên video xuất. Keyframe bị
 * cắt mất ở đầu được thay bằng một keyframe mang đúng tư thế tại đầu mới, để chuyển động không đổi.
 */
export function shiftKeyframes(
  base: Pose,
  keyframes: readonly Keyframe[] | undefined,
  delta: number,
  duration: number,
): Keyframe[] | undefined {
  if (!keyframes?.length) return keyframes ? [...keyframes] : undefined
  const startPose = poseAt(base, keyframes, delta)
  const moved = keyframes.map((k) => ({ ...k, t: k.t - delta }))
  const dropped = moved.filter((k) => k.t < -KEYFRAME_SNAP_MS)
  const kept = moved
    .filter((k) => k.t >= -KEYFRAME_SNAP_MS && k.t <= duration + KEYFRAME_SNAP_MS)
    .map((k) => ({ ...k, t: Math.round(clamp(k.t, 0, duration)) }))
  if (dropped.length > 0 && !kept.some((k) => k.t <= KEYFRAME_SNAP_MS))
    kept.unshift({
      id: newKeyframeId(),
      t: 0,
      ease: dropped[dropped.length - 1]!.ease,
      ...startPose,
    })
  return kept
}

export function parseKeyframes(value: unknown): Keyframe[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.flatMap((v, i): Keyframe[] => {
    if (typeof v !== 'object' || v === null) return []
    const k = v as Record<string, unknown>
    const t = num(k.t, NaN, 0, 24 * 3600_000)
    if (!Number.isFinite(t)) return []
    return [
      {
        id: typeof k.id === 'string' ? k.id : `k${i}`,
        t,
        x: num(k.x, 0.5, -0.5, 1.5),
        y: num(k.y, 0.5, -0.5, 1.5),
        size: num(k.size, 0.12, 0.03, 4),
        rotation: num(k.rotation, 0, -360, 360),
        opacity: num(k.opacity, 1, 0, 1),
        ease: pick(EASES, k.ease, 'linear'),
      },
    ]
  })
  return list.length ? list.sort((a, b) => a.t - b.t) : undefined
}

// ─── Hòa trộn, mặt nạ ──────────────────────────────────────────────────────────────────────────

export const BLEND_MODES = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'darken',
  'difference',
  'add',
] as const
export type BlendMode = (typeof BLEND_MODES)[number]

export type CompositeOp = 'source-over' | 'lighter' | Exclude<BlendMode, 'normal' | 'add'>

/** Chế độ hòa trộn → `globalCompositeOperation` của canvas. */
export function compositeOf(blend: BlendMode | undefined): CompositeOp {
  switch (blend) {
    case undefined:
    case 'normal':
      return 'source-over'
    case 'add':
      return 'lighter'
    default:
      return blend
  }
}

export const MASK_SHAPES = ['none', 'circle', 'rect', 'heart', 'star', 'linear', 'mirror'] as const
export type MaskShape = (typeof MASK_SHAPES)[number]

/** Mặt nạ của ảnh / video, tính theo khung của lớp (tâm lệch x, y: -0.5..0.5 theo cạnh lớp). */
export interface OverlayMask {
  shape: MaskShape
  x: number
  y: number
  /** Cỡ so với lớp (0.1..2); với `linear` / `mirror` là độ dày dải giữ lại. */
  scale: number
  rotation: number
  /** Viền mềm 0..1. */
  feather: number
  invert: boolean
}

export const DEFAULT_MASK: OverlayMask = {
  shape: 'none',
  x: 0,
  y: 0,
  scale: 0.8,
  rotation: 0,
  feather: 0.1,
  invert: false,
}

export function parseMask(value: unknown): OverlayMask | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const shape = pick(MASK_SHAPES, v.shape, 'none')
  if (shape === 'none') return undefined
  return {
    shape,
    x: num(v.x, 0, -0.5, 0.5),
    y: num(v.y, 0, -0.5, 0.5),
    scale: num(v.scale, DEFAULT_MASK.scale, 0.1, 2),
    rotation: num(v.rotation, 0, -180, 180),
    feather: num(v.feather, DEFAULT_MASK.feather, 0, 1),
    invert: v.invert === true,
  }
}
