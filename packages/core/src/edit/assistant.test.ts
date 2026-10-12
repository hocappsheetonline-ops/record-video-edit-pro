import { describe, expect, it } from 'vitest'
import { normalizeAssistantCommands, parseAssistantRequest } from './assistant'

describe('parseAssistantRequest', () => {
  it('hiểu yêu cầu tiếng Việt nhiều lệnh một lúc', () => {
    expect(
      parseAssistantRequest(
        'Cắt khoảng lặng, bỏ từ thừa, thêm phụ đề, bộ lọc cổ điển, tốc độ 1,5x, làm video dọc 9:16, tiêu đề "Mở đầu khóa học", cắt 5 giây đầu và bỏ 10 giây cuối',
      ),
    ).toEqual([
      { kind: 'cutSilences' },
      { kind: 'removeFillers' },
      { kind: 'captions' },
      { kind: 'title', text: 'Mở đầu khóa học' },
      { kind: 'filter', preset: 'vintage', intensity: 1 },
      { kind: 'speed', factor: 1.5 },
      { kind: 'aspect', aspect: '9:16' },
      { kind: 'trimStart', ms: 5000 },
      { kind: 'trimEnd', ms: 10_000 },
    ])
  })

  it('hiểu tiếng Anh, "tự biên tập" gom nhiều bước, không hiểu thì rỗng', () => {
    expect(
      parseAssistantRequest('remove silences and add captions, cinematic filter, speed up'),
    ).toEqual([
      { kind: 'cutSilences' },
      { kind: 'captions' },
      { kind: 'filter', preset: 'cinematic', intensity: 1 },
      { kind: 'speed', factor: 1.5 },
    ])
    expect(parseAssistantRequest('tự biên tập cho gọn').map((c) => c.kind)).toEqual([
      'cutSilences',
      'removeFillers',
      'autoZoom',
      'cleanAudio',
    ])
    expect(parseAssistantRequest('xin chào')).toEqual([])
    expect(parseAssistantRequest('')).toEqual([])
  })

  it('normalize: bỏ lệnh sai, giới hạn giá trị, bỏ trùng', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'speed', factor: 99 },
        { kind: 'speed', factor: 2 },
        { kind: 'filter', preset: 'nope' },
        { kind: 'aspect', aspect: '9:16' },
        { kind: 'title', text: '  ' },
        { kind: 'trimStart', ms: -5 },
        { kind: 'trimEnd', ms: 2500.4 },
        'junk',
        { kind: 'captions' },
      ]),
    ).toEqual([
      { kind: 'speed', factor: 8 },
      { kind: 'aspect', aspect: '9:16' },
      { kind: 'trimEnd', ms: 2500 },
      { kind: 'captions' },
    ])
    expect(normalizeAssistantCommands('x')).toEqual([])
  })
})
