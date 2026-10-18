import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_MEMORY, outputDuration, sourceToOutput } from '@lumora/core'
import i18n from '../i18n'
import { createFakeApi, sampleSummary, sampleTranscript } from '../test/fake-api'
import { TranscriptPanel } from './TranscriptPanel'
import { useEditorStore } from './store'

async function setup(withTranscript = false) {
  const fake = createFakeApi()
  if (withTranscript) fake.api.getTranscript.mockResolvedValue(sampleTranscript)
  window.lumora = fake.api
  useEditorStore.getState().reset()
  useEditorStore.setState({ memory: EMPTY_MEMORY, askConfirm: false })
  await useEditorStore.getState().load(sampleSummary.folder)
  return fake.api
}

const clips = () => useEditorStore.getState().edit!.clips
const words = () => screen.getAllByTestId('transcript-word')
const wordByText = (text: string) => words().find((w) => w.textContent === text)!
const keptText = () =>
  words()
    .filter((w) => !w.dataset.cut)
    .map((w) => w.textContent)
    .join(' ')

beforeEach(async () => {
  localStorage.clear()
  await act(() => i18n.changeLanguage('vi'))
})

describe('TranscriptPanel (chỉnh sửa bằng văn bản)', () => {
  it('nhận dạng lời thoại: hiện từng từ, tô từ đệm, ô khoảng lặng và thống kê', async () => {
    const api = await setup()
    render(<TranscriptPanel />)
    await userEvent.click(screen.getByTestId('transcript-generate'))
    await waitFor(() => expect(screen.getAllByTestId('transcript-word')).toHaveLength(7))
    expect(api.transcribe).toHaveBeenCalledWith(sampleSummary.folder, '')
    expect(useEditorStore.getState().transcript).toEqual(sampleTranscript)
    expect(words().map((w) => w.textContent)).toEqual([
      'Xin',
      'chào',
      'ừm',
      'các',
      'bạn.',
      'Hôm',
      'nay',
    ])
    expect(wordByText('ừm').dataset.filler).toBe('true')
    expect(wordByText('chào').dataset.filler).toBeUndefined()
    // Khoảng nghỉ 2,4 s giữa "bạn." và "Hôm" thành ô khoảng lặng.
    const gaps = screen.getAllByTestId('transcript-gap')
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toHaveTextContent('2,4 s')
    expect(screen.getByTestId('transcript-stats')).toHaveTextContent(
      '7 từ · 1 từ đệm · 1 khoảng lặng',
    )
  })

  it('chọn chữ rồi bấm Delete thì cắt video; bấm chữ gạch ngang để khôi phục', async () => {
    await setup(true)
    render(<TranscriptPanel />)
    await screen.findAllByTestId('transcript-word')
    const before = outputDuration(clips())

    // Bấm một từ: chọn và đưa đầu phát tới đó.
    await userEvent.click(wordByText('các'))
    expect(wordByText('các').dataset.selected).toBe('true')
    expect(useEditorStore.getState().time).toBe(1100)
    // Shift+bấm mở rộng vùng chọn tới "bạn.".
    const user = userEvent.setup()
    await user.keyboard('{Shift>}')
    await user.click(wordByText('bạn.'))
    await user.keyboard('{/Shift}')
    expect(screen.getByTestId('transcript-cut-selection')).toHaveTextContent('(2)')

    screen.getByTestId('transcript-text').focus()
    await user.keyboard('{Delete}')
    // Cắt từ đầu "các" (1100) tới đầu từ kế tiếp "Hôm" (4100): mất 3 giây.
    expect(outputDuration(clips())).toBe(before - 3000)
    expect(wordByText('các').dataset.cut).toBe('true')
    expect(wordByText('bạn.').dataset.cut).toBe('true')
    expect(keptText()).toBe('Xin chào ừm Hôm nay')
    // Khoảng lặng nằm trong phần đã cắt cũng gạch ngang.
    expect(screen.getByTestId('transcript-gap').dataset.cut).toBe('true')
    expect(screen.getByTestId('transcript-stats')).toHaveTextContent(
      '5 từ · 1 từ đệm · 0 khoảng lặng',
    )

    // Ẩn phần đã cắt.
    await user.click(screen.getByTestId('transcript-show-cut'))
    expect(words()).toHaveLength(5)
    expect(screen.queryByTestId('transcript-gap')).toBeNull()
    await user.click(screen.getByTestId('transcript-show-cut'))

    // Bấm chữ gạch ngang: khôi phục từ đó (tới đầu từ kế tiếp: 1100 → 1350).
    await user.click(wordByText('các'))
    expect(outputDuration(clips())).toBe(before - 2750)
    expect(wordByText('các').dataset.cut).toBeUndefined()
    expect(wordByText('bạn.').dataset.cut).toBe('true')
    await user.click(wordByText('bạn.'))
    expect(outputDuration(clips())).toBe(before)
    // Hoàn tác được từng bước.
    useEditorStore.getState().undo()
    expect(outputDuration(clips())).toBe(before - 2750)
  })

  it('một nút bỏ mọi từ đệm và rút ngắn mọi khoảng lặng; bấm ô khoảng lặng để cắt / khôi phục', async () => {
    await setup(true)
    render(<TranscriptPanel />)
    await screen.findAllByTestId('transcript-word')
    const before = outputDuration(clips())

    await userEvent.click(screen.getByTestId('transcript-remove-fillers'))
    expect(screen.getByTestId('transcript-done')).toHaveTextContent('Đã cắt 1 từ đệm khỏi video.')
    // "ừm" 800 → đầu "các" 1100.
    expect(outputDuration(clips())).toBe(before - 300)
    expect(wordByText('ừm').dataset.cut).toBe('true')
    expect(screen.getByTestId('transcript-remove-fillers')).toBeDisabled()

    await userEvent.click(screen.getByTestId('transcript-cut-silences'))
    expect(screen.getByTestId('transcript-done')).toHaveTextContent('Đã rút ngắn 1 khoảng lặng.')
    // Khoảng 1700 → 4100 chừa 175 ms mỗi đầu: cắt 2050 ms.
    expect(outputDuration(clips())).toBe(before - 300 - 2050)
    expect(screen.getByTestId('transcript-gap').dataset.cut).toBe('true')
    expect(screen.getByTestId('transcript-cut-silences')).toBeDisabled()

    // Bấm ô khoảng lặng đã cắt: khôi phục; bấm lại: cắt.
    await userEvent.click(screen.getByTestId('transcript-gap'))
    expect(outputDuration(clips())).toBe(before - 300)
    expect(screen.getByTestId('transcript-gap').dataset.cut).toBeUndefined()
    await userEvent.click(screen.getByTestId('transcript-gap'))
    expect(outputDuration(clips())).toBe(before - 300 - 2050)
    // Từ còn lại vẫn trỏ đúng chỗ trên video đã cắt.
    expect(sourceToOutput(clips(), 4100)).toBe(4100 - 300 - 2050)
  })

  it('cắt theo cụm từ: đếm số lần khớp, tô các từ, cắt mọi lần', async () => {
    await setup(true)
    render(<TranscriptPanel />)
    await screen.findAllByTestId('transcript-word')
    expect(screen.getByTestId('transcript-cut-phrase')).toBeDisabled()
    await userEvent.type(screen.getByTestId('transcript-phrase'), 'không có')
    expect(screen.getByTestId('transcript-phrase-matches')).toHaveTextContent(
      'Không thấy cụm từ này trong lời thoại.',
    )
    await userEvent.clear(screen.getByTestId('transcript-phrase'))
    await userEvent.type(screen.getByTestId('transcript-phrase'), 'XIN chào')
    expect(screen.getByTestId('transcript-phrase-matches')).toHaveTextContent(
      'Thấy 1 lần trong lời thoại',
    )
    await userEvent.click(screen.getByTestId('transcript-cut-phrase'))
    expect(screen.getByTestId('transcript-phrase-done')).toHaveTextContent(
      'Đã cắt 1 lần khỏi video.',
    )
    expect(keptText()).toBe('ừm các bạn. Hôm nay')
    expect(clips()[0]!.sourceStart).toBe(800)
  })
})

describe('lệnh cutText của AI', () => {
  it('cắt đúng cụm từ trích từ lời thoại (nhận dạng nếu chưa có); không thấy thì báo bỏ qua', async () => {
    const api = await setup()
    const before = outputDuration(clips())
    const report = await useEditorStore
      .getState()
      .applyAssistantCommands([{ kind: 'cutText', text: 'các bạn', all: true }])
    expect(api.transcribe).toHaveBeenCalledTimes(1)
    expect(report).toEqual([{ step: 'cutText', status: 'done', detail: 1 }])
    expect(outputDuration(clips())).toBe(before - 3000)
    expect(useEditorStore.getState().transcript).toEqual(sampleTranscript)

    const again = await useEditorStore
      .getState()
      .applyAssistantCommands([{ kind: 'cutText', text: 'không có trong bài', all: true }])
    expect(again).toEqual([{ step: 'cutText', status: 'skipped', detail: 'not_found' }])
    expect(api.transcribe).toHaveBeenCalledTimes(1)
  })
})
