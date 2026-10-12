import { describe, expect, it } from 'vitest'
import type { Segment } from '../project'
import type { AudioClip } from './audio-clips'
import { createDefaultEdit, parseEditState } from './edit-state'
import { applyTrackState, DEFAULT_TRACKS, parseTracks } from './tracks'
import type { EffectRegion } from './effects'
import { addMarker, chaptersText, markerNear, parseMarkers } from './markers'
import {
  isClipboardEmpty,
  pasteClipboard,
  rippleDelete,
  rippleDeleteAudio,
  snapBlock,
  snapTime,
} from './timeline-ops'

const fx = (id: string, start: number, end: number): EffectRegion => ({
  id,
  kind: 'shake',
  start,
  end,
  intensity: 0.5,
})
const audio = (id: string, start: number, duration: number): AudioClip => ({
  id,
  file: 'a.mp3',
  name: id,
  kind: 'sfx',
  start,
  offset: 0,
  duration,
  sourceDuration: duration,
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  loop: false,
})

describe('hít dính', () => {
  it('hít về ứng viên gần nhất trong ngưỡng', () => {
    expect(snapTime(1030, [0, 1000, 1050], 40)).toEqual({ t: 1050, snapped: 1050 })
    expect(snapTime(1100, [0, 1000], 40)).toEqual({ t: 1100, snapped: null })
  })
  it('khối: mép cuối hít được thì dời cả khối', () => {
    expect(snapBlock(480, 500, [1000], 30)).toEqual({ start: 500, snapped: 1000 })
    expect(snapBlock(1010, 500, [1000, 1520], 30)).toEqual({ start: 1000, snapped: 1000 })
    expect(snapBlock(200, 100, [1000], 30)).toEqual({ start: 200, snapped: null })
  })
})

describe('xóa dồn', () => {
  it('mục phía sau dịch trái đúng phần đã xóa; mục phía trước giữ nguyên', () => {
    const items = [fx('a', 0, 1000), fx('b', 1000, 2000), fx('c', 2500, 3000), fx('d', 4000, 4500)]
    const out = rippleDelete(items, new Set(['b', 'c']))
    expect(out.map((i) => [i.id, i.start, i.end])).toEqual([
      ['a', 0, 1000],
      ['d', 2500, 3000],
    ])
  })
  it('chỗ xóa chồng nhau chỉ tính một lần; âm thanh theo start + duration', () => {
    const out = rippleDeleteAudio(
      [audio('a', 0, 1000), audio('b', 500, 1000), audio('c', 3000, 500)],
      new Set(['a', 'b']),
    )
    expect(out.map((c) => [c.id, c.start])).toEqual([['c', 1500]])
  })
})

describe('sao chép / dán', () => {
  it('dán giữ khoảng cách tương đối, id mới, cắt ở cuối video', () => {
    let n = 0
    const pasted = pasteClipboard(
      {
        overlays: [],
        effects: [fx('a', 1000, 2000), fx('b', 1500, 2500)],
        audioClips: [audio('x', 1200, 3000)],
      },
      5000,
      7000,
      (k) => `${k}${n++}`,
    )
    expect(pasted.effects.map((e) => [e.id, e.start, e.end])).toEqual([
      ['effect0', 5000, 6000],
      ['effect1', 5500, 6500],
    ])
    expect(pasted.audioClips.map((a) => [a.id, a.start, a.duration])).toEqual([
      ['audio2', 5200, 1800],
    ])
    // Nằm hẳn ngoài video: bỏ.
    expect(
      pasteClipboard(
        { overlays: [], effects: [fx('a', 0, 100), fx('b', 3000, 3500)], audioClips: [] },
        4000,
        5000,
        () => 'z',
      ).effects,
    ).toHaveLength(1)
    expect(isClipboardEmpty(null)).toBe(true)
    expect(isClipboardEmpty({ overlays: [], effects: [], audioClips: [] })).toBe(true)
  })
})

