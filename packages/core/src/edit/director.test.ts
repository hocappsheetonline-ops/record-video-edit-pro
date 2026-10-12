import { describe, expect, it } from 'vitest'
import { parseAssistantRequest } from './assistant'
import {
  EMPTY_MEMORY,
  forgetRule,
  isStandingRule,
  learnFromEdit,
  memorySummary,
  normalizeDirectorPlan,
  planLocally,
  rememberRule,
  topChoice,
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
