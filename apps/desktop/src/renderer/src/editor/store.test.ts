import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultEdit,
  DEFAULT_AUDIO_FX,
  DEFAULT_CAPTION_LOOK,
  DEFAULT_EFFECT_MS,
  DEFAULT_LOOK,
  DEFAULT_TRANSITION_MS,
  EMPTY_MEMORY,
  outputDuration,
  withCaptionTemplate,
} from '@lumora/core'
import { createFakeApi, sampleProject, sampleSummary, sampleTranscript } from '../test/fake-api'
import { useEditorStore } from './store'

const t0 = sampleProject.segments[0]!.startedAt
let api: ReturnType<typeof createFakeApi>['api']

beforeEach(async () => {
  localStorage.clear()
  const fake = createFakeApi()
  fake.api.getEvents.mockResolvedValue([
    { type: 'move', t: t0 + 100, x: 960, y: 540 },
    { type: 'down', t: t0 + 1500, x: 960, y: 540, button: 'left' },
  ])
  window.lumora = fake.api
  api = fake.api
  useEditorStore.getState().reset()
  // Trí nhớ và tùy chọn Đạo diễn AI dùng chung mọi dự án: xóa để các test không lẫn nhau.
  useEditorStore.setState({ memory: EMPTY_MEMORY, askConfirm: false })
  await useEditorStore.getState().load(sampleSummary.folder)
})

describe('editor store', () => {
  it('mở lần đầu: mỗi đoạn quay là một clip, tự tạo zoom từ click', () => {
    const { edit, cursor } = useEditorStore.getState()
    expect(edit!.clips).toHaveLength(2)
    expect(outputDuration(edit!.clips)).toBe(7000)
    expect(edit!.zooms).toHaveLength(1)
    expect(edit!.zooms[0]!.start).toBe(1000)
    expect(cursor!.clicks).toHaveLength(1)
  })

  it('tách, xóa clip rồi hoàn tác/làm lại', () => {
    const s = useEditorStore.getState
    s().setTime(2000)
    s().splitAtPlayhead()
    expect(s().edit!.clips).toHaveLength(3)
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    expect(s().edit!.clips).toHaveLength(2)
    expect(outputDuration(s().edit!.clips)).toBe(5000)
    s().undo()
    expect(s().edit!.clips).toHaveLength(3)
    s().undo()
    expect(s().edit!.clips).toHaveLength(2)
    s().redo()
    expect(s().edit!.clips).toHaveLength(3)
  })

  it('không xóa clip cuối cùng', () => {
    const s = useEditorStore.getState
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    expect(s().edit!.clips).toHaveLength(1)
  })

  it('chọn nhiều clip và zoom (kéo khung / Ctrl+click): Delete xóa cả nhóm, giữ lại ít nhất một clip', () => {
    const s = useEditorStore.getState
    s().setTime(2000)
    s().splitAtPlayhead()
    s().setTime(4000)
    s().splitAtPlayhead()
    const clips = s().edit!.clips
    expect(clips).toHaveLength(4)
    const zoomId = s().edit!.zooms[0]!.id
    // Chọn clip bằng click rồi Ctrl+click thêm clip và zoom.
    s().select({ kind: 'clip', id: clips[0]!.id })
    expect(s().selected).toEqual([{ kind: 'clip', id: clips[0]!.id }])
    s().toggleSelect({ kind: 'clip', id: clips[1]!.id })
    s().toggleSelect({ kind: 'zoom', id: zoomId })
    expect(s().selected).toHaveLength(3)
    expect(s().isSelected('zoom', zoomId)).toBe(true)
    s().deleteSelection()
    expect(s().edit!.clips.map((c) => c.id)).toEqual([clips[2]!.id, clips[3]!.id])
    expect(s().edit!.zooms).toHaveLength(0)
    expect(s().selected).toHaveLength(0)
    expect(s().selection).toBeNull()
    // Một bước hoàn tác trả lại cả nhóm.
    s().undo()
    expect(s().edit!.clips).toHaveLength(4)
    expect(s().edit!.zooms).toHaveLength(1)
    // Kéo khung chọn hết mọi clip: xóa vẫn giữ lại clip đầu.
    s().selectMany(s().edit!.clips.map((c) => ({ kind: 'clip' as const, id: c.id })))
    s().deleteSelection()
    expect(s().edit!.clips).toHaveLength(1)
    expect(s().edit!.clips[0]!.id).toBe(clips[0]!.id)
    // Shift+Delete với nhóm clip cũng xóa (clip không có khoảng trống để dồn).
    s().undo()
    s().selectMany([
      { kind: 'clip', id: clips[1]!.id },
      { kind: 'clip', id: clips[2]!.id },
    ])
    s().rippleDeleteSelection()
    expect(s().edit!.clips.map((c) => c.id)).toEqual([clips[0]!.id, clips[3]!.id])
  })

  it('kéo thanh trượt liên tục chỉ tính một bước hoàn tác', () => {
    const s = useEditorStore.getState
    for (const padding of [0.1, 0.12, 0.15])
      s().change((e) => ({ ...e, frame: { ...e.frame, padding } }), 'padding')
    expect(s().past).toHaveLength(1)
    s().undo()
    expect(s().edit!.frame.padding).toBe(0.06)
  })

  it('đổi độ mượt con trỏ thì tính lại đường đi', () => {
    const s = useEditorStore.getState
    const before = s().cursor
    s().change((e) => ({ ...e, cursor: { ...e.cursor, smoothing: 0 } }))
    expect(s().cursor).not.toBe(before)
  })

  it('thêm zoom tại đầu phát và chọn nó; đổi tốc độ clip', () => {
    const s = useEditorStore.getState
    s().setTime(5000)
    s().addZoomAtPlayhead()
    expect(s().edit!.zooms).toHaveLength(2)
    expect(s().selection?.kind).toBe('zoom')
    const id = s().edit!.clips[0]!.id
    s().setClipSpeed(id, 2)
    expect(outputDuration(s().edit!.clips)).toBe(4500)
  })

  it('đặt mức zoom cho tất cả đoạn; thay danh sách zoom thì bỏ chọn đoạn không còn', () => {
    const s = useEditorStore.getState
    s().setTime(5000)
    s().addZoomAtPlayhead()
    expect(s().edit!.zooms).toHaveLength(2)
    s().updateAllZooms({ scale: 3.2 })
    expect(s().edit!.zooms.map((z) => z.scale)).toEqual([3.2, 3.2])
    const before = s().edit
    s().updateAllZooms({ scale: 3.2 })
    expect(s().edit).toBe(before) // không ghi thêm bước lịch sử
    s().undo()
    expect(s().edit!.zooms.map((z) => z.scale)).toEqual([2, 2])

    const selected = s().selection
    expect(selected?.kind).toBe('zoom')
    s().setZooms([{ id: 'new', start: 0, end: 1500, scale: 2.5, mode: 'follow', x: 0.5, y: 0.5 }])
    expect(s().edit!.zooms).toEqual([
      { id: 'new', start: 0, end: 1500, scale: 2.5, mode: 'follow', x: 0.5, y: 0.5 },
    ])
    expect(s().selection).toBeNull()
  })

  it('đầu phát không vượt quá độ dài video', () => {
    useEditorStore.getState().setTime(99_999)
    expect(useEditorStore.getState().time).toBe(7000)
  })
})

describe('phím A / D', () => {
  it('A xóa phần trái của clip tại đầu phát, D xóa phần phải; hoàn tác được', () => {
    const s = useEditorStore.getState
    s().setTime(2000)
    s().trimAtPlayhead('left')
    expect(s().edit!.clips[0]).toMatchObject({ sourceStart: 2000, sourceEnd: 5000 })
    expect(s().time).toBe(0)
    expect(outputDuration(s().edit!.clips)).toBe(5000)
    s().setTime(1000)
    s().trimAtPlayhead('right')
    expect(s().edit!.clips[0]).toMatchObject({ sourceStart: 2000, sourceEnd: 3000 })
    expect(outputDuration(s().edit!.clips)).toBe(3000)
    s().undo()
    s().undo()
    expect(outputDuration(s().edit!.clips)).toBe(7000)
  })

  it('đổi tốc độ khung nhìn thì tính lại đường đi của khung nhìn', () => {
    const s = useEditorStore.getState
    const before = s().follow
    s().change((e) => ({ ...e, motion: { ...e.motion, cameraSpeed: 0.1 } }))
    expect(s().follow).not.toBe(before)
    expect(s().cursor).not.toBeNull()
  })
})

