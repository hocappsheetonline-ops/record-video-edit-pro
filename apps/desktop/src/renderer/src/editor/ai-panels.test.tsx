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
