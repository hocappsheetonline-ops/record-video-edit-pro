import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../editor/store'
import i18n from '../i18n'
import { useAppStore } from '../store/app'
import { createFakeApi, sampleProject, sampleSummary } from '../test/fake-api'
import { EditorPage } from './EditorPage'

const t0 = sampleProject.segments[0]!.startedAt

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
  useEditorStore.getState().reset()
  // jsdom không có canvas; phần xem trước tự bỏ qua khi không vẽ được.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

function setup(folder: string | null = sampleSummary.folder) {
  const fake = createFakeApi()
  fake.api.getEvents.mockResolvedValue([
    { type: 'down', t: t0 + 1500, x: 960, y: 540, button: 'left' },
  ])
  window.lumora = fake.api
  useAppStore.setState({ page: 'editor', editorFolder: folder })
  render(<EditorPage />)
  return fake.api
}

describe('EditorPage', () => {
  it('chưa chọn dự án thì hướng dẫn mở từ trang Dự án', () => {
    setup(null)
    expect(screen.getByText(/Chưa mở dự án nào/)).toBeInTheDocument()
  })

  it('hiện timeline với clip và zoom tự động, thời lượng đúng', async () => {
    setup()
    expect(await screen.findByTestId('editor-title')).toHaveTextContent(sampleSummary.name)
    expect(screen.getAllByTestId('timeline-clip')).toHaveLength(2)
    expect(screen.getAllByTestId('timeline-zoom')).toHaveLength(1)
    expect(screen.getByTestId('timecode')).toHaveTextContent('0:00.0 / 0:07.0')
  })

  it('hiện dạng sóng âm thanh trong từng clip; tách clip thì sóng chia theo', async () => {
    const api = setup()
    // 7 giây nguồn, 20ms một giá trị: im lặng 2 giây đầu rồi có tiếng.
    api.getWaveform.mockResolvedValue({
      bucketMs: 20,
      peaks: Array.from({ length: 350 }, (_, i) => (i < 100 ? 0 : 200)),
    })
    await screen.findByTestId('editor-title')
    const waves = await screen.findAllByTestId('clip-waveform')
    expect(api.getWaveform).toHaveBeenCalledWith(sampleSummary.folder)
    // Clip 1 dài 5 giây, clip 2 dài 2 giây.
    expect(waves.map((w) => Number(w.getAttribute('data-bars')))).toEqual([84, 34])
    act(() => useEditorStore.getState().setTime(3500))
    await userEvent.keyboard('s')
    expect(await screen.findAllByTestId('clip-waveform')).toHaveLength(3)
  })

  it('dải ảnh thu nhỏ kiểu CapCut: lấp đầy clip, mỗi ô lấy đúng khung hình theo thời gian', async () => {
    // jsdom không đo được kích thước: giả lập clip rộng 300px.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    const api = setup()
    api.getFilmstrip.mockResolvedValue({
      version: 1,
      intervalMs: 1000,
      thumb: { width: 128, height: 72 },
      sheets: [
        {
          segment: 0,
          file: 'filmstrip-0.jpg',
          count: 5,
          columns: 5,
          rows: 1,
          startMs: 0,
          endMs: 5000,
          offsetMs: 0,
        },
        {
          segment: 1,
          file: 'filmstrip-1.jpg',
          count: 2,
          columns: 2,
          rows: 1,
          startMs: 5000,
          endMs: 7000,
          offsetMs: 5000,
        },
      ],
    })
    await screen.findByTestId('editor-title')
    const strips = await screen.findAllByTestId('clip-filmstrip')
    expect(strips).toHaveLength(2)
    // Ô rộng 128/72 × 44 ≈ 78px → 4 ô cho 300px.
    const tiles = strips[0]!.querySelectorAll<HTMLElement>('[data-testid="filmstrip-tile"]')
    expect(tiles).toHaveLength(4)
    expect(tiles[0]!.style.backgroundImage).toContain('filmstrip-0.jpg')
    expect(tiles[0]!.style.backgroundPosition).toBe('0px 0px')
    // Ô cuối của clip 1 (5 giây) rơi vào ảnh thứ 4 hoặc 5.
    expect(tiles[3]!.style.backgroundPosition).toMatch(/^-(23[0-9]|31[0-9])\.\d+px 0px$/)
    const second = strips[1]!.querySelectorAll<HTMLElement>('[data-testid="filmstrip-tile"]')
    expect(second[0]!.style.backgroundImage).toContain('filmstrip-1.jpg')
  })

  it('không có âm thanh thì không vẽ sóng', async () => {
    setup()
    await screen.findByTestId('editor-title')
    await waitFor(() => expect(window.lumora.getWaveform).toHaveBeenCalled())
    expect(screen.queryByTestId('clip-waveform')).not.toBeInTheDocument()
  })

  it('đổi tỉ lệ khung hình làm đổi kích thước xuất', async () => {
    setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('aspect-9:16'))
    await userEvent.click(screen.getByTestId('tab-export'))
    expect(screen.getByTestId('export-size')).toHaveTextContent('1080 × 1920')
  })

  it('tự lưu bản chỉnh sửa sau khi thay đổi', async () => {
    const api = setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('aspect-1:1'))
    await waitFor(() => expect(api.saveEdit).toHaveBeenCalled(), { timeout: 2000 })
    expect(api.saveEdit.mock.calls.at(-1)![1].frame.aspect).toBe('1:1')
  })

  it('phím tắt: S để tách, Ctrl+Z để hoàn tác', async () => {
    setup()
    await screen.findByTestId('editor')
    act(() => useEditorStore.getState().setTime(1500))
    await userEvent.keyboard('s')
    expect(screen.getAllByTestId('timeline-clip')).toHaveLength(3)
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(screen.getAllByTestId('timeline-clip')).toHaveLength(2)
  })

  it('chọn clip để đổi tốc độ', async () => {
    setup()
    await screen.findByTestId('editor')
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: screen.getAllByTestId('timeline-clip')[0]!,
    })
    await userEvent.selectOptions(screen.getByTestId('clip-speed'), '2')
    expect(screen.getByTestId('timecode')).toHaveTextContent('/ 0:04.5')
  })
})