describe('chuyển tiếp', () => {
  it('đặt, đổi thời gian, bỏ; tách clip thì chuyển tiếp vẫn ở đúng chỗ nối cũ', () => {
    const s = useEditorStore.getState
    const [a] = s().edit!.clips
    s().setTransition(a!.id, 'fadeBlack')
    expect(s().edit!.transitions).toEqual([
      { afterClip: a!.id, kind: 'fadeBlack', durationMs: 600 },
    ])
    s().setTransition(a!.id, 'fadeBlack', 1200)
    expect(s().edit!.transitions[0]!.durationMs).toBe(1200)

    // Tách clip đầu ở giây 2: chỗ nối cũ (5s) giờ nằm sau mảnh bên phải.
    s().setTime(2000)
    s().splitAtPlayhead()
    const clips = s().edit!.clips
    expect(clips).toHaveLength(3)
    expect(s().edit!.transitions[0]!.afterClip).toBe(clips[1]!.id)

    // Mặc định chỉ ở chỗ đổi cảnh: chỗ tách tại chỗ (2s) hình vẫn liền nên không có; 'all' mới đủ.
    expect(s().applyTransitionToAll('zoom', 800)).toBe(1)
    expect(s().edit!.transitions).toEqual([
      { afterClip: clips[1]!.id, kind: 'zoom', durationMs: 800 },
    ])
    expect(s().applyTransitionToAll('zoom', 800, 'all')).toBe(2)
    expect(s().edit!.transitions.map((t) => t.kind)).toEqual(['zoom', 'zoom'])

    // Xóa clip cuối: chỗ nối của nó biến mất, chuyển tiếp tương ứng bị bỏ.
    s().select({ kind: 'clip', id: clips[2]!.id })
    s().deleteSelection()
    expect(s().edit!.transitions).toHaveLength(1)

    s().setTransition(clips[0]!.id, null)
    expect(s().edit!.transitions).toEqual([])
  })
})

describe('lệnh trợ lý AI (applyAssistantCommands)', () => {
  it('hiệu ứng: ở đầu video và mỗi chỗ nối, không chọn, không thêm trùng; một bước hoàn tác', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([{ kind: 'effect', effect: 'shake' }])
    expect(report).toEqual([{ step: 'effect', status: 'done', detail: 2 }])
    // Hai clip (5s + 2s): hiệu ứng tại 0 và tại chỗ nối 5000.
    expect(s().edit!.effects.map((e) => [e.kind, e.start, e.end, e.intensity])).toEqual([
      ['shake', 0, DEFAULT_EFFECT_MS, 0.7],
      ['shake', 5000, 5000 + DEFAULT_EFFECT_MS, 0.7],
    ])
    expect(s().selection).toBeNull()
    expect(s().past).toHaveLength(1)
    // Gọi lại cùng hiệu ứng: chỗ đã có thì bỏ qua.
    expect(await s().applyAssistantCommands([{ kind: 'effect', effect: 'shake' }])).toEqual([
      { step: 'effect', status: 'skipped', detail: 'duplicate' },
    ])
    expect(s().edit!.effects).toHaveLength(2)
    s().undo()
    expect(s().edit!.effects).toEqual([])
  })

  it('lệnh transitions: chỉ chỗ đổi cảnh; tách tại chỗ thì bỏ qua (no_scene_cuts) trừ khi all', async () => {
    const s = useEditorStore.getState
    // Dự án một đoạn quay, tách tại chỗ ở giây 2: hình liền, không phải đổi cảnh.
    const [a, b] = s().edit!.clips
    s().select({ kind: 'clip', id: b!.id })
    s().deleteSelection()
    s().setTime(2000)
    s().splitAtPlayhead()
    expect(s().edit!.clips).toHaveLength(2)
    expect(
      await s().applyAssistantCommands([{ kind: 'transitions', transition: 'fadeBlack' }]),
    ).toEqual([{ step: 'transitions', status: 'skipped', detail: 'no_scene_cuts' }])
    expect(s().edit!.transitions).toEqual([])
    expect(
      await s().applyAssistantCommands([
        { kind: 'transitions', transition: 'fadeBlack', all: true },
      ]),
    ).toEqual([{ step: 'transitions', status: 'done', detail: 1 }])
    expect(s().edit!.transitions).toEqual([
      { afterClip: a!.id, kind: 'fadeBlack', durationMs: DEFAULT_TRANSITION_MS },
    ])
  })

  it('chuyển cảnh cho mọi chỗ nối; mẫu phụ đề', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([
      { kind: 'transitions', transition: 'zoom' },
      { kind: 'captionsStyle', template: 'karaoke' },
    ])
    expect(report).toEqual([
      { step: 'transitions', status: 'done', detail: 1 },
      { step: 'captionsStyle', status: 'done', detail: 1 },
    ])
    expect(s().edit!.transitions).toEqual([
      { afterClip: s().edit!.clips[0]!.id, kind: 'zoom', durationMs: DEFAULT_TRANSITION_MS },
    ])
    expect(s().edit!.captions.look).toMatchObject({
      template: 'karaoke',
      highlightColor: '#22d3ee',
    })
    expect(s().past).toHaveLength(1)
  })

  it('nhạc nền: kho trống thì báo bỏ qua; có bài thì chọn theo từ khóa và đặt âm lượng', async () => {
    const s = useEditorStore.getState
    expect(
      await s().applyAssistantCommands([{ kind: 'music', query: 'lofi', volume: 0.3 }]),
    ).toEqual([{ step: 'music', status: 'skipped', detail: 'no_music' }])
    expect(s().edit!.audioClips).toHaveLength(0)
    expect(s().past).toHaveLength(0)

    // Thêm hai bài (bài sau đứng đầu kho): tìm "lofi" phải ra "Lofi Chill".
    await api.addMusicPaths(['C:\\nhac\\Lofi Chill.mp3', 'C:\\nhac\\Rock Anthem.mp3'], 'file')
    expect(
      await s().applyAssistantCommands([{ kind: 'music', query: 'LOFI', volume: 0.3 }]),
    ).toEqual([{ step: 'music', status: 'done', detail: 1 }])
    expect(api.useMusic).toHaveBeenCalledWith(sampleSummary.folder, 'music-1.mp3')
    expect(s().edit!.audioClips).toHaveLength(1)
    expect(s().edit!.audioClips[0]).toMatchObject({
      kind: 'music',
      name: 'Lofi Chill',
      volume: 0.3,
      start: 0,
      duration: 7000,
      loop: true,
    })
    expect(s().past).toHaveLength(1)
    // Không có bài nào khớp từ khóa: lấy bài đầu kho.
    await s().applyAssistantCommands([{ kind: 'music', query: 'jazz', volume: 0.5 }])
    expect(s().edit!.audioClips[1]).toMatchObject({ name: 'Rock Anthem', volume: 0.5 })
  })

  it('xuất: đặt độ phân giải / định dạng rồi yêu cầu mở hộp thoại xuất và tự xuất', async () => {
    const s = useEditorStore.getState
    expect(s().exportRequest).toBe(0)
    const report = await s().applyAssistantCommands([
      { kind: 'filter', preset: 'warm', intensity: 0.8 },
      { kind: 'export', resolution: 720, format: 'gif' },
    ])
    expect(report).toEqual([
      { step: 'filter', status: 'done', detail: 1 },
      { step: 'export', status: 'done', detail: 1 },
    ])
    expect(s().edit!.export).toMatchObject({ resolution: 720, format: 'gif' })
    expect(s().edit!.look).toMatchObject({ filter: 'warm', intensity: 0.8 })
    expect(s().exportRequest).toBe(1)
    expect(s().autoExport).toBe(true)
    // Cả hai lệnh là một bước hoàn tác.
    expect(s().past).toHaveLength(1)
    s().requestExport(false)
    expect(s().exportRequest).toBe(2)
    expect(s().autoExport).toBe(false)
  })

  it('theo mẫu dự án: tìm dự án theo tên, chép khung / bộ lọc / phụ đề / chuyển cảnh; không có thì bỏ qua', async () => {
    const s = useEditorStore.getState
    const sample = createDefaultEdit(sampleProject)
    api.getEdit.mockResolvedValue({
      ...sample,
      frame: { ...sample.frame, aspect: '9:16', fill: true, padding: 0.1 },
      look: { ...DEFAULT_LOOK, filter: 'cinematic', intensity: 0.6 },
      captions: { ...sample.captions, look: withCaptionTemplate(DEFAULT_CAPTION_LOOK, 'neon') },
      cursor: { ...sample.cursor, size: 2 },
      motion: { ...sample.motion, cameraSpeed: 0.3 },
      audio: { ...sample.audio, micFx: { ...DEFAULT_AUDIO_FX, noise: 'strong', enhance: true } },
      transitions: [{ afterClip: 'khac', kind: 'slide', durationMs: 900 }],
    })
    // Gõ tên dự án (không phân biệt hoa thường) → tìm ra thư mục.
    const report = await s().applyAssistantCommands([
      { kind: 'styleFrom', project: sampleSummary.name.toUpperCase() },
    ])
    expect(report).toEqual([{ step: 'styleFrom', status: 'done', detail: 1 }])
    expect(api.getEdit).toHaveBeenLastCalledWith(sampleSummary.folder)
    const edit = s().edit!
    expect(edit.frame).toMatchObject({ aspect: '9:16', fill: true, padding: 0.1 })
    expect(edit.look).toMatchObject({ filter: 'cinematic', intensity: 0.6 })
    expect(edit.captions.look.template).toBe('neon')
    expect(edit.cursor.size).toBe(2)
    expect(edit.motion.cameraSpeed).toBe(0.3)
    expect(edit.audio.micFx).toMatchObject({ noise: 'strong', enhance: true })
    // Chuyển cảnh của mẫu áp cho chỗ nối của dự án này.
    expect(edit.transitions).toEqual([
      { afterClip: edit.clips[0]!.id, kind: 'slide', durationMs: 900 },
    ])
    expect(s().past).toHaveLength(1)

    api.getEdit.mockResolvedValue(null)
    expect(await s().applyAssistantCommands([{ kind: 'styleFrom', project: 'Không có' }])).toEqual([
      { step: 'styleFrom', status: 'skipped', detail: 'no_project' },
    ])
    expect(s().past).toHaveLength(1)
  })

  it('runAssistant vẫn hiểu từ khóa và báo cáo theo tên lệnh', async () => {
    const s = useEditorStore.getState
    const { commands, report } = await s().runAssistant('bộ lọc cổ điển, cắt khoảng lặng')
    expect(commands.map((c) => c.kind)).toEqual(['cutSilences', 'filter'])
    // Chưa có lời thoại lẫn dạng sóng: nhận dạng để tìm khoảng lặng. Bước AI báo theo tên bước
    // tự biên tập, lệnh còn lại theo loại lệnh.
    expect(api.transcribe).toHaveBeenCalledWith(sampleSummary.folder, '')
    expect(report).toEqual([
      { step: 'silences', status: 'done', detail: 1 },
      { step: 'filter', status: 'done', detail: 1 },
    ])
    expect(outputDuration(s().edit!.clips)).toBeLessThan(7000)
    expect(s().edit!.look.filter).toBe('vintage')
    expect(s().past).toHaveLength(1)
  })
})

