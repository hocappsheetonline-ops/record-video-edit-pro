import { describe, expect, it } from 'vitest'
import { ASSISTANT_KINDS, type DirectorContext } from '@lumora/core'
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
