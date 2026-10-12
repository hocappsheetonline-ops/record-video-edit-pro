import { describe, expect, it } from 'vitest'
import { createDefaultEdit, type CursorTrack, type Segment } from '@lumora/core'
import { computeScene } from './scene'

const project = {
  segments: [{ index: 0, startedAt: 0, endedAt: 10_000, tracks: {} }] as Segment[],
  cursorHidden: true,
  fps: 60,
}
const output = { width: 1920, height: 1080 }
const video = { width: 1920, height: 1080 }

function track(x: number, y: number, clicks: number[] = []): CursorTrack {
  return {
    stepMs: 100,
    samples: Array.from({ length: 101 }, (_, i) => ({ s: i * 100, x, y })),
    clicks: clicks.map((s) => ({ s, x, y, button: 'left' as const })),
    keys: [],
    moves: [0, 5000, 10_000],
  }
}

describe('computeScene', () => {
  it('không zoom: video nằm giữa khung có lề, thấy toàn bộ video', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0.1
    const scene = computeScene({
      time: 0,
      edit,
      output,
      video,
      source: 1000,
      cursor: null,
      follow: null,
      hasCamera: false,
    })
    expect(scene.content).toEqual({ x: 192, y: 108, width: 1536, height: 864 })
    expect(scene.view).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(scene.camera).toBeNull()
  })

  it('con trỏ được đặt đúng vị trí trong khung', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0
    const scene = computeScene({
      time: 0,
      edit,
      output,
      video,
      source: 1000,
      cursor: track(0.25, 0.5),
      follow: null,
      hasCamera: false,
    })
    expect(scene.cursor).toMatchObject({ x: 480, y: 540, opacity: 1 })
  })

  it('khi zoom gấp đôi vào giữa, con trỏ ở 1/4 bị đẩy ra mép trái và to gấp đôi', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0
    edit.zooms = [{ id: 'z', start: 0, end: 10_000, scale: 2, mode: 'fixed', x: 0.5, y: 0.5 }]
    const base = computeScene({
      time: 0,
      edit: { ...edit, zooms: [] },
      output,
      video,
      source: 5000,
      cursor: track(0.25, 0.5),
      follow: null,
      hasCamera: false,
    })
    const zoomed = computeScene({
      time: 0,
      edit,
      output,
      video,
      source: 5000,
      cursor: track(0.25, 0.5),
      follow: null,
      hasCamera: false,
    })
    expect(zoomed.view).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(zoomed.cursor!.x).toBeCloseTo(0)
    expect(zoomed.cursor!.size).toBeCloseTo(base.cursor!.size * 2)
  })

  it('hiệu ứng click ngay sau khi click', () => {
    const edit = createDefaultEdit(project)
    const scene = computeScene({
      time: 0,
      edit,
      output,
      video,
      source: 2100,
      cursor: track(0.5, 0.5, [2000]),
      follow: null,
      hasCamera: false,
    })
    expect(scene.ripple?.opacity).toBeGreaterThan(0.5)
  })

  it('ẩn con trỏ khi tắt, hiện webcam khi có', () => {
    const edit = createDefaultEdit(project)
    edit.cursor.visible = false
    const scene = computeScene({
      time: 0,
      edit,
      output,
      video,
      source: 1000,
      cursor: track(0.5, 0.5),
      follow: null,
      hasCamera: true,
    })
    expect(scene.cursor).toBeNull()
    expect(scene.camera?.shape).toBe('circle')
  })

  it('phụ đề: tô sáng từ đang nói; dòng đã sửa thì hiện nguyên dòng', () => {
    const edit = createDefaultEdit(project)
    edit.captions = {
      ...edit.captions,
      enabled: true,
      lines: [
        {
          id: 'l0',
          start: 0,
          end: 1000,
          text: 'Xin chào',
          edited: false,
          words: [
            { text: 'Xin', start: 0, end: 400 },
            { text: 'chào', start: 500, end: 1000 },
          ],
        },
        {
          id: 'l1',
          start: 2000,
          end: 3000,
          text: 'Đã sửa lại',
          edited: true,
          words: [{ text: 'x', start: 2000, end: 3000 }],
        },
      ],
    }
    const at = (source: number) =>
      computeScene({
        edit,
        time: 0,
        output,
        video,
        source,
        cursor: null,
        follow: null,
        hasCamera: false,
      }).captions
    expect(at(600)?.words).toEqual([
      { text: 'Xin', active: false, spoken: true, since: 600 },
      { text: 'chào', active: true, spoken: true, since: 100 },
    ])
    expect(at(600)?.fontSize).toBe(54)
    // Dòng đã sửa: thời gian chia đều cho các từ, vẫn tô sáng từ đang nói.
    expect(at(2500)?.words.map((w) => [w.text, w.active])).toEqual([
      ['Đã', false],
      ['sửa', true],
      ['lại', false],
    ])
    expect(at(1500)).toBeNull()
    edit.captions.enabled = false
    expect(at(600)).toBeNull()
  })

  it('phụ đề bỏ các từ đã bị cắt khỏi video', () => {
    const edit = createDefaultEdit(project)
    edit.clips = [
      { id: 'a', sourceStart: 0, sourceEnd: 400, speed: 1 },
      { id: 'b', sourceStart: 700, sourceEnd: 10_000, speed: 1 },
    ]
    edit.captions = {
      ...edit.captions,
      enabled: true,
      lines: [
        {
          id: 'l0',
          start: 0,
          end: 1200,
          text: 'Xin ừm chào',
          edited: false,
          words: [
            { text: 'Xin', start: 0, end: 300 },
            { text: 'ừm', start: 450, end: 650 },
            { text: 'chào', start: 800, end: 1200 },
          ],
        },
      ],
    }
    const scene = computeScene({
      time: 0,
      edit,
      output,
      video,
      source: 900,
      cursor: null,
      follow: null,
      hasCamera: false,
    })
    expect(scene.captions?.words.map((w) => w.text)).toEqual(['Xin', 'chào'])
  })

  it('phụ đề theo mẫu: chỉ hiện nhóm vài từ quanh từ đang nói, chữ in hoa, dòng dịch song ngữ', () => {
    const edit = createDefaultEdit(project)
    edit.captions = {
      ...edit.captions,
      enabled: true,
      bilingual: true,
      look: { ...edit.captions.look, template: 'tiktok', maxWords: 2, uppercase: true },
      lines: [
        {
          id: 'l0',
          start: 0,
          end: 2000,
          text: 'một hai ba bốn năm',
          edited: false,
          translation: 'one two three four five',
          words: ['một', 'hai', 'ba', 'bốn', 'năm'].map((text, i) => ({
            text,
            start: i * 400,
            end: i * 400 + 350,
          })),
        },
      ],
    }
    const at = (source: number) =>
      computeScene({
        edit,
        time: 0,
        output,
        video,
        source,
        cursor: null,
        follow: null,
        hasCamera: false,
      }).captions!
    expect(at(900).words.map((w) => [w.text, w.active])).toEqual([
      ['BA', true],
      ['BỐN', false],
    ])
    expect(at(1700).words.map((w) => w.text)).toEqual(['NĂM'])
    expect(at(900).translation).toBe('one two three four five')
    expect(at(900).look.template).toBe('tiktok')
    edit.captions.bilingual = false
    expect(at(900).translation).toBeNull()
    // Kiểu "cả dòng": không tô từ nào, mọi từ coi như đã nói.
    edit.captions.style = 'classic'
    expect(at(900).words.every((w) => !w.active && w.spoken)).toBe(true)
  })
})