describe('lệnh mở rộng của Đạo diễn AI (timeline, âm thanh, khung, lớp, phụ đề, mốc)', () => {
  const s = useEditorStore.getState

  it('cutRange cắt một đoạn trên video xuất; freeze chèn khung đứng yên; too_short khi vô nghĩa', async () => {
    const report = await s().applyAssistantCommands([
      { kind: 'cutRange', fromMs: 1000, toMs: 2000 },
      { kind: 'freeze', atMs: 500, ms: 1500 },
    ])
    expect(report).toEqual([
      { step: 'cutRange', status: 'done', detail: 1 },
      { step: 'freeze', status: 'done', detail: 1 },
    ])
    // 7000 - 1000 (cắt) + 1500 (đứng yên).
    expect(outputDuration(s().edit!.clips)).toBe(7500)
    expect(s().edit!.clips.some((c) => c.freeze === 1500)).toBe(true)
    expect(s().past).toHaveLength(1)
    expect(
      await s().applyAssistantCommands([{ kind: 'cutRange', fromMs: 0, toMs: 60_000 }]),
    ).toEqual([{ step: 'cutRange', status: 'skipped', detail: 'too_short' }])
  })

  it('flip / rotate đặt biến đổi cho mọi clip; về mặc định thì bỏ trường transform', async () => {
    await s().applyAssistantCommands([
      { kind: 'flip', axis: 'horizontal' },
      { kind: 'rotate', degrees: 90 },
    ])
    expect(s().edit!.clips.every((c) => c.transform?.flipH && c.transform.rotate === 90)).toBe(true)
    s().undo()
    expect(s().edit!.clips.every((c) => c.transform === undefined)).toBe(true)
  })

  it('volume: mic / máy đổi mức chung; nhạc chưa có thì bỏ qua; voiceFx đổi giọng mic', async () => {
    const report = await s().applyAssistantCommands([
      { kind: 'volume', target: 'mic', level: 0 },
      { kind: 'volume', target: 'system', level: 1.5 },
      { kind: 'volume', target: 'music', level: 0.2 },
      { kind: 'voiceFx', voice: 'robot' },
      { kind: 'fade', ms: 800 },
    ])
    expect(report).toEqual([
      { step: 'volume', status: 'done', detail: 1 },
      { step: 'volume', status: 'done', detail: 1 },
      { step: 'volume', status: 'skipped', detail: 'no_music' },
      { step: 'voiceFx', status: 'done', detail: 1 },
      { step: 'fade', status: 'skipped', detail: 'no_music' },
    ])
    expect(s().edit!.audio).toMatchObject({ mic: 0, system: 1.5 })
    expect(s().edit!.audio.micFx.voice).toBe('robot')
    // Có nhạc rồi thì âm lượng và fade áp cho bài nhạc.
    await api.addMusicPaths(['C:\\nhac\\Lofi Chill.mp3'], 'file')
    await s().applyAssistantCommands([
      { kind: 'music', query: 'lofi', volume: 0.4 },
      { kind: 'volume', target: 'music', level: 0.2 },
      { kind: 'fade', ms: 800 },
    ])
    const music = s().edit!.audioClips.find((a) => a.kind === 'music')!
    expect(music).toMatchObject({ volume: 0.2, fadeIn: 800, fadeOut: 800 })
  })

  it('sound chèn hiệu ứng âm thanh tại thời điểm, không chọn', async () => {
    const report = await s().applyAssistantCommands([{ kind: 'sound', sound: 'tada', atMs: 2500 }])
    expect(report).toEqual([{ step: 'sound', status: 'done', detail: 1 }])
    expect(api.addSoundEffect).toHaveBeenCalledWith(sampleSummary.folder, 'tada')
    expect(s().edit!.audioClips).toMatchObject([{ kind: 'sfx', start: 2500, duration: 800 }])
    expect(s().selection).toBeNull()
  })

  it('zoomLevel đặt mức cho mọi zoom; zoomAt thêm đoạn theo thời gian xuất; motion đổi chuyển động', async () => {
    const report = await s().applyAssistantCommands([
      { kind: 'zoomLevel', scale: 3 },
      { kind: 'zoomAt', atMs: 4000, ms: 2000, scale: 2.5 },
      { kind: 'motion', cameraSpeed: 0.3, zoomMs: 1200 },
    ])
    expect(report).toEqual([
      { step: 'zoomLevel', status: 'done', detail: 1 },
      { step: 'zoomAt', status: 'done', detail: 1 },
      { step: 'motion', status: 'done', detail: 1 },
    ])
    const zooms = s().edit!.zooms
    expect(zooms).toHaveLength(2)
    expect(zooms[0]!.scale).toBe(3)
    // Chưa cắt gì nên thời gian xuất trùng thời gian nguồn.
    expect(zooms[1]).toMatchObject({ start: 4000, end: 6000, scale: 2.5, mode: 'follow' })
    expect(s().edit!.motion).toEqual({ cameraSpeed: 0.3, zoomTransitionMs: 1200 })
    expect(s().past).toHaveLength(1)
    await s().applyAssistantCommands([{ kind: 'clear', target: 'zooms' }])
    expect(await s().applyAssistantCommands([{ kind: 'zoomLevel', scale: 2 }])).toEqual([
      { step: 'zoomLevel', status: 'skipped', detail: 'no_zooms' },
    ])
  })

  it('frame / background / cursor / camera chỉ đổi trường được nêu', async () => {
    const before = s().edit!
    await s().applyAssistantCommands([
      { kind: 'frame', padding: 0.1, fill: false },
      { kind: 'background', color: '#112233', color2: '#445566' },
      { kind: 'cursor', visible: false, size: 2 },
      {
        kind: 'camera',
        visible: true,
        shape: 'square',
        position: 'top-left',
        beauty: true,
        background: 'blur',
      },
    ])
    const e = s().edit!
    expect(e.frame).toMatchObject({
      padding: 0.1,
      radius: before.frame.radius,
      shadow: before.frame.shadow,
      background: { kind: 'gradient', color: '#112233', color2: '#445566' },
    })
    expect(e.cursor).toMatchObject({
      visible: false,
      size: 2,
      clickEffect: before.cursor.clickEffect,
    })
    expect(e.camera).toMatchObject({
      shape: 'square',
      position: 'top-left',
      x: 0,
      y: 0,
      size: before.camera.size,
      background: { mode: 'blur' },
    })
    expect(e.camera.beauty.smooth).toBeGreaterThan(0)
    await s().applyAssistantCommands([{ kind: 'background', color: '#000000', color2: '' }])
    expect(s().edit!.frame.background).toEqual({
      kind: 'solid',
      color: '#000000',
      color2: '#000000',
      angle: 0,
    })
  })

  it('text / sticker / shape thêm lớp tại thời điểm và vị trí, không chọn lớp', async () => {
    const report = await s().applyAssistantCommands([
      {
        kind: 'text',
        text: 'Xin chào',
        atMs: 1000,
        ms: 2000,
        template: 'neon',
        position: 'bottom',
      },
      { kind: 'sticker', emoji: '🔥', atMs: 500, ms: 1000, position: 'center' },
      { kind: 'shape', shape: 'arrow', atMs: 0, ms: 3000, x: 0.8, y: 0.3, color: '#ff0000' },
      // Sát cuối video: cắt bớt cho vừa.
      { kind: 'text', text: 'Hết', atMs: 6500, ms: 5000, template: 'title', position: 'top' },
    ])
    expect(report.map((r) => r.status)).toEqual(['done', 'done', 'done', 'done'])
    const o = s().edit!.overlays
    expect(o).toHaveLength(4)
    expect(o[0]).toMatchObject({ kind: 'text', text: 'Xin chào', start: 1000, end: 3000, y: 0.85 })
    expect(o[0]!.textStyle?.font).toBeDefined()
    expect(o[1]).toMatchObject({ kind: 'emoji', text: '🔥', start: 500, end: 1500, x: 0.5, y: 0.5 })
    expect(o[2]).toMatchObject({ kind: 'shape', shape: 'arrow', color: '#ff0000', x: 0.8, y: 0.3 })
    expect(o[3]).toMatchObject({ start: 6500, end: 7000, y: 0.15 })
    expect(s().selection).toBeNull()
    expect(s().past).toHaveLength(1)
  })

  it('adjust đổi từng thông số màu; clear filter / adjust đặt lại', async () => {
    await s().applyAssistantCommands([
      { kind: 'filter', preset: 'warm', intensity: 0.8 },
      { kind: 'adjust', setting: 'brightness', value: 0.3 },
      { kind: 'adjust', setting: 'contrast', value: -0.2 },
    ])
    expect(s().edit!.look.adjust).toMatchObject({ brightness: 0.3, contrast: -0.2, saturation: 0 })
    const report = await s().applyAssistantCommands([
      { kind: 'clear', target: 'filter' },
      { kind: 'clear', target: 'adjust' },
      { kind: 'clear', target: 'adjust' },
    ])
    expect(report).toEqual([
      { step: 'clear', status: 'done', detail: 1 },
      { step: 'clear', status: 'done', detail: 1 },
      { step: 'clear', status: 'skipped', detail: 'nothing' },
    ])
    expect(s().edit!.look).toEqual(DEFAULT_LOOK)
  })

  it('captionsLayout và translate: chưa có phụ đề thì bỏ qua; có thì dịch thay / song ngữ', async () => {
    expect(
      await s().applyAssistantCommands([
        { kind: 'captionsLayout', position: 'top', size: 1.4 },
        { kind: 'translate', language: 'en', bilingual: false },
      ]),
    ).toEqual([
      { step: 'captionsLayout', status: 'done', detail: 1 },
      { step: 'translate', status: 'skipped', detail: 'no_captions' },
    ])
    expect(s().edit!.captions).toMatchObject({ position: 'top', size: 1.4, look: { y: 0.12 } })
    s().change((e) => ({
      ...e,
      captions: {
        ...e.captions,
        enabled: true,
        lines: [{ id: 'l1', start: 1000, end: 2000, text: 'xin chào', words: [], edited: false }],
      },
    }))
    await s().applyAssistantCommands([{ kind: 'translate', language: 'en', bilingual: true }])
    expect(s().edit!.captions).toMatchObject({
      bilingual: true,
      translationLanguage: 'en',
      lines: [{ text: 'xin chào', translation: 'EN: xin chào' }],
    })
    await s().applyAssistantCommands([{ kind: 'translate', language: 'en', bilingual: false }])
    expect(s().edit!.captions).toMatchObject({
      bilingual: false,
      language: 'en',
      lines: [{ text: 'EN: xin chào', edited: true }],
    })
    expect(s().edit!.captions.lines[0]!.translation).toBeUndefined()
    expect(await s().applyAssistantCommands([{ kind: 'clear', target: 'captions' }])).toEqual([
      { step: 'clear', status: 'done', detail: 1 },
    ])
    expect(s().edit!.captions).toMatchObject({ enabled: false, lines: [] })
  })

  it('captionsEmoji / captionsKeywords: chưa có phụ đề thì bỏ qua; có thì AI gắn emoji và từ khóa, không AI thì dùng từ điển', async () => {
    expect(
      await s().applyAssistantCommands([{ kind: 'captionsEmoji' }, { kind: 'captionsKeywords' }]),
    ).toEqual([
      { step: 'captionsEmoji', status: 'skipped', detail: 'no_captions' },
      { step: 'captionsKeywords', status: 'skipped', detail: 'no_captions' },
    ])
    s().change((e) => ({
      ...e,
      captions: {
        ...e.captions,
        enabled: true,
        lines: [
          { id: 'l1', start: 1500, end: 2300, text: 'Xin chào các bạn', words: [], edited: false },
          { id: 'l2', start: 3500, end: 4300, text: 'Bấm Lưu nhé', words: [], edited: false },
        ],
      },
    }))
    expect(
      await s().applyAssistantCommands([{ kind: 'captionsEmoji' }, { kind: 'captionsKeywords' }]),
    ).toEqual([
      { step: 'captionsEmoji', status: 'done', detail: 2 },
      { step: 'captionsKeywords', status: 'done', detail: 2 },
    ])
    expect(s().edit!.captions.lines.map((l) => [l.emoji, l.keywords])).toEqual([
      ['🔥', ['Xin']],
      ['🔥', ['Bấm']],
    ])
    // Không có AI (lỗi key): từ điển emoji / quy tắc từ khóa cục bộ.
    api.captionEmojis.mockRejectedValue(new Error('no_api_key'))
    api.captionKeywords.mockRejectedValue(new Error('no_api_key'))
    expect(await s().addCaptionEmojis()).toBe(2)
    expect(await s().addCaptionKeywords()).toBe(1)
    expect(s().edit!.captions.lines.map((l) => [l.emoji, l.keywords])).toEqual([
      ['👋', undefined],
      ['👆', ['Lưu']],
    ])
    s().undo()
    expect(s().edit!.captions.lines[1]!.keywords).toEqual(['Bấm'])
  })

  it('dub: đọc từng dòng đúng thời điểm, đọc nhanh hơn khi câu dài, tắt mic, phụ đề sang ngôn ngữ đích', async () => {
    expect(
      await s().applyAssistantCommands([{ kind: 'dub', language: 'en', keepOriginal: false }]),
    ).toEqual([{ step: 'dub', status: 'skipped', detail: 'no_captions' }])
    s().change((e) => ({
      ...e,
      captions: {
        ...e.captions,
        enabled: true,
        language: 'vi',
        lines: [
          { id: 'l1', start: 1500, end: 2300, text: 'câu dài', words: [], edited: false },
          { id: 'l2', start: 3500, end: 4300, text: 'câu ngắn', words: [], edited: false },
        ],
      },
    }))
    // Câu đầu đọc hết 2400 ms ở tốc độ 1 nhưng chỗ trống tới dòng sau chỉ 2000 ms.
    api.speak.mockImplementation(async (_folder, text, _voice, options) => ({
      file: `tts-${text.replace(/\W+/g, '-')}.mp3`,
      name: text,
      durationMs: Math.round((text.includes('dài') ? 2400 : 900) / (options?.speed ?? 1)),
    }))
    expect(
      await s().applyAssistantCommands([
        { kind: 'dub', language: 'en', keepOriginal: false, voiceName: 'bao' },
      ]),
    ).toEqual([{ step: 'dub', status: 'done', detail: 2 }])
    expect(api.translateLines).toHaveBeenCalledWith(
      [
        { id: 'l1', text: 'câu dài' },
        { id: 'l2', text: 'câu ngắn' },
      ],
      'en',
    )
    // 2 câu + 1 lần đọc lại nhanh hơn (1.2×) cho câu dài, bằng giọng "Bao".
    expect(api.speak).toHaveBeenCalledTimes(3)
    expect(api.speak.mock.calls.every((c) => c[2] === 'voice-bao')).toBe(true)
    expect(api.speak.mock.calls[1]![3]).toMatchObject({ speed: 1.2 })
    const voice = s().edit!.audioClips.filter((c) => c.kind === 'voice')
    expect(voice.map((c) => [c.start, c.duration, c.sourceDuration])).toEqual([
      [1500, 2000, 2000],
      [3500, 900, 900],
    ])
    expect(s().edit!.audio.mic).toBe(0)
    expect(s().edit!.captions).toMatchObject({
      language: 'en',
      lines: [
        { text: 'EN: câu dài', edited: true },
        { text: 'EN: câu ngắn', edited: true },
      ],
    })
    // Một bước hoàn tác trả lại tất cả.
    s().undo()
    expect(s().edit!.audioClips.filter((c) => c.kind === 'voice')).toHaveLength(0)
    expect(s().edit!.captions.language).toBe('vi')
    expect(s().edit!.audio.mic).toBeGreaterThan(0)
    // Giữ tiếng gốc: mic nhỏ lại chứ không tắt; cùng ngôn ngữ thì không dịch.
    api.translateLines.mockClear()
    await s().dubCaptions({ language: 'vi', keepOriginal: true })
    expect(api.translateLines).not.toHaveBeenCalled()
    expect(s().edit!.audio.mic).toBeCloseTo(0.15)
    expect(s().edit!.captions.lines[0]!.text).toBe('câu dài')
    // Giọng không có: báo lỗi rõ.
    api.listVoices.mockResolvedValue([])
    expect(
      await s().applyAssistantCommands([{ kind: 'dub', language: 'en', keepOriginal: false }]),
    ).toEqual([{ step: 'dub', status: 'error', detail: 'no_voice' }])
  })

  it('marker / chapters thêm mốc; track ẩn hàng; clear theo loại và khôi phục bản quay', async () => {
    s().setTime(2000)
    s().splitAtPlayhead()
    s().select({ kind: 'clip', id: s().edit!.clips[0]!.id })
    s().deleteSelection()
    expect(outputDuration(s().edit!.clips)).toBe(5000)
    const report = await s().applyAssistantCommands([
      { kind: 'marker', atMs: 1000, label: 'Mốc A' },
      { kind: 'chapters' },
      { kind: 'track', row: 'effects', hidden: true },
      { kind: 'effect', effect: 'shake' },
      { kind: 'clear', target: 'effects' },
      { kind: 'clear', target: 'sfx' },
      { kind: 'clear', target: 'cuts' },
    ])
    expect(report).toEqual([
      { step: 'marker', status: 'done', detail: 1 },
      // Chương "Mở đầu" (nguồn 0) đã bị cắt; "Phần 2" (nguồn 5500 → xuất 3500) còn.
      { step: 'chapters', status: 'done', detail: 1 },
      { step: 'track', status: 'done', detail: 1 },
      { step: 'effect', status: 'done', detail: 2 },
      { step: 'clear', status: 'done', detail: 2 },
      { step: 'clear', status: 'skipped', detail: 'nothing' },
      { step: 'clear', status: 'done', detail: 1 },
    ])
    expect(s().edit!.markers.map((m) => [m.t, m.label])).toEqual([
      [1000, 'Mốc A'],
      [3500, 'Phần 2'],
    ])
    expect(s().edit!.tracks.effects.hidden).toBe(true)
    expect(s().edit!.effects).toEqual([])
    expect(outputDuration(s().edit!.clips)).toBe(7000)
  })

  it('shorts: video 7 giây không chia được (đoạn tối thiểu 5 giây) thì báo too_short; export đặt fps', async () => {
    const report = await s().applyAssistantCommands([
      { kind: 'shorts', mode: 'fixed', seconds: 5, vertical: true, count: 3 },
    ])
    expect(report).toEqual([{ step: 'shorts', status: 'skipped', detail: 'too_short' }])
    expect(api.duplicateProject).not.toHaveBeenCalled()
    s().requestExport = () => {}
    await s().applyAssistantCommands([{ kind: 'export', resolution: 720, format: 'mp4', fps: 60 }])
    expect(s().edit!.export).toMatchObject({ resolution: 720, fps: 60 })
  })
})

