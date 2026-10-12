import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outputDuration } from '@lumora/core'
import i18n from '../i18n'
import { createFakeApi, sampleSummary, sampleTranscript } from '../test/fake-api'
import { AiPanel } from './AiPanel'
import { CaptionsPanel } from './CaptionsPanel'
import { useEditorStore } from './store'

async function setup(withTranscript = false) {
  const fake = createFakeApi()
  if (withTranscript) fake.api.getTranscript.mockResolvedValue(sampleTranscript)
  window.lumora = fake.api
  useEditorStore.getState().reset()
  await useEditorStore.getState().load(sampleSummary.folder)
  return fake.api
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

describe('CaptionsPanel', () => {
  it('tạo phụ đề: gọi nhận dạng, chia dòng, bật hiển thị', async () => {
    const api = await setup()
    render(<CaptionsPanel />)
    await userEvent.click(screen.getByTestId('captions-generate'))
    await waitFor(() => expect(screen.getAllByTestId('caption-line').length).toBeGreaterThan(0))
    expect(api.transcribe).toHaveBeenCalledWith(sampleSummary.folder, '')
    const lines = screen.getAllByTestId('caption-line') as HTMLInputElement[]
    expect(lines.map((l) => l.value)).toEqual(['Xin chào ừm các bạn.', 'Hôm nay'])
    expect(useEditorStore.getState().edit!.captions.enabled).toBe(true)
    expect(useEditorStore.getState().transcript).toEqual(sampleTranscript)
  })

  it('sửa dòng, dịch và lưu SRT', async () => {
    const api = await setup()
    render(<CaptionsPanel />)
    await userEvent.click(screen.getByTestId('captions-generate'))
    const first = (await screen.findAllByTestId('caption-line'))[0]!
    await userEvent.clear(first)
    await userEvent.type(first, 'Chào cả nhà.')
    expect(useEditorStore.getState().edit!.captions.lines[0]).toMatchObject({
      text: 'Chào cả nhà.',
      edited: true,
    })

    await userEvent.click(screen.getByTestId('captions-srt'))
    await screen.findByTestId('captions-saved')
    const [, fileName, content] = api.saveExportText.mock.calls[0]!
    expect(fileName).toBe(`${sampleSummary.name}.vi.srt`)
    expect(content).toContain('00:00:00,000 --> 00:00:01,700\nChào cả nhà.')

    await userEvent.click(screen.getByTestId('captions-translate'))
    await waitFor(() =>
      expect((screen.getAllByTestId('caption-line')[1] as HTMLInputElement).value).toBe(
        'EN: Hôm nay',
      ),
    )
    expect(api.translateLines).toHaveBeenCalledWith(expect.any(Array), 'en')
    expect(useEditorStore.getState().edit!.captions.language).toBe('en')
  })

  it('mẫu phụ đề, phông, màu nhấn, số từ, vị trí; song ngữ; tách và gộp dòng', async () => {
    const api = await setup()
    // jsdom không có canvas: ô xem mẫu tự bỏ qua.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<CaptionsPanel />)
    await userEvent.click(screen.getByTestId('captions-generate'))
    await screen.findAllByTestId('caption-line')
    const look = () => useEditorStore.getState().edit!.captions.look
    await userEvent.click(screen.getByTestId('caption-template-karaoke'))
    expect(look()).toMatchObject({ template: 'karaoke', highlightColor: '#22d3ee', y: 0.88 })
    await userEvent.selectOptions(screen.getByTestId('caption-font'), 'oswald')
    await userEvent.click(screen.getByTestId('caption-words-3'))
    await userEvent.click(screen.getByTestId('caption-pos-top'))
    await userEvent.click(screen.getByTestId('caption-uppercase'))
    expect(look()).toMatchObject({ font: 'oswald', maxWords: 3, y: 0.12, uppercase: true })
    expect(useEditorStore.getState().edit!.captions.position).toBe('top')
    await userEvent.click(screen.getByTestId('captions-style-classic'))
    expect(useEditorStore.getState().edit!.captions.style).toBe('classic')

    // Song ngữ sang tiếng Nhật: giữ dòng gốc, thêm dòng dịch.
    await userEvent.selectOptions(screen.getByTestId('captions-target'), 'ja')
    await userEvent.click(screen.getByTestId('captions-bilingual'))
    await waitFor(() => expect(screen.getAllByTestId('caption-translation')).toHaveLength(2))
    expect(api.translateLines).toHaveBeenLastCalledWith(expect.any(Array), 'ja')
    const caps = () => useEditorStore.getState().edit!.captions
    expect(caps()).toMatchObject({ bilingual: true, translationLanguage: 'ja' })
    expect(caps().lines.map((l) => [l.text, l.translation])).toEqual([
      ['Xin chào ừm các bạn.', 'EN: Xin chào ừm các bạn.'],
      ['Hôm nay', 'EN: Hôm nay'],
    ])
    await userEvent.click(screen.getByTestId('captions-bilingual-on'))
    expect(caps().bilingual).toBe(false)

    // Tách dòng đầu (5 từ → 3 + 2), gộp lại.
    await userEvent.click(screen.getAllByTestId('caption-split')[0]!)
    expect(caps().lines.map((l) => l.text)).toEqual(['Xin chào ừm', 'các bạn.', 'Hôm nay'])
    await userEvent.click(screen.getAllByTestId('caption-merge')[0]!)
    expect(caps().lines.map((l) => l.text)).toEqual(['Xin chào ừm các bạn.', 'Hôm nay'])
    // Dòng cuối không gộp được.
    expect(screen.getAllByTestId('caption-merge')[1]).toBeDisabled()
  })

  it('thiếu API key thì báo dễ hiểu', async () => {
    const api = await setup()
    api.transcribe.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'ai:transcribe': MissingKeyError: missing_key:elevenlabs",
      ),
    )
    render(<CaptionsPanel />)
    await userEvent.click(screen.getByTestId('captions-generate'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa có API key ElevenLabs')
  })
})

describe('AiPanel', () => {
  it('trợ lý AI: không có key thì hiểu theo từ khóa; làm nhiều việc trong một bước hoàn tác', async () => {
    const api = await setup()
    render(<AiPanel />)
    await userEvent.type(
      screen.getByTestId('assistant-input'),
      'Cắt khoảng lặng, thêm phụ đề, bộ lọc cổ điển, tốc độ 2x, làm video dọc 9:16, tiêu đề "Xin chào"',
    )
    await userEvent.click(screen.getByTestId('assistant-run'))
    const chips = await screen.findAllByTestId('assistant-command')
    expect(chips.map((c) => c.getAttribute('data-kind'))).toEqual([
      'cutSilences',
      'captions',
      'title',
      'filter',
      'speed',
      'aspect',
    ])
    expect(api.planEdits).toHaveBeenCalledWith(
      expect.stringContaining('Cắt khoảng lặng'),
      expect.objectContaining({ durationMs: 7000, hasTranscript: false }),
    )
    const s = useEditorStore.getState()
    expect(s.edit!.look.filter).toBe('vintage')
    expect(s.edit!.frame).toMatchObject({ aspect: '9:16', fill: true })
    expect(s.edit!.clips.every((c) => c.speed === 2)).toBe(true)
    expect(s.edit!.captions.enabled).toBe(true)
    expect(s.edit!.overlays[0]).toMatchObject({ kind: 'text', text: 'Xin chào', start: 0 })
    expect(outputDuration(s.edit!.clips)).toBeLessThan(7000)
    expect(s.past).toHaveLength(1)
    s.undo()
    expect(useEditorStore.getState().edit!.look.filter).toBe('none')
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000)
  })

  it('trợ lý AI: Claude trả lệnh thì dùng lệnh của Claude; không hiểu thì báo', async () => {
    const api = await setup()
    api.planEdits.mockResolvedValueOnce([{ kind: 'trimStart', ms: 2000 }])
    render(<AiPanel />)
    await userEvent.type(screen.getByTestId('assistant-input'), 'bỏ 2 giây đầu{Enter}')
    await waitFor(() => expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(5000))
    expect(screen.getByTestId('assistant-command')).toHaveAttribute('data-kind', 'trimStart')
    await userEvent.clear(screen.getByTestId('assistant-input'))
    await userEvent.type(screen.getByTestId('assistant-input'), 'xin chào{Enter}')
    expect(await screen.findByTestId('assistant-none')).toBeInTheDocument()
  })

  it('chia video thành video ngắn: mỗi đoạn một dự án sao chép chỉ giữ đoạn đó, khung dọc', async () => {
    const api = await setup()
    let n = 0
    api.duplicateProject.mockImplementation(async () => `short-${++n}.lumora`)
    render(<AiPanel />)
    // Video 7 giây, mỗi đoạn ≥ 5 giây: không chia được → báo quá ngắn, không tạo dự án.
    await userEvent.click(screen.getByTestId('shorts-mode-60'))
    await userEvent.click(screen.getByTestId('shorts-run'))
    await screen.findByText('Video quá ngắn để chia (mỗi đoạn tối thiểu 5 giây).')
    expect(api.duplicateProject).not.toHaveBeenCalled()

    // Mỗi 3 giây (đoạn tối thiểu 1 giây): 0–3, 3–6, 6–7 → ba dự án sao chép, khung dọc.
    const count = await useEditorStore
      .getState()
      .splitIntoShorts({ mode: 'fixed', seconds: 3, vertical: true, minMs: 1000 })
    expect(count).toBe(3)
    expect(api.duplicateProject.mock.calls.map((c) => c[1])).toEqual([
      '(short 1)',
      '(short 2)',
      '(short 3)',
    ])
    const saved = api.saveEdit.mock.calls.map((c) => c[1])
    expect(api.saveEdit.mock.calls.map((c) => c[0])).toEqual([
      'short-1.lumora',
      'short-2.lumora',
      'short-3.lumora',
    ])
    expect(saved.map((e) => outputDuration(e.clips))).toEqual([3000, 3000, 1000])
    expect(saved[0]!.frame).toMatchObject({ aspect: '9:16', fill: true })
    expect(saved[0]!.markers).toEqual([])
    // Dự án gốc không đổi.
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000)

    // Theo chương AI: chương tại giây 0 và 5.5 (nguồn) → hai đoạn.
    api.summarize.mockResolvedValue({
      titles: ['A'],
      description: '',
      hashtags: [],
      chapters: [
        { start: 0, title: 'Mở đầu' },
        { start: 5500, title: 'Phần 2' },
      ],
    })
    expect(await useEditorStore.getState().splitIntoShorts({ mode: 'chapters', minMs: 1000 })).toBe(
      2,
    )
  })

  it('AI tự biên tập: cắt, phụ đề, âm thanh, tiêu đề trong một bước hoàn tác; báo bước bị bỏ qua', async () => {
    const api = await setup()
    render(<AiPanel />)
    await userEvent.click(screen.getByTestId('ai-auto-title'))
    await userEvent.click(screen.getByTestId('ai-auto-run'))
    const report = await screen.findByTestId('ai-auto-report')
    const rows = within(report).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual([
      'done',
      'done',
      'skipped',
      'done',
      'done',
      'done',
    ])
    expect(rows[2]).toHaveTextContent('không có dữ liệu chuột')
    expect(api.transcribe).toHaveBeenCalledWith(sampleSummary.folder, '')
    expect(api.suggestCuts).toHaveBeenCalledWith(sampleSummary.folder)
    const s = useEditorStore.getState()
    // Khoảng lặng 1700→4100 (chừa 350ms) + từ đệm 800→1100 của Claude.
    expect(outputDuration(s.edit!.clips)).toBe(7000 - 2050 - 300)
    expect(s.edit!.captions.enabled).toBe(true)
    expect(s.edit!.captions.lines.length).toBeGreaterThan(0)
    expect(s.edit!.audio.micFx).toMatchObject({ noise: 'medium', enhance: true, normalize: true })
    expect(s.edit!.overlays).toHaveLength(1)
    expect(s.edit!.overlays[0]).toMatchObject({ kind: 'text', text: 'Hướng dẫn Lumora', start: 0 })
    // Một lần hoàn tác bỏ cả.
    expect(s.past).toHaveLength(1)
    s.undo()
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000)
    expect(useEditorStore.getState().edit!.overlays).toHaveLength(0)
  })

  it('AI tự biên tập không có key nhận dạng: vẫn cắt khoảng lặng theo dạng sóng, bỏ qua phần cần lời thoại', async () => {
    const api = await setup()
    api.transcribe.mockRejectedValue(
      new Error('Error invoking remote method: missing_key:elevenlabs'),
    )
    api.getWaveform.mockResolvedValue({
      bucketMs: 20,
      peaks: Array.from({ length: 350 }, (_, i) => (i >= 100 && i < 200 ? 0 : 200)),
    })
    await useEditorStore.getState().load(sampleSummary.folder)
    render(<AiPanel />)
    await userEvent.click(screen.getByTestId('ai-auto-run'))
    const rows = within(await screen.findByTestId('ai-auto-report')).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual([
      'done',
      'skipped',
      'skipped',
      'skipped',
      'done',
    ])
    expect(rows[1]).toHaveTextContent('thiếu API key')
    // Im lặng 2000→4000ms, chừa 350ms.
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000 - 1650)
  })

  it('gợi ý cắt rồi áp dụng các đoạn đã chọn', async () => {
    const api = await setup(true)
    render(<AiPanel />)
    await userEvent.click(screen.getByTestId('ai-suggest'))
    const items = await screen.findAllByTestId('ai-suggestion')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Từ đệm')
    expect(items[1]).toHaveTextContent('Im lặng 1.5 giây')
    // Bỏ chọn khoảng lặng, chỉ cắt từ đệm (300ms).
    await userEvent.click(within(items[1]!).getByRole('checkbox'))
    await userEvent.click(screen.getByTestId('ai-apply'))
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000 - 300)
    expect(api.suggestCuts).toHaveBeenCalledWith(sampleSummary.folder)
  })

  it('chỉnh bằng văn bản: chọn từ rồi cắt, từ đã cắt bị gạch', async () => {
    await setup(true)
    render(<AiPanel />)
    const words = screen.getAllByTestId('ai-word')
    expect(words).toHaveLength(7)
    await userEvent.click(words[2]!) // "ừm"
    await userEvent.click(screen.getByTestId('ai-cut-words'))
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000 - 300)
    await waitFor(() => expect(screen.getAllByTestId('ai-word')[2]).toBeDisabled())
  })

  it('tạo tiêu đề, mô tả và chương theo thời gian video đã cắt', async () => {
    await setup(true)
    render(<AiPanel />)
    await userEvent.click(screen.getByTestId('ai-summarize'))
    const box = await screen.findByTestId('ai-summary')
    expect(box).toHaveTextContent('Hướng dẫn Lumora')
    expect(screen.getByTestId('ai-chapters')).toHaveTextContent('0:00 Mở đầu')
    expect(screen.getByTestId('ai-chapters')).toHaveTextContent('0:05 Phần 2')
  })

  it('chưa có phụ đề thì hướng dẫn tạo trước', async () => {
    await setup(false)
    render(<AiPanel />)
    expect(screen.getByText('Hãy tạo phụ đề trước (tab Phụ đề).')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
