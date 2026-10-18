import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_KINDS,
  EFFECT_INFO,
  EFFECT_KINDS,
  TRANSITION_INFO,
  TRANSITION_KINDS,
  type DirectorContext,
} from '@lumora/core'
import {
  ASSISTANT_SCHEMA,
  assistantSystem,
  DIRECTOR_SCHEMA,
  directorSystem,
  EDITING_PLAYBOOK,
} from './claude'

const base: DirectorContext = {
  language: 'vi',
  durationMs: 65_000,
  hasTranscript: true,
  hasCursor: true,
  musicTracks: ['Lofi Chill'],
  projects: ['Khóa học Excel'],
  memory: 'Quy tắc người dùng:\n- luôn dùng phụ đề karaoke',
  history: [{ role: 'user', text: 'thêm phụ đề', at: 1 }],
  transcript: '[0:00.0] Xin chào các bạn\n[0:03.5] Hôm nay mình hướng dẫn',
  clicks: [1500, 4200],
  edit: 'duration 65 s; 1 clip(s), 0 cut(s); captions off',
}

describe('lời nhắc đạo diễn AI (1.9.0)', () => {
  it('mọi loại lệnh đều có trong schema và trong hướng dẫn lệnh của cả trợ lý và đạo diễn', () => {
    const items = (
      DIRECTOR_SCHEMA.properties as {
        commands: { items: { properties: { kind: { enum: string[] } } } }
      }
    ).commands.items.properties.kind.enum
    expect([...items].sort()).toEqual([...ASSISTANT_KINDS].sort())
    const assistant = assistantSystem({ language: 'vi', durationMs: 1000, hasTranscript: false })
    const director = directorSystem(base)
    for (const kind of ASSISTANT_KINDS) {
      // Mỗi lệnh được giới thiệu dạng "kind:" hoặc "kind {tham số}".
      const mention = new RegExp(`(^|[\\s/])${kind}[: {]`, 'm')
      expect(assistant, kind).toMatch(mention)
      expect(director, kind).toMatch(mention)
    }
    expect(
      (
        ASSISTANT_SCHEMA.properties as {
          commands: { items: { properties: { kind: { enum: string[] } } } }
        }
      ).commands.items.properties.kind.enum,
    ).toEqual([...ASSISTANT_KINDS])
  })

  it('thư viện hiệu ứng và chuyển cảnh: mọi tên có trong schema và được mô tả trong lời nhắc', () => {
    const props = DIRECTOR_SCHEMA.properties as {
      commands: {
        items: { properties: { effect: { enum: string[] }; transition: { enum: string[] } } }
      }
    }
    expect(props.commands.items.properties.effect.enum).toEqual([...EFFECT_KINDS])
    expect(props.commands.items.properties.transition.enum).toEqual([...TRANSITION_KINDS])
    const director = directorSystem(base)
    for (const kind of EFFECT_KINDS) expect(director).toContain(`${kind}: ${EFFECT_INFO[kind]}`)
    for (const kind of TRANSITION_KINDS)
      expect(director).toContain(`${kind}: ${TRANSITION_INFO[kind]}`)
  })

  it('đạo diễn nhận sổ tay dựng chuyên nghiệp và ngữ cảnh thời gian thật', () => {
    const system = directorSystem(base)
    expect(system).toContain('AI director')
    expect(system).toContain(EDITING_PLAYBOOK)
    expect(EDITING_PLAYBOOK).toMatch(/Hook \(first 3-5 s\)/)
    expect(EDITING_PLAYBOOK).toMatch(/every 10-20 s/)
    expect(EDITING_PLAYBOOK).toMatch(/-14 LUFS/)
    expect(EDITING_PLAYBOOK).toMatch(/outro/)
    expect(system).toContain('[0:03.5] Hôm nay mình hướng dẫn')
    expect(system).toContain('1.5 s, 4.2 s')
    expect(system).toContain('Current edit: duration 65 s')
    expect(system).toContain('- Lofi Chill')
    expect(system).toContain('- Khóa học Excel')
    expect(system).toContain('luôn dùng phụ đề karaoke')
    expect(system).toContain('User: thêm phụ đề')
    expect(system).toContain('recipe {style}')
    expect(system).toContain('Vietnamese')
  })

  it('thiếu lời thoại / chuột / bản dựng thì ghi rõ thay vì để trống', () => {
    const system = directorSystem({
      ...base,
      hasTranscript: false,
      hasCursor: false,
      transcript: undefined,
      clicks: undefined,
      edit: undefined,
      musicTracks: [],
      history: [],
    })
    expect(system).toContain('not available yet')
    expect(system).toContain('autoZoom will do nothing')
    expect(system).toContain('(fresh recording, nothing edited yet)')
    expect(system).toMatch(/timestamps[^\n]*\n\(none\)/)
    expect(system).toMatch(/click times[^\n]*\n\(none\)/)
    expect(system).toContain('(empty)')
  })
})