describe('đạo diễn AI', () => {
  const key = `lumora.director.${sampleSummary.folder}`
  const saved = () => JSON.parse(localStorage.getItem(key)!).messages as unknown[]

  it('AI hỏi lại thì giữ kế hoạch chờ, không làm; lưu hội thoại và nạp lại khi mở dự án', async () => {
    const s = useEditorStore.getState
    api.directEdits.mockResolvedValueOnce({
      summary: 'Thêm nhạc nền.',
      questions: ['Nhạc kiểu gì?'],
      commands: [],
    })
    const result = await s().askDirector('  thêm nhạc nền  ')
    expect(result.applied).toBe(false)
    // Câu hỏi của AI + câu hỏi tại chỗ (kho nhạc trống), tối đa 2.
    expect(result.plan.questions).toHaveLength(2)
    expect(result.plan.questions[0]).toBe('Nhạc kiểu gì?')
    expect(result.plan.commands.map((c) => c.kind)).toEqual(['music'])
    expect(s().directorPlan).toEqual(result.plan)
    expect(s().directorBusy).toBe(false)
    expect(s().edit!.audioClips).toHaveLength(0)
    expect(s().past).toHaveLength(0)
    expect(api.directEdits).toHaveBeenCalledWith(
      'thêm nhạc nền',
      expect.objectContaining({
        durationMs: 7000,
        hasTranscript: false,
        hasCursor: true,
        musicTracks: [],
        projects: [],
        memory: '',
        history: [],
      }),
    )
    expect(s().directorMessages.map((m) => m.role)).toEqual(['user', 'ai'])
    // Câu AI nói: tóm tắt + các câu hỏi, mỗi thứ một dòng.
    expect(s().directorMessages[1]!.text).toMatch(/^Thêm nhạc nền\.\nNhạc kiểu gì\?\nKho nhạc/)
    expect(saved()).toHaveLength(2)

    s().discardDirectorPlan()
    expect(s().directorPlan).toBeNull()

    // Mở lại dự án: hội thoại cũ còn; các lượt trước được gửi làm lịch sử.
    s().reset()
    expect(s().directorMessages).toEqual([])
    await s().load(sampleSummary.folder)
    expect(s().directorMessages).toHaveLength(2)
    await s().askDirector('nhạc lofi nhỏ')
    expect(api.directEdits).toHaveBeenLastCalledWith(
      'nhạc lofi nhỏ',
      expect.objectContaining({
        history: [
          expect.objectContaining({ role: 'user', text: 'thêm nhạc nền' }),
          expect.objectContaining({ role: 'ai' }),
        ],
      }),
    )
  })

  it('AI trả lệnh không có câu hỏi thì làm luôn trong một bước hoàn tác; gộp với từ khóa', async () => {
    const s = useEditorStore.getState
    api.directEdits.mockResolvedValueOnce({
      summary: 'Bộ lọc điện ảnh, khung dọc.',
      questions: [],
      commands: [{ kind: 'filter', preset: 'cinematic', intensity: 1 }],
    })
    const result = await s().askDirector('làm đẹp, video dọc 9:16')
    expect(result.applied).toBe(true)
    expect(result.plan.summary).toBe('Bộ lọc điện ảnh, khung dọc.')
    expect(result.report).toEqual([
      { step: 'filter', status: 'done', detail: 1 },
      { step: 'aspect', status: 'done', detail: 1 },
    ])
    expect(s().edit!.look.filter).toBe('cinematic')
    expect(s().edit!.frame).toMatchObject({ aspect: '9:16', fill: true })
    expect(s().directorPlan).toBeNull()
    expect(s().directorMessages.at(-1)).toMatchObject({
      role: 'ai',
      text: 'Bộ lọc điện ảnh, khung dọc.',
    })
    expect(s().past).toHaveLength(1)
    s().undo()
    expect(s().edit!.look.filter).toBe('none')
    expect(s().edit!.frame.aspect).toBe('16:9')
  })

  it('không có AI (lỗi) thì hiểu theo từ khóa; không hiểu thì hỏi lại', async () => {
    const s = useEditorStore.getState
    api.directEdits.mockRejectedValueOnce(new Error('missing_key:anthropic'))
    const ok = await s().askDirector('tốc độ 2x')
    expect(ok.applied).toBe(true)
    expect(s().edit!.clips.every((c) => c.speed === 2)).toBe(true)
    expect(s().directorMessages.at(-1)).toMatchObject({ role: 'ai', text: 'Đã làm 1 việc' })

    const none = await s().askDirector('xin chào')
    expect(none.applied).toBe(false)
    expect(none.plan.commands).toEqual([])
    expect(none.plan.questions).toEqual([
      'Bạn muốn làm gì với video này? Ví dụ: cắt khoảng lặng, thêm phụ đề, nhạc nền, xuất 9:16…',
    ])
    expect(s().directorPlan).toEqual(none.plan)
    expect(s().past).toHaveLength(1)
  })

  it('hỏi trước khi làm: giữ kế hoạch, duyệt thì làm; tùy chọn được lưu', async () => {
    const s = useEditorStore.getState
    s().setAskConfirm(true)
    expect(JSON.parse(localStorage.getItem('lumora.director-prefs')!)).toEqual({ askConfirm: true })
    const result = await s().askDirector('bộ lọc cổ điển')
    expect(result.applied).toBe(false)
    expect(s().directorPlan!.commands).toEqual([
      { kind: 'filter', preset: 'vintage', intensity: 1 },
    ])
    expect(s().edit!.look.filter).toBe('none')
    const report = await s().applyDirectorPlan()
    expect(report).toEqual([{ step: 'filter', status: 'done', detail: 1 }])
    expect(s().edit!.look.filter).toBe('vintage')
    expect(s().directorPlan).toBeNull()
    expect(s().directorMessages.map((m) => m.role)).toEqual(['user', 'ai', 'ai'])
    expect(s().past).toHaveLength(1)
    // Không còn kế hoạch thì không làm gì.
    expect(await s().applyDirectorPlan()).toEqual([])
  })

  it('quy tắc "luôn…" được nhớ, gửi cho AI và quên được; thói quen đã học bổ sung cho lệnh', async () => {
    const s = useEditorStore.getState
    const result = await s().askDirector('Luôn thêm phụ đề')
    expect(result.applied).toBe(true)
    expect(s().memory.rules).toEqual(['Luôn thêm phụ đề'])
    expect(JSON.parse(localStorage.getItem('lumora.ai-memory')!).rules).toEqual([
      'Luôn thêm phụ đề',
    ])
    expect(s().edit!.captions.enabled).toBe(true)
    await s().askDirector('bộ lọc ấm')
    expect(api.directEdits).toHaveBeenLastCalledWith(
      'bộ lọc ấm',
      expect.objectContaining({ memory: expect.stringContaining('Luôn thêm phụ đề') }),
    )
    s().forgetDirectorRule('Luôn thêm phụ đề')
    expect(s().memory.rules).toEqual([])
    expect(JSON.parse(localStorage.getItem('lumora.ai-memory')!).rules).toEqual([])

    // Hay dùng mẫu karaoke: "thêm phụ đề" tự dùng mẫu đó.
    s().rememberDirectorRule('từ nay nhạc nhỏ thôi')
    useEditorStore.setState({
      memory: { ...s().memory, counts: { captionsTemplate: { karaoke: 3, box: 1 } } },
    })
    const captions = await s().askDirector('thêm phụ đề')
    expect(captions.plan.commands.map((c) => c.kind)).toEqual(['captions', 'captionsStyle'])
    expect(s().edit!.captions.look.template).toBe('karaoke')
    expect(api.directEdits).toHaveBeenLastCalledWith(
      'thêm phụ đề',
      expect.objectContaining({ memory: expect.stringContaining('captionsTemplate=karaoke (×3)') }),
    )
  })

  it('học thói quen từ bản chỉnh sửa khi lưu: đếm mỗi dự án một lần, lưu vào máy', async () => {
    const s = useEditorStore.getState
    s().change((e) => ({ ...e, look: { ...e.look, filter: 'warm' } }))
    s().learnFromCurrentEdit()
    const memory = s().memory
    expect(memory.counts).toMatchObject({
      filter: { warm: 1 },
      aspect: { '16:9': 1 },
      autoZoom: { yes: 1 },
    })
    expect(memory.learned).toContain(`${sampleProject.id}|filter|warm`)
    expect(JSON.parse(localStorage.getItem('lumora.ai-memory')!).counts.filter).toEqual({ warm: 1 })
    // Lưu lại mà không đổi gì: không đếm thêm.
    s().learnFromCurrentEdit()
    expect(s().memory).toBe(memory)
    // Đổi bộ lọc: đếm lựa chọn mới.
    s().change((e) => ({ ...e, look: { ...e.look, filter: 'cold' } }))
    s().learnFromCurrentEdit()
    expect(s().memory.counts.filter).toEqual({ warm: 1, cold: 1 })
  })
})

