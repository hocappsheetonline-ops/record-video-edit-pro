import { createWriteStream, type WriteStream } from 'node:fs'
import {
  createMoveThrottle,
  sanitizeKeyEvent,
  serializeEvent,
  type InputEvent,
  type MouseButton,
  type Point,
} from '@lumora/core'

/** Phần của uiohook-napi mà tracker dùng, tách ra để test được. */
export interface HookLike {
  on(event: string, listener: (e: HookEvent) => void): unknown
  removeAllListeners(): unknown
  start(): void
  stop(): void
}

export interface HookEvent {
  x?: number
  y?: number
  button?: unknown
  keycode?: number
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
  direction?: number
  rotation?: number
}

const BUTTONS: Record<number, MouseButton> = { 1: 'left', 2: 'right', 3: 'middle' }
const WHEEL_HORIZONTAL = 4

/** Chuẩn hóa tên phím từ bảng mã của uiohook (gộp Ctrl trái/phải...). */
export function buildKeyNames(table: Record<string, number>): Map<number, string> {
  const names = new Map<number, string>()
  for (const [name, code] of Object.entries(table)) {
    if (names.has(code)) continue
    names.set(code, name.replace(/Right$/, '').replace(/^Control$/, 'Ctrl'))
  }
  return names
}

/** Đổi sự kiện thô của hook thành sự kiện lưu vào events.jsonl. */
export function mapHookEvent(
  kind: 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'keydown',
  e: HookEvent,
  t: number,
  keyNames: Map<number, string>,
): InputEvent | null {
  const x = e.x ?? 0
  const y = e.y ?? 0
  switch (kind) {
    case 'mousemove':
      return { type: 'move', t, x, y }
    case 'mousedown':
    case 'mouseup':
      return {
        type: kind === 'mousedown' ? 'down' : 'up',
        t,
        x,
        y,
        button: BUTTONS[e.button as number] ?? 'other',
      }
    case 'wheel': {
      const amount = e.rotation ?? 0
      const horizontal = e.direction === WHEEL_HORIZONTAL
      return { type: 'wheel', t, x, y, dx: horizontal ? amount : 0, dy: horizontal ? 0 : amount }
    }
    case 'keydown':
      return sanitizeKeyEvent({
        t,
        key: keyNames.get(e.keycode ?? -1) ?? `Key${e.keycode ?? '?'}`,
        ctrl: e.ctrlKey === true,
        alt: e.altKey === true,
        shift: e.shiftKey === true,
        meta: e.metaKey === true,
      })
  }
}

export interface InputTrackerDeps {
  /** Tải hook toàn hệ thống. Trả về null nếu không dùng được (thiếu thư viện, bị chặn...). */
  loadHook(): Promise<{ hook: HookLike; keyNames: Map<number, string> } | null>
  /** Vị trí chuột hiện tại (pixel vật lý), dùng khi không có hook. */
  cursorPosition(): Point
  now(): number
  pollIntervalMs?: number
}

/**
 * Ghi lại chuột và bàn phím trong lúc quay ra file events.jsonl.
 * Nếu không cài được hook toàn hệ thống thì chỉ ghi vị trí chuột bằng cách đọc định kỳ.
 */
export class InputTracker {
  private stream: WriteStream | null = null
  private hook: HookLike | null = null
  private timer: NodeJS.Timeout | null = null
  private keep = createMoveThrottle(8)
  mode: 'hook' | 'poll' | 'off' = 'off'

  constructor(private readonly deps: InputTrackerDeps) {}

  private write(event: InputEvent | null) {
    if (event && this.stream && this.keep(event)) this.stream.write(serializeEvent(event))
  }

  async start(filePath: string): Promise<void> {
    this.stream = createWriteStream(filePath, { flags: 'a' })
    const loaded = await this.deps.loadHook().catch(() => null)
    if (loaded) {
      try {
        const { hook, keyNames } = loaded
        for (const kind of ['mousemove', 'mousedown', 'mouseup', 'wheel', 'keydown'] as const) {
          hook.on(kind, (e) => this.write(mapHookEvent(kind, e, this.deps.now(), keyNames)))
        }
        hook.start()
        this.hook = hook
        this.mode = 'hook'
        return
      } catch {
        loaded.hook.removeAllListeners()
      }
    }
    let last: Point | null = null
    this.timer = setInterval(() => {
      const p = this.deps.cursorPosition()
      if (last && last.x === p.x && last.y === p.y) return
      last = p
      this.write({ type: 'move', t: this.deps.now(), x: p.x, y: p.y })
    }, this.deps.pollIntervalMs ?? 16)
    this.mode = 'poll'
  }

  async stop(): Promise<void> {
    if (this.hook) {
      try {
        this.hook.stop()
      } catch {
        // hook đã dừng
      }
      this.hook.removeAllListeners()
      this.hook = null
    }
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const stream = this.stream
    this.stream = null
    if (stream) await new Promise<void>((resolve) => stream.end(resolve))
  }
}

/** Tải uiohook-napi (native module). Lỗi tải sẽ khiến tracker chuyển sang chế độ đọc định kỳ. */
export async function loadUiohook(): Promise<{
  hook: HookLike
  keyNames: Map<number, string>
} | null> {
  try {
    const mod = await import('uiohook-napi')
    return {
      hook: mod.uIOhook as unknown as HookLike,
      keyNames: buildKeyNames(mod.UiohookKey as unknown as Record<string, number>),
    }
  } catch {
    return null
  }
}