describe('tự dựng một nút 1.12.0: lời nhắc tách để cache, lệnh mới, chọn highlights', async () => {
  const { directorPrompt, HIGHLIGHTS_SCHEMA, highlightsSystem, systemBlocks, systemText } =
    await import('./claude')

  it('phần tĩnh (tập lệnh + sổ tay) không chứa gì của video và giống hệt nhau giữa hai video', () => {
    const a = directorPrompt(base)
    const b = directorPrompt({
      ...base,
      language: 'en',
      durationMs: 5000,
      transcript: '[0:00.0] Hello',
      musicTracks: [],
      memory: '',
      history: [],
    })
    expect(a.static).toBe(b.static)
    expect(a.static).toContain('AI director')
    expect(a.static).toContain(EDITING_PLAYBOOK)
    expect(a.static).not.toContain('Lofi Chill')
    expect(a.static).not.toContain('Hôm nay mình hướng dẫn')
    expect(a.dynamic).toContain('User language: Vietnamese')
    expect(a.dynamic).toContain('[0:03.5] Hôm nay mình hướng dẫn')
    expect(a.dynamic).toContain('Lofi Chill')
    expect(b.dynamic).toContain('User language: English')
    // Phần tĩnh đủ dài để Claude cache (ngưỡng 1024 token ≈ 4 000 ký tự).
    expect(a.static.length).toBeGreaterThan(8000)
    expect(systemText(a)).toBe(`${a.static}\n\n${a.dynamic}`)
    expect(directorSystem(base)).toBe(systemText(a))
    expect(systemBlocks(a)).toEqual([
      { type: 'text', text: a.static, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: a.dynamic },
    ])
    expect(systemBlocks('plain')).toBe('plain')
  })

  it('hướng dẫn lệnh có findMusic, broll, shorts highlights và mục AUTO BUILD trong sổ tay', () => {
    const { static: s } = directorPrompt(base)
    expect(s).toContain('findMusic {mood, tempo, volume}')
    expect(s).toContain('broll {query, atMs, ms}')
    expect(s).toContain('highlights = AI picks')
    expect(EDITING_PLAYBOOK).toContain('12. AUTO BUILD')
    const props = (
      DIRECTOR_SCHEMA.properties as {
        commands: { items: { properties: Record<string, { enum?: string[] }> } }
      }
    ).commands.items.properties
    expect(props.mood).toBeDefined()
    expect(props.tempo!.enum).toEqual(['slow', 'medium', 'fast'])
    expect(props.mode!.enum).toContain('highlights')
    expect(props.count).toBeDefined()
  })

  it('lời nhắc chọn đoạn hay: số đoạn, độ dài, hook theo ngôn ngữ; schema đủ trường', () => {
    const s = highlightsSystem('vi', 3)
    expect(s).toContain('up to 3 self-contained segments')
    expect(s).toContain('hook: a 3-8 word line in Vietnamese')
    expect(
      (HIGHLIGHTS_SCHEMA.properties as { segments: { items: { required: string[] } } }).segments
        .items.required,
    ).toEqual(['start_seconds', 'end_seconds', 'hook', 'title'])
  })
})