describe('lệnh AI 1.8.0: che vùng, tự giảm nhạc, hiện phím tắt', () => {
  it('blur thêm vùng che đúng chỗ / đúng lúc; duck và showKeys đổi cài đặt', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([
      { kind: 'blur', mode: 'pixelate', atMs: 1000, ms: 2000, x: 0.25, y: 0.75, size: 0.4 },
      { kind: 'duck', enabled: true, level: 0.2 },
      { kind: 'cursor', showKeys: true },
    ])
    expect(report.map((r) => [r.step, r.status])).toEqual([
      ['blur', 'done'],
      ['duck', 'done'],
      ['cursor', 'done'],
    ])
    const edit = s().edit!
    expect(edit.overlays).toHaveLength(1)
    expect(edit.overlays[0]).toMatchObject({
      kind: 'blur',
      blurMode: 'pixelate',
      start: 1000,
      end: 3000,
      x: 0.25,
      y: 0.75,
      size: 0.4,
    })
    expect(edit.audio.duck).toEqual({ enabled: true, level: 0.2 })
    expect(edit.cursor.showKeys).toBe(true)
    // Một bước hoàn tác cho cả ba lệnh.
    s().undo()
    expect(s().edit!.overlays).toEqual([])
    expect(s().edit!.audio.duck.enabled).toBe(false)
  })
})

