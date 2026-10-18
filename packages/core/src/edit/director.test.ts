import { describe, expect, it } from 'vitest'
import { parseAssistantRequest } from './assistant'
import {
  editSummary,
  EMPTY_MEMORY,
  expandRecipe,
  expandRecipes,
  forgetRule,
  isStandingRule,
  learnFromEdit,
  memorySummary,
  normalizeDirectorPlan,
  outputClicks,
  planLocally,
  rememberRule,
  topChoice,
  transcriptExcerpt,
} from './director'
import { createDefaultEdit, type EditState } from './edit-state'
import type { Project } from '../project'

const project: Project = {
  version: 1,
  id: 'p',
  name: 'p',
  createdAt: '',
  source: {
    kind: 'display',
    name: 'd',
    captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  },
  engine: 'ffmpeg',
  encoder: 'x264',
  fps: 30,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 0,
      endedAt: 10_000,
      tracks: { screen: { file: 's.mkv', startedAt: 0 } },
    },
  ],
  hasEvents: false,
  inputMode: 'hook',
  durationMs: 10_000,
}

describe('parseAssistantRequest (lệnh mở rộng)', () => {
  it('hiệu ứng, chuyển cảnh, nhạc nền, mẫu phụ đề, xuất', () => {
    const cmds = parseAssistantRequest(
      'Thêm hiệu ứng glitch, chuyển cảnh lóe sáng, nhạc nền lofi nhỏ, phụ đề kiểu TikTok rồi xuất 4K',
    )
    expect(cmds).toEqual([
      { kind: 'captions' },
      { kind: 'effect', effect: 'glitch' },
      { kind: 'transitions', transition: 'flash' },
      { kind: 'music', query: 'lofi', volume: 0.25 },
      { kind: 'captionsStyle', template: 'tiktok' },
      { kind: 'export', resolution: 2160, format: 'mp4' },
    ])
    expect(parseAssistantRequest('export as gif 720p')).toEqual([
      { kind: 'export', resolution: 720, format: 'gif' },
    ])
  })
})

describe('Đạo diễn AI: kế hoạch và trí nhớ', () => {
  it('normalizeDirectorPlan: tối đa 2 câu hỏi, lệnh được kiểm tra', () => {
    expect(
      normalizeDirectorPlan({
        summary: ' Cắt và phụ đề ',
        questions: ['A?', '', 'B?', 'C?'],
        commands: [{ kind: 'captions' }, { kind: 'nope' }],
      }),
    ).toEqual({
      summary: 'Cắt và phụ đề',
      questions: ['A?', 'B?'],
      commands: [{ kind: 'captions' }],
    })
    expect(normalizeDirectorPlan(null)).toEqual({ summary: '', questions: [], commands: [] })
  })

  it('học từ bản chỉnh sửa: đếm mẫu phụ đề, bộ lọc, khung, nhạc; mỗi dự án đếm một lần', () => {
    const edit: EditState = {
      ...createDefaultEdit(project),
      look: { ...createDefaultEdit(project).look, filter: 'cinematic' },
      frame: { ...createDefaultEdit(project).frame, aspect: '9:16' },
      captions: {
        ...createDefaultEdit(project).captions,
        enabled: true,
        lines: [{ id: 'l', start: 0, end: 1, text: 'a', words: [], edited: false }],
        look: { ...createDefaultEdit(project).captions.look, template: 'tiktok' },
      },
      audioClips: [
        {
          id: 'a',
          file: 'm.mp3',
          name: 'm',
          kind: 'music',
          start: 0,
          offset: 0,
          duration: 1000,
          sourceDuration: 1000,
          volume: 0.3,
          fadeIn: 0,
          fadeOut: 0,
          loop: true,
        },
      ],
    }
    let m = learnFromEdit(EMPTY_MEMORY, 'p1', edit, 5)
    m = learnFromEdit(m, 'p1', edit, 6)
    m = learnFromEdit(m, 'p2', edit, 7)
    expect(m.counts.captionsTemplate).toEqual({ tiktok: 2 })
    expect(m.counts.filter).toEqual({ cinematic: 2 })
    expect(m.counts.aspect).toEqual({ '9:16': 2 })
    expect(m.counts.musicVolume).toEqual({ '0.3': 2 })
    expect(topChoice(m, 'captionsTemplate')).toBe('tiktok')
    expect(topChoice(m, 'nothing')).toBeNull()
    expect(memorySummary(m)).toContain('captionsTemplate=tiktok (×2)')
    // Quy tắc dặn: thêm, không trùng, xóa.
    m = rememberRule(m, 'Luôn thêm nhạc nền nhỏ')
    m = rememberRule(m, 'luôn thêm nhạc nền nhỏ')
    expect(m.rules).toEqual(['Luôn thêm nhạc nền nhỏ'])
    expect(memorySummary(m)).toContain('Quy tắc người dùng')
    expect(forgetRule(m, 'Luôn thêm nhạc nền nhỏ').rules).toEqual([])
    expect(isStandingRule('Luôn dùng phụ đề TikTok')).toBe(true)
    expect(isStandingRule('thêm phụ đề')).toBe(false)
  })

  it('planLocally: dùng thói quen (mẫu phụ đề, âm lượng nhạc), hỏi khi kho nhạc trống', () => {
    let m = rememberRule(EMPTY_MEMORY, 'x')
    m = { ...m, counts: { captionsTemplate: { karaoke: 3 }, musicVolume: { '0.2': 2 } } }
    const plan = planLocally(
      [{ kind: 'captions' }, { kind: 'music', query: '', volume: 0.4 }],
      { musicTracks: ['Sunny Day'] },
      m,
    )
    expect(plan.questions).toEqual([])
    expect(plan.commands).toEqual([
      { kind: 'captions' },
      { kind: 'music', query: '', volume: 0.2 },
      { kind: 'captionsStyle', template: 'karaoke' },
    ])
    const empty = planLocally(
      [{ kind: 'music', query: 'lofi', volume: 0.4 }],
      { musicTracks: [] },
      m,
    )
    expect(empty.questions).toHaveLength(1)
  })
})

