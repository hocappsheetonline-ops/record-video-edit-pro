import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseEvents } from '@lumora/core'
import { buildKeyNames, InputTracker, mapHookEvent, type HookLike } from './input-tracker'

const keyNames = buildKeyNames({ A: 30, C: 46, Ctrl: 29, CtrlRight: 3613, Enter: 28 })

describe('mapHookEvent', () => {
  it('đổi sự kiện chuột', () => {
    expect(mapHookEvent('mousedown', { x: 5, y: 6, button: 1 }, 10, keyNames)).toEqual({
      type: 'down',
      t: 10,
      x: 5,
      y: 6,
      button: 'left',
    })
    expect(mapHookEvent('mouseup', { x: 5, y: 6, button: 2 }, 11, keyNames)).toMatchObject({
      button: 'right',
    })
    expect(mapHookEvent('mousemove', { x: 1, y: 2 }, 12, keyNames)).toEqual({
      type: 'move',
      t: 12,
      x: 1,
      y: 2,
    })
  })

  it('đổi sự kiện cuộn dọc/ngang', () => {
    expect(
      mapHookEvent('wheel', { x: 0, y: 0, rotation: -2, direction: 3 }, 1, keyNames),
    ).toMatchObject({ dx: 0, dy: -2 })
    expect(
      mapHookEvent('wheel', { x: 0, y: 0, rotation: 1, direction: 4 }, 1, keyNames),
    ).toMatchObject({ dx: 1, dy: 0 })
  })

  it('không lưu ký tự gõ thường, chỉ lưu phím tắt', () => {
    expect(mapHookEvent('keydown', { keycode: 30 }, 1, keyNames)).toEqual({ type: 'key', t: 1 })
    expect(mapHookEvent('keydown', { keycode: 46, ctrlKey: true }, 1, keyNames)).toEqual({
      type: 'key',
      t: 1,
      combo: 'Ctrl+C',
    })
    expect(mapHookEvent('keydown', { keycode: 3613, ctrlKey: true }, 1, keyNames)).toBeNull()
  })
})

class FakeHook extends EventEmitter implements HookLike {
  started = false
  start() {
    this.started = true
  }
  stop() {
    this.started = false
  }
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-input-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('InputTracker', () => {
  it('ghi sự kiện từ hook ra file và dừng hook', async () => {
    const hook = new FakeHook()
    let t = 1000
    const tracker = new InputTracker({
      loadHook: async () => ({ hook, keyNames }),
      cursorPosition: () => ({ x: 0, y: 0 }),
      now: () => (t += 10),
    })
    const file = join(dir, 'events.jsonl')
    await tracker.start(file)
    expect(tracker.mode).toBe('hook')
    expect(hook.started).toBe(true)
    hook.emit('mousemove', { x: 10, y: 20 })
    hook.emit('mousedown', { x: 10, y: 20, button: 1 })
    hook.emit('keydown', { keycode: 30 })
    await tracker.stop()
    expect(hook.started).toBe(false)
    expect(hook.listenerCount('mousemove')).toBe(0)
    expect(parseEvents(await readFile(file, 'utf8'))).toEqual([
      { type: 'move', t: 1010, x: 10, y: 20 },
      { type: 'down', t: 1020, x: 10, y: 20, button: 'left' },
      { type: 'key', t: 1030 },
    ])
  })

  it('chuyển sang đọc vị trí chuột định kỳ khi không có hook', async () => {
    let x = 0
    const tracker = new InputTracker({
      loadHook: async () => null,
      cursorPosition: () => ({ x: (x += 5), y: 7 }),
      now: () => Date.now(),
      pollIntervalMs: 5,
    })
    const file = join(dir, 'events.jsonl')
    await tracker.start(file)
    expect(tracker.mode).toBe('poll')
    await new Promise((r) => setTimeout(r, 60))
    await tracker.stop()
    const events = parseEvents(await readFile(file, 'utf8'))
    expect(events.length).toBeGreaterThan(2)
    expect(events.every((e) => e.type === 'move' && e.y === 7)).toBe(true)
  })

  it('chuyển sang đọc định kỳ khi hook lỗi lúc khởi động', async () => {
    const hook = new FakeHook()
    hook.start = () => {
      throw new Error('access denied')
    }
    const tracker = new InputTracker({
      loadHook: async () => ({ hook, keyNames }),
      cursorPosition: () => ({ x: 1, y: 1 }),
      now: () => Date.now(),
    })
    await tracker.start(join(dir, 'events.jsonl'))
    expect(tracker.mode).toBe('poll')
    await tracker.stop()
  })
})
