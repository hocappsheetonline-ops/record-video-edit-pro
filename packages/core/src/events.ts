/**
 * Sự kiện chuột/bàn phím ghi lại trong lúc quay, dùng cho auto-zoom và hiệu ứng con trỏ.
 * `t` là thời điểm (ms, Unix epoch). `x`, `y` là pixel vật lý trên toàn màn hình ảo.
 */
export type InputEvent =
  | { type: 'move'; t: number; x: number; y: number }
  | { type: 'down' | 'up'; t: number; x: number; y: number; button: MouseButton }
  | { type: 'wheel'; t: number; x: number; y: number; dx: number; dy: number }
  | { type: 'key'; t: number; combo?: string }

export type MouseButton = 'left' | 'right' | 'middle' | 'other'

export interface RawKeyEvent {
  t: number
  /** Tên phím đã chuẩn hóa, ví dụ "A", "Enter", "F5". */
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

const MODIFIER_KEYS = new Set(['Ctrl', 'Alt', 'Shift', 'Meta'])

/**
 * Chỉ giữ lại phím tắt (có Ctrl/Alt/Win). Phím gõ thường chỉ ghi nhận "có gõ phím"
 * mà không lưu ký tự, để không vô tình lưu mật khẩu hay nội dung riêng tư.
 */
export function sanitizeKeyEvent(raw: RawKeyEvent): InputEvent | null {
  if (MODIFIER_KEYS.has(raw.key)) return null
  if (!raw.ctrl && !raw.alt && !raw.meta) return { type: 'key', t: raw.t }
  const parts: string[] = []
  if (raw.ctrl) parts.push('Ctrl')
  if (raw.alt) parts.push('Alt')
  if (raw.shift) parts.push('Shift')
  if (raw.meta) parts.push('Win')
  parts.push(raw.key)
  return { type: 'key', t: raw.t, combo: parts.join('+') }
}

/**
 * Bỏ bớt sự kiện di chuột quá dày (hook có thể bắn hàng trăm sự kiện mỗi giây),
 * nhưng luôn giữ sự kiện click, cuộn và phím.
 */
export function createMoveThrottle(minIntervalMs: number) {
  let lastMoveAt = -Infinity
  return (event: InputEvent): boolean => {
    if (event.type !== 'move') return true
    if (event.t - lastMoveAt < minIntervalMs) return false
    lastMoveAt = event.t
    return true
  }
}

export function serializeEvent(event: InputEvent): string {
  return `${JSON.stringify(event)}\n`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseEvent(value: unknown): InputEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const e = value as Record<string, unknown>
  if (!isFiniteNumber(e.t)) return null
  switch (e.type) {
    case 'move':
      return isFiniteNumber(e.x) && isFiniteNumber(e.y)
        ? { type: 'move', t: e.t, x: e.x, y: e.y }
        : null
    case 'down':
    case 'up':
      if (!isFiniteNumber(e.x) || !isFiniteNumber(e.y)) return null
      return {
        type: e.type,
        t: e.t,
        x: e.x,
        y: e.y,
        button: ['left', 'right', 'middle'].includes(e.button as string)
          ? (e.button as MouseButton)
          : 'other',
      }
    case 'wheel':
      if (!isFiniteNumber(e.x) || !isFiniteNumber(e.y)) return null
      return {
        type: 'wheel',
        t: e.t,
        x: e.x,
        y: e.y,
        dx: isFiniteNumber(e.dx) ? e.dx : 0,
        dy: isFiniteNumber(e.dy) ? e.dy : 0,
      }
    case 'key':
      return typeof e.combo === 'string'
        ? { type: 'key', t: e.t, combo: e.combo }
        : { type: 'key', t: e.t }
    default:
      return null
  }
}

/** Đọc file events.jsonl, bỏ qua dòng hỏng (ví dụ dòng cuối bị cắt khi app tắt đột ngột). */
export function parseEvents(jsonl: string): InputEvent[] {
  const events: InputEvent[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = parseEvent(JSON.parse(line))
      if (event) events.push(event)
    } catch {
      // bỏ qua dòng hỏng
    }
  }
  return events
}