describe('lệnh AI 1.9.0: công thức dựng, hiệu ứng / tốc độ / chuyển cảnh theo thời điểm, kiểu phụ đề, thẻ kết', () => {
  it('effectAt, captionsLook, outro, export enhance; outro luôn bám cuối video', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([
      { kind: 'effectAt', effect: 'flash', atMs: 1000, ms: 1500, intensity: 0.9 },
      { kind: 'captionsLook', font: 'anton', uppercase: true, maxWords: 3, style: 'classic' },
      { kind: 'outro', text: 'Đăng ký kênh', ms: 2000, template: 'title' },
      { kind: 'export', resolution: 1080, format: 'mp4', enhance: true },
    ])
    expect(report.map((r) => [r.step, r.status])).toEqual([
      ['effectAt', 'done'],
      ['captionsLook', 'done'],
      ['outro', 'done'],
      ['export', 'done'],
    ])
    const edit = s().edit!
    expect(edit.effects).toHaveLength(1)
    expect(edit.effects[0]).toMatchObject({ kind: 'flash', start: 1000, end: 2500, intensity: 0.9 })
    expect(edit.captions.style).toBe('classic')
    expect(edit.captions.look).toMatchObject({ font: 'anton', uppercase: true, maxWords: 3 })
    expect(edit.overlays).toHaveLength(1)
    expect(edit.overlays[0]).toMatchObject({
      kind: 'text',
      text: 'Đăng ký kênh',
      start: 5000,
      end: 7000,
      y: 0.5,
    })
    expect(edit.export.enhance).toBe(true)
    // Một bước hoàn tác.
    s().undo()
    expect(s().edit!.effects).toEqual([])
    expect(s().edit!.overlays).toEqual([])
    expect(s().edit!.export.enhance).toBe(false)
  })

  it('speedRange tách clip ở hai đầu và tăng tốc đoạn giữa; speedCurve áp mẫu cho clip chứa atMs', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([
      { kind: 'speedRange', fromMs: 1000, toMs: 3000, factor: 2 },
      { kind: 'speedRange', fromMs: 6900, toMs: 6950, factor: 2 },
    ])
    expect(report.map((r) => [r.step, r.status, r.detail])).toEqual([
      ['speedRange', 'done', 1],
      ['speedRange', 'skipped', 'too_short'],
    ])
    // Clip 0-5 s tách thành 0-1, 1-3 (2×), 3-5; video ngắn đi 1 giây.
    expect(s().edit!.clips.map((c) => c.speed)).toEqual([1, 2, 1, 1])
    expect(outputDuration(s().edit!.clips)).toBe(6000)
    const curve = await s().applyAssistantCommands([
      { kind: 'speedCurve', preset: 'hero', atMs: 0 },
    ])
    expect(curve).toEqual([{ step: 'speedCurve', status: 'done', detail: 1 }])
    expect(s().edit!.clips[0]!.speedCurve?.preset).toBe('hero')
    expect(outputDuration(s().edit!.clips)).toBeLessThan(6000)
  })

  it('transitionAt chọn chỗ nối gần nhất (trong 1,5 s), không có thì bỏ qua; transitions nhận độ dài', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([
      { kind: 'transitionAt', atMs: 4800, transition: 'slide', ms: 400 },
      { kind: 'transitionAt', atMs: 1000, transition: 'zoom', ms: 300 },
    ])
    expect(report.map((r) => [r.step, r.status])).toEqual([
      ['transitionAt', 'done'],
      ['transitionAt', 'skipped'],
    ])
    expect(s().edit!.transitions).toEqual([
      { afterClip: s().edit!.clips[0]!.id, kind: 'slide', durationMs: 400 },
    ])
    await s().applyAssistantCommands([{ kind: 'transitions', transition: 'zoom', ms: 250 }])
    expect(s().edit!.transitions).toEqual([
      { afterClip: s().edit!.clips[0]!.id, kind: 'zoom', durationMs: 250 },
    ])
  })

  it('recipe mở rộng thành lệnh cụ thể (lệnh nêu rõ thắng), không có dòng "recipe" trong báo cáo', async () => {
    const s = useEditorStore.getState
    const report = await s().applyAssistantCommands([
      { kind: 'recipe', style: 'clean' },
      { kind: 'captionsStyle', template: 'neon' },
    ])
    const steps = report.map((r) => r.step)
    expect(steps).not.toContain('recipe')
    expect(steps).toEqual(expect.arrayContaining(['captionsStyle', 'captionsLook', 'frame']))
    expect(report.filter((r) => r.step === 'captionsStyle')).toHaveLength(1)
    const edit = s().edit!
    expect(edit.captions.look.template).toBe('neon')
    expect(edit.captions.style).toBe('classic')
    expect(edit.frame.padding).toBe(0.04)
  })

  it('askDirector gửi lời thoại có mốc, thời điểm bấm chuột và tóm tắt bản dựng cho AI', async () => {
    const s = useEditorStore.getState
    s().setTranscript(sampleTranscript)
    api.directEdits.mockResolvedValueOnce({ summary: 'Không làm gì.', questions: [], commands: [] })
    await s().askDirector('dựng kiểu youtube')
    expect(api.directEdits).toHaveBeenCalledWith(
      'dựng kiểu youtube',
      expect.objectContaining({
        hasTranscript: true,
        transcript: '[0:00.0] Xin chào ừm các bạn.\n[0:04.1] Hôm nay',
        // Bấm chuột lúc 1,5 s sau khi bắt đầu quay.
        clicks: [1500],
        edit: expect.stringContaining('duration 7 s; 2 clip(s), 1 cut(s)'),
      }),
    )
    // Không có AI trả lệnh: công thức theo từ khóa vẫn chạy (video 7 s, không có nhạc → không chương, không nhạc).
    const plan = s().directorPlan
    expect(plan).toBeNull()
    expect(s().edit!.captions.look.template).toBe('box')
    expect(s().edit!.cursor.showKeys).toBe(true)
    expect(s().edit!.audioClips).toEqual([])
  })
})

