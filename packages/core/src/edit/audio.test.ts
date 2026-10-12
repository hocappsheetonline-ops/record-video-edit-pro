import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import { planAudio } from './audio'

const segments: Segment[] = [
  {
    index: 0,
    startedAt: 10_000,
    endedAt: 20_000,
    tracks: {
      screen: { file: 'seg0-screen.mkv', startedAt: 10_000 },
      mic: { file: 'seg0-mic.webm', startedAt: 9_800 },
      system: { file: 'seg0-system.webm', startedAt: 10_500 },
    },
  },
  {
    index: 1,
    startedAt: 40_000,
    endedAt: 44_000,
    tracks: { mic: { file: 'seg1-mic.webm', startedAt: 40_000 } },
  },
]

describe('planAudio', () => {
  it('ghép micro và âm thanh máy theo clip, bù độ lệch lúc bắt đầu ghi', () => {
    const pieces = planAudio(
      { segments },
      [{ id: 'a', sourceStart: 1000, sourceEnd: 3000, speed: 1 }],
      { mic: 1, system: 0.5 },
    )
    expect(pieces).toEqual([
      {
        file: 'seg0-mic.webm',
        kind: 'mic',
        mediaStart: 1.2,
        duration: 2,
        outputStart: 0,
        speed: 1,
        volume: 1,
      },
      {
        file: 'seg0-system.webm',
        kind: 'system',
        mediaStart: 0.5,
        duration: 2,
        outputStart: 0,
        speed: 1,
        volume: 0.5,
      },
    ])
  })

  it('track bắt đầu muộn: bỏ phần đầu chưa có âm thanh', () => {
    const pieces = planAudio(
      { segments },
      [{ id: 'a', sourceStart: 0, sourceEnd: 2000, speed: 1 }],
      { mic: 0, system: 1 },
    )
    expect(pieces).toEqual([
      {
        file: 'seg0-system.webm',
        kind: 'system',
        mediaStart: 0,
        duration: 1.5,
        outputStart: 0.5,
        speed: 1,
        volume: 1,
      },
    ])
  })

  it('clip trải qua hai đoạn quay và clip tua nhanh', () => {
    const pieces = planAudio(
      { segments },
      [
        { id: 'a', sourceStart: 0, sourceEnd: 1000, speed: 1 },
        { id: 'b', sourceStart: 9000, sourceEnd: 12_000, speed: 2 },
      ],
      { mic: 1, system: 0 },
    )
    expect(pieces).toEqual([
      {
        file: 'seg0-mic.webm',
        kind: 'mic',
        mediaStart: 0.2,
        duration: 1,
        outputStart: 0,
        speed: 1,
        volume: 1,
      },
      {
        file: 'seg0-mic.webm',
        kind: 'mic',
        mediaStart: 9.2,
        duration: 1,
        outputStart: 1,
        speed: 2,
        volume: 1,
      },
      {
        file: 'seg1-mic.webm',
        kind: 'mic',
        mediaStart: 0,
        duration: 2,
        outputStart: 1.5,
        speed: 2,
        volume: 1,
      },
    ])
  })
})
