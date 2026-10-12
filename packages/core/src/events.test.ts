import { describe, expect, it } from 'vitest'
import {
  createMoveThrottle,
  parseEvents,
  sanitizeKeyEvent,
  serializeEvent,
  type InputEvent,
} from './events'

const key = (
  k: string,
  mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {},
) => ({
  t: 1,
  key: k,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  ...mods,
})

describe('sanitizeKeyEvent', () => {
  it('không lưu ký tự khi gõ phím thường', () => {
    expect(sanitizeKeyEvent(key('P'))).toEqual({ type: 'key', t: 1 })
    expect(sanitizeKeyEvent(key('A', { shift: true }))).toEqual({ type: 'key', t: 1 })
  })

  it('lưu phím tắt có Ctrl/Alt/Win', () => {
    expect(sanitizeKeyEvent(key('C', { ctrl: true }))?.type).toBe('key')
    expect(sanitizeKeyEvent(key('C', { ctrl: true }))).toEqual({
      type: 'key',
      t: 1,
      combo: 'Ctrl+C',
    })
    expect(sanitizeKeyEvent(key('S', { ctrl: true, shift: true }))).toMatchObject({
      combo: 'Ctrl+Shift+S',
    })
    expect(sanitizeKeyEvent(key('Tab', { alt: true }))).toMatchObject({ combo: 'Alt+Tab' })
    expect(sanitizeKeyEvent(key('E', { meta: true }))).toMatchObject({ combo: 'Win+E' })
  })

  it('bỏ qua khi chỉ nhấn phím bổ trợ', () => {
    expect(sanitizeKeyEvent(key('Ctrl', { ctrl: true }))).toBeNull()
    expect(sanitizeKeyEvent(key('Shift', { shift: true }))).toBeNull()
  })
})

describe('createMoveThrottle', () => {
  it('bỏ sự kiện di chuột quá dày nhưng giữ click', () => {
    const keep = createMoveThrottle(10)
    const events: InputEvent[] = [
      { type: 'move', t: 0, x: 0, y: 0 },
      { type: 'move', t: 5, x: 1, y: 1 },
      { type: 'down', t: 6, x: 1, y: 1, button: 'left' },
      { type: 'move', t: 10, x: 2, y: 2 },
      { type: 'move', t: 15, x: 3, y: 3 },
    ]
    expect(events.filter(keep).map((e) => e.t)).toEqual([0, 6, 10])
  })
})

describe('parseEvents', () => {
  it('đọc lại được những gì đã ghi', () => {
    const events: InputEvent[] = [
      { type: 'move', t: 1, x: 10, y: 20 },
      { type: 'down', t: 2, x: 10, y: 20, button: 'left' },
      { type: 'up', t: 3, x: 10, y: 20, button: 'left' },
      { type: 'wheel', t: 4, x: 10, y: 20, dx: 0, dy: -3 },
      { type: 'key', t: 5 },
      { type: 'key', t: 6, combo: 'Ctrl+V' },
    ]
    expect(parseEvents(events.map(serializeEvent).join(''))).toEqual(events)
  })

  it('bỏ qua dòng hỏng và sự kiện lạ', () => {
    const text = [
      '{"type":"move","t":1,"x":1,"y":2}',
      '{"type":"teleport","t":2}',
      '{"type":"move","t":"x","x":1,"y":2}',
      '{"type":"down","t":3,"x":1,"y":2,"button":"weird"}',
      '{"type":"mo', // dòng cuối bị cắt
    ].join('\n')
    expect(parseEvents(text)).toEqual([
      { type: 'move', t: 1, x: 1, y: 2 },
      { type: 'down', t: 3, x: 1, y: 2, button: 'other' },
    ])
  })
})