describe('dựng chuyên nghiệp 1.9.0: công thức, lời thoại có mốc, thời điểm bấm, tóm tắt bản dựng', () => {
  it('expandRecipe: youtube / shorts / vlog / clean ra lệnh đúng phong cách, tùy chuột và kho nhạc', () => {
    const youtube = expandRecipe('youtube', { hasCursor: true, hasMusic: true, durationMs: 90_000 })
    const kinds = youtube.map((c) => c.kind)
    expect(kinds).toEqual([
      'aspect',
      'cutSilences',
      'removeFillers',
      'cleanAudio',
      'autoZoom',
      'motion',
      'cursor',
      'captions',
      'captionsStyle',
      'captionsLayout',
      'music',
      'duck',
      'fade',
      'chapters',
    ])
    expect(youtube).toContainEqual({ kind: 'captionsStyle', template: 'box' })
    // Không có chuột, kho nhạc trống, video ngắn: bỏ zoom, nhạc và chương.
    const bare = expandRecipe('youtube', { hasCursor: false, hasMusic: false, durationMs: 30_000 })
    expect(bare.map((c) => c.kind)).not.toEqual(
      expect.arrayContaining(['autoZoom', 'music', 'duck', 'chapters']),
    )
    const shorts = expandRecipe('shorts', { hasCursor: true, hasMusic: true, durationMs: 40_000 })
    expect(shorts).toContainEqual({ kind: 'aspect', aspect: '9:16' })
    expect(shorts).toContainEqual({ kind: 'captionsStyle', template: 'tiktok' })
    expect(shorts).toContainEqual({ kind: 'transitions', transition: 'zoom', ms: 300 })
    expect(shorts).toContainEqual({ kind: 'duck', enabled: true, level: 0.2 })
    expect(
      expandRecipe('vlog', { hasCursor: true, hasMusic: false, durationMs: 1 }),
    ).toContainEqual({
      kind: 'filter',
      preset: 'warm',
      intensity: 0.6,
    })
    expect(
      expandRecipe('clean', { hasCursor: true, hasMusic: true, durationMs: 1 }),
    ).toContainEqual({ kind: 'captionsLook', style: 'classic' })
  })

  it('expandRecipes: lệnh nêu rõ thắng lệnh cùng loại của công thức; không có recipe thì giữ nguyên', () => {
    const ctx = { hasCursor: true, hasMusic: true, durationMs: 10_000 }
    const plain = [{ kind: 'captions' } as const]
    expect(expandRecipes(plain, ctx)).toBe(plain)
    const out = expandRecipes(
      [
        { kind: 'recipe', style: 'youtube' },
        { kind: 'captionsStyle', template: 'neon' },
        { kind: 'music', query: 'lofi', volume: 0.1 },
      ],
      ctx,
    )
    expect(out.filter((c) => c.kind === 'recipe')).toEqual([])
    expect(out.filter((c) => c.kind === 'captionsStyle')).toEqual([
      { kind: 'captionsStyle', template: 'neon' },
    ])
    expect(out.filter((c) => c.kind === 'music')).toEqual([
      { kind: 'music', query: 'lofi', volume: 0.1 },
    ])
    expect(out).toContainEqual({ kind: 'cutSilences' })
  })

  it('planLocally mở rộng công thức và vẫn áp thói quen; keyword "kiểu youtube" đi tới công thức', () => {
    const memory = { ...EMPTY_MEMORY, counts: { captionsTemplate: { karaoke: 3 } } }
    const plan = planLocally(
      parseAssistantRequest('dựng kiểu youtube'),
      { musicTracks: [], hasCursor: false, durationMs: 20_000 },
      memory,
    )
    expect(plan.questions).toEqual([])
    const kinds = plan.commands.map((c) => c.kind)
    expect(kinds).toContain('cutSilences')
    expect(kinds).not.toContain('recipe')
    expect(kinds).not.toContain('music')
    // Công thức đã chọn mẫu phụ đề nên thói quen không chèn thêm.
    expect(plan.commands.filter((c) => c.kind === 'captionsStyle')).toEqual([
      { kind: 'captionsStyle', template: 'box' },
    ])
  })

  it('transcriptExcerpt: dòng có mốc trên video xuất, bỏ phần đã cắt, cắt bớt khi quá dài', () => {
    const words = [
      { text: 'Xin', start: 0, end: 300 },
      { text: 'chào', start: 350, end: 700 },
      { text: 'các', start: 1100, end: 1300 },
      { text: 'bạn.', start: 1350, end: 1700 },
      { text: 'Hôm', start: 4100, end: 4300 },
      { text: 'nay', start: 4350, end: 4600 },
    ]
    const clips = [
      { id: 'a', sourceStart: 0, sourceEnd: 2000, speed: 1 },
      { id: 'b', sourceStart: 4000, sourceEnd: 6000, speed: 1 },
    ]
    expect(transcriptExcerpt(words, clips)).toBe('[0:00.0] Xin chào các bạn.\n[0:02.1] Hôm nay')
    expect(transcriptExcerpt(words, clips, { maxLines: 1 })).toBe('[0:00.0] Xin chào các bạn.\n…')
    expect(transcriptExcerpt([], clips)).toBe('')
    // Lời trong phần đã cắt không xuất hiện.
    expect(transcriptExcerpt(words, [clips[0]!])).toBe('[0:00.0] Xin chào các bạn.')
  })

  it('outputClicks: đổi sang thời gian xuất, gộp lần bấm sát nhau, bỏ lần bấm trong phần đã cắt', () => {
    const clips = [{ id: 'b', sourceStart: 4000, sourceEnd: 6000, speed: 1 }]
    const clicks = [
      { s: 500, x: 0, y: 0, button: 'left' as const },
      { s: 4500, x: 0, y: 0, button: 'left' as const },
      { s: 4700, x: 0, y: 0, button: 'left' as const },
      { s: 5500, x: 0, y: 0, button: 'left' as const },
    ]
    expect(outputClicks(clicks, clips)).toEqual([500, 1500])
    expect(outputClicks(clicks, clips, { max: 1 })).toEqual([500])
  })

  it('editSummary: một dòng tiếng Anh về bản dựng', () => {
    const edit = createDefaultEdit(project)
    expect(editSummary(edit)).toBe(
      'duration 10 s; 1 clip(s), 0 cut(s); aspect 16:9; 0 zoom(s); 0 transition(s); 0 effect(s); 0 overlay(s); 0 music track(s), 0 sound effect(s); captions off',
    )
    const rich: EditState = {
      ...edit,
      look: { ...edit.look, filter: 'warm' },
      markers: [{ id: 'm', t: 1000, label: 'x', color: '#f59e0b' }],
      audio: { ...edit.audio, duck: { enabled: true, level: 0.3 } },
    }
    expect(editSummary(rich)).toContain('filter warm; 1 marker(s); music ducking on')
  })
})
