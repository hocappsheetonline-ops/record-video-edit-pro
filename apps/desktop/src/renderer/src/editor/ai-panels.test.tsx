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

  it('chưa có phụ đề thì hướng dẫn tạo trước', async () => {
    await setup(false)
    render(<AiPanel />)
    expect(screen.getByText('Hãy tạo phụ đề trước (tab Phụ đề).')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
