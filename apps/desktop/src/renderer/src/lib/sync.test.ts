import { describe, expect, it } from 'vitest'
import { needsResync, syncedTime } from './sync'

describe('syncedTime', () => {
  it('track bắt đầu sớm hơn thì phát ở thời điểm muộn hơn', () => {
    // Micro bắt đầu sớm hơn màn hình 300ms.
    expect(syncedTime(2, 10_300, 10_000)).toBeCloseTo(2.3)
  })

  it('track bắt đầu muộn hơn có thể chưa tới lúc phát', () => {
    expect(syncedTime(0.1, 10_000, 10_500)).toBeCloseTo(-0.4)
  })
})

describe('needsResync', () => {
  it('bỏ qua lệch nhỏ', () => {
    expect(needsResync(1.0, 1.1)).toBe(false)
    expect(needsResync(1.0, 1.3)).toBe(true)
  })
})