describe('marker và chương', () => {
  it('đọc file: bỏ marker sai, kẹp thời gian, sắp xếp', () => {
    expect(
      parseMarkers(
        [
          { t: 5000, label: 'B', color: '#ef4444' },
          { t: -5, label: 'A', color: 'pink' },
          { label: 'x' },
        ],
        4000,
      ),
    ).toMatchObject([
      { t: 0, label: 'A', color: '#f59e0b' },
      { t: 4000, label: 'B', color: '#ef4444' },
    ])
    expect(parseMarkers('x', 100)).toEqual([])
  })
  it('thêm không trùng chỗ; nhảy marker trước / sau', () => {
    let m = addMarker([], 3000, 'Demo')
    m = addMarker(m, 1000)
    m = addMarker(m, 1020)
    expect(m.map((x) => x.t)).toEqual([1000, 3000])
    expect(markerNear(m, 1000, 1)?.t).toBe(3000)
    expect(markerNear(m, 3000, -1)?.t).toBe(1000)
    expect(markerNear(m, 3000, 1)).toBeNull()
  })
  it('chương YouTube: thêm 0:00 nếu cần, tên mặc định cho marker không tên', () => {
    const names = { intro: 'Mở đầu', part: (n: number) => `Phần ${n}` }
    const m = parseMarkers(
      [
        { t: 65_000, label: 'Demo' },
        { t: 3_725_000, label: '' },
      ],
      4_000_000,
    )
    expect(chaptersText(m, names)).toBe('0:00 Mở đầu\n1:05 Demo\n1:02:05 Phần 2')
    expect(chaptersText(parseMarkers([{ t: 200, label: 'Chào' }], 1000), names)).toBe('0:00 Chào')
  })
})

describe('ẩn / tắt tiếng / khóa hàng', () => {
  it('đọc file: chỉ nhận nút hàng đó có', () => {
    const t = parseTracks({
      effects: { hidden: true, muted: true },
      clips: { hidden: true, muted: true, locked: true },
    })
    expect(t.effects).toEqual({ hidden: true, muted: false, locked: false })
    expect(t.clips).toEqual({ hidden: false, muted: true, locked: true })
    expect(parseTracks(null)).toEqual(DEFAULT_TRACKS)
  })

  it('áp dụng: ẩn bỏ hiệu ứng / lớp phủ / phụ đề, tắt tiếng bỏ âm thanh; không đổi gì thì giữ nguyên', () => {
    const project = {
      segments: [{ index: 0, startedAt: 0, endedAt: 5000, tracks: {} }] as Segment[],
      cursorHidden: false,
      fps: 30,
    }
    const edit = createDefaultEdit(project)
    edit.effects = [fx('a', 0, 100)]
    edit.audioClips = [audio('x', 0, 100)]
    edit.captions = { ...edit.captions, enabled: true }
    expect(applyTrackState(edit)).toBe(edit)
    const off = applyTrackState({
      ...edit,
      tracks: {
        ...DEFAULT_TRACKS,
        effects: { hidden: true, muted: false, locked: false },
        captions: { hidden: true, muted: false, locked: false },
        clips: { hidden: false, muted: true, locked: false },
        audio: { hidden: false, muted: true, locked: false },
      },
    })
    expect(off.effects).toEqual([])
    expect(off.audioClips).toEqual([])
    expect(off.captions.enabled).toBe(false)
    expect([off.audio.mic, off.audio.system]).toEqual([0, 0])
    // Lưu rồi đọc lại giữ nguyên marker và trạng thái hàng.
    const saved = {
      ...edit,
      markers: addMarker([], 1000, 'A'),
      tracks: off.tracks ?? DEFAULT_TRACKS,
    }
    const back = parseEditState(
      JSON.parse(
        JSON.stringify({
          ...saved,
          tracks: { ...DEFAULT_TRACKS, audio: { hidden: false, muted: true, locked: true } },
        }),
      ),
      project,
    )
    expect(back.markers).toMatchObject([{ t: 1000, label: 'A' }])
    expect(back.tracks.audio).toEqual({ hidden: false, muted: true, locked: true })
  })
})
