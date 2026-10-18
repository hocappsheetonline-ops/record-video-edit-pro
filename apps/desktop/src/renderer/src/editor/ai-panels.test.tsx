import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_MEMORY, outputDuration } from '@lumora/core'
import i18n from '../i18n'
import { createFakeApi, sampleSummary, sampleTranscript } from '../test/fake-api'
import { AiPanel } from './AiPanel'
import { CaptionsPanel } from './CaptionsPanel'
import { useEditorStore } from './store'
import { useAppStore } from '../store/app'
import { useAiStatus } from '../ai/status'
import { useJobs } from './jobs'

async function setup(withTranscript = false) {
  const fake = createFakeApi()
  if (withTranscript) fake.api.getTranscript.mockResolvedValue(sampleTranscript)
  window.lumora = fake.api
  useEditorStore.getState().reset()
  // Trí nhớ và tuỳ chọn đạo diễn là trạng thái toàn cục: xoá để các test không lẫn nhau.
  useEditorStore.setState({ memory: EMPTY_MEMORY, askConfirm: false })
  await useEditorStore.getState().load(sampleSummary.folder)
  return fake.api
}

beforeEach(async () => {
  localStorage.clear()
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

  it('tìm và thay thế: đếm dòng khớp, thay trong từng từ, phân biệt hoa thường', async () => {
    const api = await setup()
    render(<CaptionsPanel />)
    await userEvent.click(screen.getByTestId('captions-generate'))
    await screen.findAllByTestId('caption-line')
    expect(screen.getByTestId('caption-replace-all')).toBeDisabled()
    await userEvent.type(screen.getByTestId('caption-find'), 'xin')
    expect(screen.getByTestId('caption-match-count')).toHaveTextContent('1 dòng khớp')
    expect(
      screen.getAllByTestId('captions-lines')[0]!.querySelectorAll('[data-match]'),
    ).toHaveLength(1)
    await userEvent.click(screen.getByTestId('caption-match-case'))
    expect(screen.getByTestId('caption-match-count')).toHaveTextContent('Không có dòng nào khớp.')
    await userEvent.click(screen.getByTestId('caption-match-case'))
    await userEvent.type(screen.getByTestId('caption-replace'), 'Chào')
    await userEvent.click(screen.getByTestId('caption-replace-all'))
    expect(screen.getByTestId('caption-match-count')).toHaveTextContent('Đã thay trong 1 dòng.')
    const line = useEditorStore.getState().edit!.captions.lines[0]!
    expect(line).toMatchObject({ text: 'Chào chào ừm các bạn.', edited: false })
    expect(line.words[0]!.text).toBe('Chào')
    expect(api.editCaptions).not.toHaveBeenCalled()
  })

  it('sửa phụ đề bằng Claude: sửa chính tả hoặc theo yêu cầu, chỉ dòng đổi được đánh dấu', async () => {
    const api = await setup()
    render(<CaptionsPanel />)
    await userEvent.click(screen.getByTestId('captions-generate'))
    await screen.findAllByTestId('caption-line')
    expect(screen.getByTestId('caption-ai-run')).toBeDisabled()
    await userEvent.click(screen.getByTestId('caption-ai-fix'))
    expect(await screen.findByTestId('caption-ai-result')).toHaveTextContent(
      'Claude đã sửa 1 dòng.',
    )
    expect(api.editCaptions).toHaveBeenCalledWith(expect.any(Array), '', 'vi')
    const lines = useEditorStore.getState().edit!.captions.lines
    expect(lines[0]).toMatchObject({ text: 'Xin chào các bạn.', edited: true })
    expect(lines[1]).toMatchObject({ text: 'Hôm nay', edited: false })

    api.editCaptions.mockResolvedValueOnce([{ id: lines[1]!.id, text: 'Hôm nay' }])
    await userEvent.type(screen.getByTestId('caption-ai-instruction'), 'Viết hoa tên riêng')
    await userEvent.click(screen.getByTestId('caption-ai-run'))
    expect(await screen.findByTestId('caption-ai-result')).toHaveTextContent(
      'Claude không thấy gì cần sửa.',
    )
    expect(api.editCaptions).toHaveBeenLastCalledWith(expect.any(Array), 'Viết hoa tên riêng', 'vi')
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
  it('đạo diễn AI: không có AI thì hiểu theo từ khóa; làm nhiều việc trong một bước hoàn tác', async () => {
    const api = await setup()
    render(<AiPanel />)
    expect(screen.getByTestId('director-engine')).toHaveAttribute('data-engine', 'keywords')
    await userEvent.type(
      screen.getByTestId('assistant-input'),
      'Cắt khoảng lặng, thêm phụ đề, bộ lọc cổ điển, tốc độ 2x, làm video dọc 9:16, tiêu đề "Xin chào"',
    )
    await userEvent.click(screen.getByTestId('assistant-run'))
    const chips = await screen.findAllByTestId('assistant-command')
    // Bước AI (cắt, phụ đề) báo theo tên bước tự biên tập; lệnh còn lại theo loại lệnh.
    expect(chips.map((c) => c.getAttribute('data-kind'))).toEqual([
      'silences',
      'captions',
      'title',
      'filter',
      'speed',
      'aspect',
    ])
    expect(chips.every((c) => c.getAttribute('data-status') === 'done')).toBe(true)
    expect(api.directEdits).toHaveBeenCalledWith(
      expect.stringContaining('Cắt khoảng lặng'),
      expect.objectContaining({
        durationMs: 7000,
        hasTranscript: false,
        musicTracks: [],
        history: [],
      }),
    )
    const s = useEditorStore.getState()
    expect(s.edit!.look.filter).toBe('vintage')
    expect(s.edit!.frame).toMatchObject({ aspect: '9:16', fill: true })
    expect(s.edit!.clips.every((c) => c.speed === 2)).toBe(true)
    expect(s.edit!.captions.enabled).toBe(true)
    expect(s.edit!.overlays[0]).toMatchObject({ kind: 'text', text: 'Xin chào', start: 0 })
    expect(outputDuration(s.edit!.clips)).toBeLessThan(7000)
    expect(s.past).toHaveLength(1)
    // Lịch sử trò chuyện: câu hỏi của người dùng + câu trả lời của AI, lưu theo dự án.
    const msgs = screen.getAllByTestId('director-message')
    expect(msgs.map((m) => m.getAttribute('data-role'))).toEqual(['user', 'ai'])
    expect(
      JSON.parse(localStorage.getItem(`lumora.director.${sampleSummary.folder}`)!).messages,
    ).toHaveLength(2)
    s.undo()
    expect(useEditorStore.getState().edit!.look.filter).toBe('none')
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000)
  })

  it('đạo diễn AI: hỏi lại khi thiếu thông tin, trả lời xong thì làm; nhạc nền, hiệu ứng và xuất', async () => {
    const api = await setup()
    await api.addMusicPaths(['C:\\nhac\\Lofi Chill.mp3'], 'file')
    api.directEdits.mockResolvedValueOnce({
      summary: 'Thêm nhạc nền cho video.',
      questions: ['Bạn muốn nhạc kiểu gì?'],
      commands: [],
    })
    render(<AiPanel />)
    await userEvent.type(screen.getByTestId('assistant-input'), 'thêm nhạc nền cho hay{Enter}')
    const plan = await screen.findByTestId('director-plan')
    expect(within(plan).getByTestId('director-question')).toHaveTextContent(
      'Bạn muốn nhạc kiểu gì?',
    )
    expect(useEditorStore.getState().edit!.audioClips).toHaveLength(0)
    expect(screen.getByTestId('assistant-input')).toHaveAttribute(
      'placeholder',
      'Trả lời câu hỏi của AI, hoặc gõ yêu cầu khác…',
    )

    // Trả lời: AI nhận cả lịch sử, trả kế hoạch đầy đủ → làm luôn.
    api.directEdits.mockResolvedValueOnce({
      summary: 'Thêm nhạc lofi nhỏ, hiệu ứng rung nhẹ rồi xuất 1080p.',
      questions: [],
      commands: [
        { kind: 'music', query: 'lofi', volume: 0.25 },
        { kind: 'effect', effect: 'shake' },
        { kind: 'export', resolution: 1080, format: 'mp4' },
      ],
    })
    await userEvent.type(screen.getByTestId('assistant-input'), 'lofi nhỏ thôi{Enter}')
    await waitFor(() => expect(useEditorStore.getState().edit!.audioClips).toHaveLength(1))
    expect(api.directEdits).toHaveBeenLastCalledWith(
      'lofi nhỏ thôi',
      expect.objectContaining({
        musicTracks: ['Lofi Chill'],
        history: [
          expect.objectContaining({ role: 'user', text: 'thêm nhạc nền cho hay' }),
          expect.objectContaining({ role: 'ai' }),
        ],
      }),
    )
    const s = useEditorStore.getState()
    expect(s.edit!.audioClips[0]).toMatchObject({ kind: 'music', volume: 0.25 })
    // Hiệu ứng ở đầu video và mỗi chỗ nối clip (bản mẫu: clip 5 s + 2 s → chỗ nối ở 5000).
    expect(s.edit!.effects.map((e) => e.kind)).toEqual(['shake', 'shake'])
    expect(s.edit!.effects.map((e) => e.start)).toEqual([0, 5000])
    expect(s.edit!.export).toMatchObject({ resolution: 1080, format: 'mp4' })
    expect(s.exportRequest).toBeGreaterThan(0)
    expect(s.autoExport).toBe(true)
    expect(s.directorPlan).toBeNull()
    const chips = screen.getAllByTestId('assistant-command')
    expect(chips.map((c) => c.getAttribute('data-kind'))).toEqual(['music', 'effect', 'export'])
    expect(screen.queryByTestId('director-plan')).not.toBeInTheDocument()
  })

  it('đạo diễn AI: hỏi trước khi làm, duyệt kế hoạch; không hiểu thì hỏi lại; bỏ qua', async () => {
    await setup()
    render(<AiPanel />)
    await userEvent.click(screen.getByTestId('director-ask-confirm'))
    await userEvent.type(screen.getByTestId('assistant-input'), 'cắt khoảng lặng{Enter}')
    const plan = await screen.findByTestId('director-plan')
    expect(within(plan).getByTestId('director-plan-command')).toHaveAttribute(
      'data-kind',
      'cutSilences',
    )
    expect(outputDuration(useEditorStore.getState().edit!.clips)).toBe(7000)
    await userEvent.click(screen.getByTestId('director-apply'))
    await waitFor(
      () => expect(outputDuration(useEditorStore.getState().edit!.clips)).toBeLessThan(7000),
      { timeout: 3000 },
    )
    expect(screen.queryByTestId('director-plan')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('lumora.director-prefs')!)).toEqual({ askConfirm: true })

    await userEvent.type(screen.getByTestId('assistant-input'), 'xin chào{Enter}')
    expect(await screen.findByTestId('director-question')).toHaveTextContent(
      'Bạn muốn làm gì với video này?',
    )
    await userEvent.click(screen.getByTestId('director-discard'))
    expect(screen.queryByTestId('director-plan')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('director-ask-confirm'))
  })

  it('đạo diễn AI: nhớ quy tắc "từ nay…", gửi cho AI trong bộ nhớ, quên được; học thói quen', async () => {
    const api = await setup()
    render(<AiPanel />)
    await userEvent.type(
      screen.getByTestId('assistant-input'),
      'từ nay luôn thêm phụ đề kiểu TikTok{Enter}',
    )
    await screen.findAllByTestId('assistant-command')
    expect(useEditorStore.getState().memory.rules).toEqual(['từ nay luôn thêm phụ đề kiểu TikTok'])
    expect(useEditorStore.getState().edit!.captions).toMatchObject({
      enabled: true,
      look: expect.objectContaining({ template: 'tiktok' }),
    })
    await userEvent.click(screen.getByTestId('director-rules-toggle'))
    expect(screen.getByTestId('director-rule')).toHaveTextContent(
      'từ nay luôn thêm phụ đề kiểu TikTok',
    )

    // Lượt sau: quy tắc nằm trong ngữ cảnh gửi AI; thói quen (mẫu phụ đề) được học từ bản chỉnh.
    act(() => useEditorStore.getState().learnFromCurrentEdit())
    expect(useEditorStore.getState().memory.counts.captionsTemplate).toEqual({ tiktok: 1 })
    expect(await screen.findByTestId('director-habits')).toHaveTextContent(
      'Mẫu phụ đề: tiktok (×1)',
    )
    await userEvent.type(screen.getByTestId('assistant-input'), 'bộ lọc điện ảnh{Enter}')
    await waitFor(() => expect(useEditorStore.getState().edit!.look.filter).toBe('cinematic'))
    expect(api.directEdits).toHaveBeenLastCalledWith(
      'bộ lọc điện ảnh',
      expect.objectContaining({
        memory: expect.stringContaining('từ nay luôn thêm phụ đề kiểu TikTok'),
      }),
    )

    await userEvent.click(screen.getByTestId('director-rule-forget'))
    expect(useEditorStore.getState().memory.rules).toEqual([])
    expect(screen.getByTestId('director-no-rules')).toBeInTheDocument()
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

  it('chỉnh zoom bằng Claude: gửi zoom hiện có và click, xem trước rồi áp dụng', async () => {
    const api = await setup(true)
    const s = useEditorStore.getState
    s().setTime(5000)
    s().addZoomAtPlayhead()
    expect(s().edit!.zooms).toHaveLength(1)
    render(<AiPanel />)
    expect(screen.getByTestId('ai-zoom-plan')).toBeDisabled()
    await userEvent.click(screen.getByTestId('ai-zoom-preset-tidy'))
    expect(screen.getByTestId('ai-zoom-instruction')).toHaveValue(
      'Gọn hơn: bỏ zoom ngắn, gộp zoom gần nhau',
    )
    await userEvent.click(screen.getByTestId('ai-zoom-plan'))
    const proposal = await screen.findByTestId('ai-zoom-proposal')
    expect(proposal).toHaveTextContent('Claude đề xuất 1 đoạn zoom (hiện có 1).')
    expect(screen.getAllByTestId('ai-zoom-item')).toHaveLength(1)
    expect(api.planZooms).toHaveBeenCalledWith(sampleSummary.folder, {
      instruction: 'Gọn hơn: bỏ zoom ngắn, gộp zoom gần nhau',
      zooms: s().edit!.zooms,
      durationMs: 7000,
      clicks: expect.any(Array),
    })
    // Chưa áp dụng thì chưa đổi.
    expect(s().edit!.zooms.map((z) => z.scale)).toEqual([2])
    await userEvent.click(screen.getByTestId('ai-zoom-apply'))
    expect(s().edit!.zooms.map((z) => z.scale)).toEqual([3])
    expect(screen.queryByTestId('ai-zoom-proposal')).toBeNull()
  })

  it('chưa có phụ đề thì hướng dẫn tạo trước', async () => {
    await setup(false)
    render(<AiPanel />)
    expect(screen.getByText('Hãy tạo phụ đề trước (tab Phụ đề).')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('AiPanel: trạng thái AI và nút làm nhanh', () => {
  it('không có key, không bật AI trên máy → báo chưa sẵn sàng, nút Thiết lập mở Cài đặt', async () => {
    await setup()
    useAppStore.setState({
      settings: { ...(await window.lumora.getSettings()) },
      secrets: {
        elevenlabs: { state: 'missing' },
        anthropic: { state: 'missing' },
        pixabay: { state: 'missing' },
      },
    })
    render(<AiPanel />)
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-bar')).toHaveAttribute('data-state', 'off'),
    )
    expect(screen.getByTestId('ai-status-engines')).toHaveTextContent('chỉ từ khóa')
    expect(screen.getAllByTestId('ai-status-problem').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByTestId('ai-status-setup'))
    expect(useAppStore.getState().page).toBe('settings')
  })

  it('bật AI trên máy có model + key ElevenLabs → sẵn sàng với tên engine', async () => {
    const api = await setup()
    const settings = await api.getSettings()
    useAppStore.setState({
      settings: {
        ...settings,
        localAi: { ...settings.localAi, enabled: true, model: 'qwen2.5:7b' },
      },
      secrets: {
        elevenlabs: { state: 'saved', masked: 'el…' },
        anthropic: { state: 'missing' },
        pixabay: { state: 'missing' },
      },
    })
    render(<AiPanel />)
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-bar')).toHaveAttribute('data-state', 'ready'),
    )
    expect(screen.getByTestId('ai-status-engines')).toHaveTextContent('Ollama qwen2.5:7b')
    expect(screen.getByTestId('ai-status-engines')).toHaveTextContent('ElevenLabs')
    expect(screen.queryByTestId('ai-status-setup')).not.toBeInTheDocument()
  })

  it('nút làm nhanh: một bấm thêm phụ đề; thanh trạng thái hiện việc đang chạy rồi báo xong', async () => {
    await setup()
    render(<AiPanel />)
    await userEvent.click(screen.getByTestId('ai-quick-captions'))
    await waitFor(() => expect(useEditorStore.getState().edit!.captions.enabled).toBe(true))
    const report = await screen.findByTestId('ai-quick-report')
    expect(report).toHaveTextContent('Thêm phụ đề')
    expect(useJobs.getState().jobs.some((j) => j.kind === 'ai' && j.status === 'done')).toBe(true)
    // Việc AI đang chạy hiện ở thanh trạng thái kèm thời gian.
    act(() => {
      useJobs.getState().start('Đang tạo phụ đề', undefined, 'ai')
    })
    expect(screen.getByTestId('ai-status-bar')).toHaveAttribute('data-state', 'running')
    expect(screen.getByTestId('ai-status-running')).toHaveTextContent('Đang tạo phụ đề')
    expect(screen.getByTestId('ai-status-elapsed')).toHaveTextContent('0 s')
    act(() => useJobs.getState().clearDone())
  })

  it('công cụ khác thu gọn mặc định, bấm để mở', async () => {
    await setup()
    render(<AiPanel />)
    expect(screen.getByTestId('ai-advanced-body')).toHaveClass('hidden')
    await userEvent.click(screen.getByTestId('ai-advanced-toggle'))
    expect(screen.getByTestId('ai-advanced-body')).not.toHaveClass('hidden')
    expect(screen.getByTestId('ai-auto-run')).toBeInTheDocument()
    useAiStatus.setState({ checking: false })
  })
})
