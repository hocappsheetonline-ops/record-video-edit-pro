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
import { createFakeApi, sampleProject, sampleSummary } from '../test/fake-api'
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

    s().applyTransitionToAll('zoom', 800)
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