describe('computeScene — video dọc tự cắt theo con trỏ', () => {
  const vertical = { width: 1080, height: 1920 }

  function verticalEdit() {
    const edit = createDefaultEdit(project)
    edit.frame = { ...edit.frame, aspect: '9:16', fill: true, padding: 0.1 }
    return edit
  }

  it('lấp đầy: video phủ kín khung dọc, cắt một dải 9:16 quanh con trỏ, không bo góc', () => {
    const scene = computeScene({
      time: 0,
      edit: verticalEdit(),
      output: vertical,
      video,
      source: 2000,
      cursor: track(0.8, 0.3),
      follow: track(0.8, 0.3),
      hasCamera: false,
    })
    expect(scene.content).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
    expect(scene.radius).toBe(0)
    expect(scene.shadow).toBe(0)
    expect((scene.view.width * video.width) / (scene.view.height * video.height)).toBeCloseTo(
      9 / 16,
    )
    expect(scene.view.x + scene.view.width / 2).toBeCloseTo(0.8)
    // Con trỏ nằm trong khung hình và ở đúng giữa theo chiều ngang (vì khung đi theo nó).
    expect(scene.cursor!.x).toBeCloseTo(540)
    expect(scene.cursor!.y).toBeCloseTo(0.3 * 1920)
  })

  it('con trỏ sát mép phải: khung dừng ở mép video, con trỏ lệch về bên phải', () => {
    const scene = computeScene({
      time: 0,
      edit: verticalEdit(),
      output: vertical,
      video,
      source: 2000,
      cursor: track(0.98, 0.5),
      follow: track(0.98, 0.5),
      hasCamera: false,
    })
    expect(scene.view.x + scene.view.width).toBeCloseTo(1)
    expect(scene.cursor!.x).toBeGreaterThan(900)
    expect(scene.cursor!.x).toBeLessThan(1080)
  })

  it('webcam bong bóng nằm trong khung dọc', () => {
    const edit = verticalEdit()
    edit.camera = { ...edit.camera, size: 0.32, position: 'top-left', x: 0, y: 0 }
    const scene = computeScene({
      time: 0,
      edit,
      output: vertical,
      video,
      source: 2000,
      cursor: null,
      follow: null,
      hasCamera: true,
    })
    expect(scene.camera!.shape).toBe('circle')
    expect(scene.camera!.rect.x).toBeLessThan(100)
    expect(scene.camera!.rect.width).toBeCloseTo(0.32 * 1080)
    expect(scene.content.height).toBe(1920)
  })

  it('webcam đặt tự do (kéo trên khung xem trước), có viền và khung cắt mặt', () => {
    const edit = verticalEdit()
    edit.camera = {
      ...edit.camera,
      size: 0.4,
      x: 0.5,
      y: 0.62,
      border: 1,
      borderColor: '#ff0000',
      zoom: 1.6,
      focusX: 0.4,
    }
    const scene = computeScene({
      time: 0,
      edit,
      output: vertical,
      video,
      source: 2000,
      cursor: null,
      follow: null,
      hasCamera: true,
    })
    const rect = scene.camera!.rect
    expect(rect.x + rect.width / 2).toBeCloseTo(540)
    expect(rect.width).toBeCloseTo(432)
    expect(rect.y).toBeGreaterThan(900)
    expect(rect.y + rect.height).toBeLessThan(1920)
    expect(scene.camera).toMatchObject({
      border: expect.closeTo(432 * 0.06),
      borderColor: '#ff0000',
      framing: { zoom: 1.6, focusX: 0.4, focusY: 0.5 },
    })
  })

  it('webcam dạng dải ở trên: video màn hình lấp phần bên dưới', () => {
    const edit = verticalEdit()
    edit.camera = { ...edit.camera, layout: 'stack', split: 0.4, position: 'top-left' }
    const scene = computeScene({
      time: 0,
      edit,
      output: vertical,
      video,
      source: 2000,
      cursor: null,
      follow: null,
      hasCamera: true,
    })
    expect(scene.camera).toMatchObject({
      rect: { x: 0, y: 0, width: 1080, height: 768 },
      shape: 'strip',
    })
    expect(scene.content).toEqual({ x: 0, y: 768, width: 1080, height: 1152 })
    expect((scene.view.width * video.width) / (scene.view.height * video.height)).toBeCloseTo(
      1080 / 1152,
    )
  })

  it('không có webcam thì dải không chiếm chỗ', () => {
    const edit = verticalEdit()
    edit.camera = { ...edit.camera, layout: 'stack' }
    const scene = computeScene({
      time: 0,
      edit,
      output: vertical,
      video,
      source: 2000,
      cursor: null,
      follow: null,
      hasCamera: false,
    })
    expect(scene.camera).toBeNull()
    expect(scene.content.height).toBe(1920)
  })
  it('clip xoay 90°: khung hình theo video dọc, con trỏ và vùng vẽ đổi theo; clip khác không đổi', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0
    edit.frame.aspect = 'source'
    const [a] = edit.clips
    edit.clips = [
      {
        ...a!,
        sourceEnd: 5000,
        transform: {
          flipH: false,
          flipV: false,
          rotate: 90,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      },
      { ...a!, id: 'b', sourceStart: 5000 },
    ]
    const at = (time: number) =>
      computeScene({
        time,
        edit,
        output: { width: 1080, height: 1920 },
        video,
        source: time,
        cursor: track(0, 0),
        follow: null,
        hasCamera: false,
      })
    const rotated = at(1000)
    expect(rotated.orient).toEqual({ flipH: false, flipV: false, rotate: 90 })
    // Video 1920×1080 xoay thành 1080×1920: phủ kín khung dọc.
    expect(rotated.content).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
    // Góc trên trái của video gốc sau khi xoay nằm ở góc trên phải.
    expect(rotated.cursor).toMatchObject({ x: 1080, y: 0 })
    expect(rotated.source).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    const plain = at(6000)
    expect(plain.orient).toBeNull()
    expect(plain.cursor).toMatchObject({ x: 0 })
  })

  it('clip cắt khung: vùng vẽ là phần đã cắt, tỉ lệ khung theo phần cắt', () => {
    const edit = createDefaultEdit(project)
    edit.frame.padding = 0
    edit.frame.aspect = 'source'
    edit.clips = [
      {
        ...edit.clips[0]!,
        transform: {
          flipH: true,
          flipV: false,
          rotate: 0,
          crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
        },
      },
    ]
    const scene = computeScene({
      time: 0,
      edit,
      output: { width: 960, height: 1080 },
      video,
      source: 1000,
      cursor: track(0.75, 0.5),
      follow: null,
      hasCamera: false,
    })
    expect(scene.source).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 })
    expect(scene.content.width / scene.content.height).toBeCloseTo(960 / 1080)
    // Giữa phần cắt, lật ngang vẫn ở giữa.
    expect(scene.cursor!.x).toBeCloseTo(480)
  })

  it('bộ lọc: của clip ưu tiên hơn của cả video; không có thì không vẽ lớp nào', () => {
    const edit = createDefaultEdit(project)
    const input = {
      time: 1000,
      edit,
      output,
      video,
      source: 1000,
      cursor: null,
      follow: null,
      hasCamera: false,
    }
    expect(computeScene(input).look).toBeNull()
    edit.look = { ...edit.look, filter: 'bw' }
    expect(computeScene(input).look?.css).toContain('saturate(0)')
    edit.clips = [{ ...edit.clips[0]!, look: { ...edit.look, filter: 'warm' } }]
    expect(computeScene(input).look?.temperature).toBeGreaterThan(0)
    expect(computeScene(input).time).toBe(1000)
  })
})

describe('đoạn video nhập', () => {
  it('không vẽ con trỏ / click của bản quay', () => {
    const edit = createDefaultEdit(project)
    const cursor = {
      stepMs: 10,
      samples: [{ s: 0, x: 0.5, y: 0.5 }],
      clicks: [],
      keys: [],
      moves: [],
    }
    const base = {
      edit,
      time: 100,
      output,
      video,
      source: 100,
      cursor,
      follow: null,
      hasCamera: false,
    }
    expect(computeScene(base).cursor).not.toBeNull()
    expect(computeScene({ ...base, imported: true }).cursor).toBeNull()
  })
})