describe('tự dựng một nút 1.12.0', () => {
  const s = useEditorStore.getState

  it('findMusic: tải bài Jamendo vào kho, chèn làm nhạc nền đúng âm lượng và bật tự giảm khi nói', async () => {
    const report = await s().applyAssistantCommands([
      { kind: 'findMusic', mood: 'upbeat corporate', tempo: 'fast', volume: 0.2 },
    ])
    expect(report).toEqual([{ step: 'findMusic', status: 'done', detail: 1 }])
    expect(api.findMusic).toHaveBeenCalledWith({
      mood: 'upbeat corporate',
      tempo: 'fast',
      durationMs: 7000,
    })
    const music = s().edit!.audioClips.filter((a) => a.kind === 'music')
    expect(music).toHaveLength(1)
    expect(music[0]).toMatchObject({ name: 'Found upbeat corporate – Artist', volume: 0.2 })
    expect(s().edit!.audio.duck.enabled).toBe(true)
  })

  it('findMusic không có key Jamendo: dùng kho nhạc; kho trống thì bỏ qua với lý do no_music_key', async () => {
    api.findMusic.mockRejectedValue(new Error('key_missing'))
    api.listMusic.mockResolvedValueOnce([])
    expect(
      await s().applyAssistantCommands([
        { kind: 'findMusic', mood: 'calm', tempo: 'slow', volume: 0.25 },
      ]),
    ).toEqual([{ step: 'findMusic', status: 'skipped', detail: 'no_music_key' }])
    await api.addMusicPaths(['C:\\nhac\\Kho của tôi.mp3'], 'file')
    expect(
      await s().applyAssistantCommands([
        { kind: 'findMusic', mood: 'calm', tempo: 'slow', volume: 0.25 },
      ]),
    ).toEqual([{ step: 'findMusic', status: 'done', detail: 1 }])
    expect(s().edit!.audioClips[0]!.name).toBe('Kho của tôi')
  })

  it('broll: tìm video Pixabay, tải về, phủ kín khung tại thời điểm, tắt tiếng; thiếu key thì bỏ qua', async () => {
    const report = await s().applyAssistantCommands([
      { kind: 'broll', query: 'typing on laptop', atMs: 1000, ms: 3000 },
      { kind: 'broll', query: 'city', atMs: 9000, ms: 3000 },
    ])
    expect(report).toEqual([
      { step: 'broll', status: 'done', detail: 1 },
      { step: 'broll', status: 'skipped', detail: 'too_short' },
    ])
    expect(api.onlineSearch).toHaveBeenCalledWith('pixabayVideo', 'typing on laptop', null)
    expect(api.onlineDownload).toHaveBeenCalledWith('pixabay', '0')
    const o = s().edit!.overlays.find((x) => x.kind === 'video')!
    // Lớp dài bằng tư liệu (2,5 giây) khi tư liệu ngắn hơn yêu cầu; cỡ ≥ 1 để phủ kín khung; không tiếng.
    expect(o).toMatchObject({ start: 1000, end: 3500, x: 0.5, y: 0.5, volume: 0 })
    expect(o.size).toBeGreaterThanOrEqual(1)
    api.onlineSearch.mockRejectedValueOnce(new Error('key_missing'))
    expect(
      await s().applyAssistantCommands([{ kind: 'broll', query: 'x', atMs: 0, ms: 2000 }]),
    ).toEqual([{ step: 'broll', status: 'skipped', detail: 'no_pixabay_key' }])
  })

  it('shorts highlights: AI chọn đoạn, mỗi đoạn thành dự án dọc có hook và phụ đề TikTok; đoạn ngoài video bỏ', async () => {
    const made = await s().splitIntoShorts({ mode: 'highlights', count: 3, vertical: true })
    // Video mẫu 7 giây: đoạn 0-20 s kẹp còn 7 s (đủ 5 s), hai đoạn sau nằm ngoài video.
    expect(made).toBe(1)
    expect(api.transcribe).toHaveBeenCalled()
    expect(api.highlights).toHaveBeenCalledWith(sampleSummary.folder, 3)
    expect(api.duplicateProject).toHaveBeenCalledWith(sampleSummary.folder, '(short 1: Mở đầu)')
    const saved = api.saveEdit.mock.calls.at(-1)![1]
    expect(saved.frame).toMatchObject({ aspect: '9:16', fill: true })
    expect(saved.captions.look.template).toBe('tiktok')
    expect(saved.overlays).toHaveLength(1)
    expect(saved.overlays[0]).toMatchObject({ kind: 'text', text: 'Mẹo 1', start: 0, end: 2500 })
    expect(saved.audioClips).toEqual([])
  })

  it('autoBuild với AI: một lần gọi đạo diễn (không gửi hội thoại), áp kế hoạch, rà soát lấp chỗ thiếu, một bước hoàn tác, ghi nguồn nhạc', async () => {
    api.directEdits.mockResolvedValueOnce({
      summary: 'Dựng kiểu YouTube hoàn chỉnh',
      questions: [],
      commands: [
        { kind: 'recipe', style: 'youtube' },
        {
          kind: 'text',
          text: 'Mẹo Excel 30 giây',
          atMs: 0,
          ms: 2000,
          template: 'title',
          position: 'top',
        },
        { kind: 'findMusic', mood: 'calm corporate', tempo: 'medium', volume: 0.2 },
        { kind: 'export', resolution: 1080, format: 'mp4', fps: 30 },
      ],
    })
    const steps: string[] = []
    const r = await s().autoBuild({ format: 'youtube' }, (_d, _t, step) => steps.push(step))
    expect(steps).toEqual(['prepare', 'plan', 'apply', 'review'])
    expect(r.ai).toBe(true)
    expect(r.format).toBe('youtube')
    expect(api.directEdits).toHaveBeenCalledTimes(1)
    const [goal, context] = api.directEdits.mock.calls[0]!
    expect(goal).toContain('AUTO BUILD. Format: youtube.')
    expect(context.history).toEqual([])
    expect(context.transcript).toContain('[0:00.0]')
    // Không xuất trong lúc tự dựng; nhạc đã chèn và tự giảm; rà soát không còn gì thiếu (video 7 s
    // quá ngắn cho thẻ kết).
    expect(r.commands.map((c) => c.kind)).not.toContain('export')
    expect(r.commands.map((c) => c.kind)).toContain('findMusic')
    expect(r.review.fixes).toEqual([])
    expect(r.review.issues).toEqual([])
    expect(r.review.passed).toEqual(
      expect.arrayContaining(['aspect', 'captions', 'music', 'duck', 'hook', 'cleanAudio']),
    )
    expect(r.report.find((x) => x.step === 'findMusic')).toMatchObject({ status: 'done' })
    expect(r.report.find((x) => x.step === 'captions')).toMatchObject({ status: 'done' })
    expect(r.credits).toEqual(['"Found calm corporate" by Artist — CC BY 3.0 (Jamendo)'])
    expect(r.shorts).toBe(0)
    const edit = s().edit!
    expect(edit.audio.duck.enabled).toBe(true)
    expect(edit.audioClips.filter((a) => a.kind === 'music')).toHaveLength(1)
    expect(edit.overlays.filter((o) => o.kind === 'text').map((o) => o.text)).toEqual([
      'Mẹo Excel 30 giây',
    ])
    expect(edit.captions.enabled).toBe(true)
    // Một bước hoàn tác, lịch sử đạo diễn ghi lại.
    expect(s().past).toHaveLength(1)
    expect(s().directorBusy).toBe(false)
    expect(s().directorMessages.map((m) => m.role)).toEqual(['user', 'ai'])
    expect(s().directorMessages[1]!.text).toBe('Dựng kiểu YouTube hoàn chỉnh')
    s().undo()
    expect(s().edit!.audioClips).toEqual([])
    expect(s().edit!.overlays).toEqual([])
  })

  it('autoBuild không có AI: công thức có sẵn theo định dạng tự chọn; tắt nhạc thì không tìm nhạc; shorts bị bỏ vì video ngắn', async () => {
    api.directEdits.mockRejectedValueOnce(new Error('missing_key:anthropic'))
    const r = await s().autoBuild({ format: 'auto', music: false, shorts: true, shortsCount: 2 })
    expect(r.ai).toBe(false)
    // 7 giây, có chuột → shorts.
    expect(r.format).toBe('shorts')
    // Hook mở đầu lấy từ câu nói đầu tiên khi không có AI.
    expect(r.commands.map((c) => c.kind)).toEqual(['recipe', 'outro', 'text'])
    expect(r.commands[2]).toMatchObject({ text: 'Xin chào ừm các bạn. Hôm nay', atMs: 0 })
    expect(r.report.find((x) => x.step === 'audio')).toMatchObject({ status: 'done' })
    expect(r.report.find((x) => x.step === 'outro')).toMatchObject({ status: 'done' })
    expect(s().edit!.overlays.map((o) => o.text)).toEqual([
      'Đăng ký kênh để xem thêm',
      'Xin chào ừm các bạn. Hôm nay',
    ])
    expect(r.commands.some((c) => c.kind === 'findMusic' || c.kind === 'music')).toBe(false)
    expect(api.findMusic).not.toHaveBeenCalled()
    expect(r.report.at(-1)).toEqual({ step: 'shorts', status: 'skipped', detail: 'too_short' })
    expect(r.review.issues).toEqual([])
    expect(s().edit!.frame.aspect).toBe('9:16')
    expect(s().edit!.captions.look.template).toBe('tiktok')
  })
})
