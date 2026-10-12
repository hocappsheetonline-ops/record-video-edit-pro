import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('nhạc nền và hiệu ứng âm thanh: thêm, chỉnh, xóa, hoàn tác', async () => {
    const api = setup()
    await screen.findByTestId('editor-title')
    await userEvent.click(screen.getByTestId('tab-audio'))

    // Nhạc nền từ máy: phủ hết video (7 giây), tự lặp, nhỏ dần cuối bài.
    await userEvent.click(screen.getByTestId('add-music'))
    expect(api.addAudioFile).toHaveBeenCalledWith(sampleSummary.folder)
    const music = await screen.findByTestId('timeline-audio')
    expect(music).toHaveAttribute('data-kind', 'music')
    expect(music).toHaveTextContent('Nhạc nền')
    let clip = useEditorStore.getState().edit!.audioClips[0]!
    expect(clip).toMatchObject({ start: 0, duration: 7000, loop: true, volume: 0.5, fadeOut: 1500 })
    expect(screen.getByTestId('audio-loop')).toBeChecked()

    fireEvent.change(screen.getByTestId('audio-volume'), { target: { value: '1.2' } })
    expect(useEditorStore.getState().edit!.audioClips[0]!.volume).toBe(1.2)

    // Hiệu ứng "Bụp" tại giây 3.
    act(() => useEditorStore.getState().setTime(3000))
    await userEvent.click(screen.getByTestId('sfx-pop'))
    expect(api.addSoundEffect).toHaveBeenCalledWith(sampleSummary.folder, 'pop')
    await waitFor(() => expect(screen.getAllByTestId('timeline-audio')).toHaveLength(2))
    clip = useEditorStore.getState().edit!.audioClips[1]!
    expect(clip).toMatchObject({ kind: 'sfx', start: 3000, duration: 800, loop: false })
    expect(api.getAssetPeaks).toHaveBeenCalledWith(sampleSummary.folder, 'asset-sfx-pop.m4a')

    // Xóa hiệu ứng đang chọn rồi hoàn tác.
    await userEvent.click(screen.getByTestId('audio-remove'))
    expect(screen.getAllByTestId('timeline-audio')).toHaveLength(1)
    act(() => useEditorStore.getState().undo())
    expect(screen.getAllByTestId('timeline-audio')).toHaveLength(2)
  })

  it('thêm nhạc lỗi định dạng: báo lỗi dễ hiểu', async () => {
    const api = setup()
    await screen.findByTestId('editor-title')
    await userEvent.click(screen.getByTestId('tab-audio'))
    api.addAudioFile.mockRejectedValueOnce(
      new Error("Error invoking remote method 'assets:add-audio': Error: audio_unreadable"),
    )
    await userEvent.click(screen.getByTestId('add-music'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đọc được file âm thanh này')
  })

  it('chuyển tiếp: bấm ◆ giữa hai clip mở tab Chuyển tiếp, chọn kiểu, áp dụng cho tất cả', async () => {
    setup()
    await screen.findByTestId('editor-title')
    const markers = screen.getAllByTestId('transition-marker')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('data-active', 'false')
    fireEvent.pointerDown(markers[0]!)
    expect(await screen.findByTestId('transition-panel')).toHaveTextContent('Chỗ nối thứ 1')
    await userEvent.click(screen.getByTestId('transition-glitch'))
    expect(useEditorStore.getState().edit!.transitions[0]).toMatchObject({ kind: 'glitch' })
    expect(screen.getByTestId('transition-marker')).toHaveAttribute('data-active', 'true')
    fireEvent.change(screen.getByTestId('transition-duration'), { target: { value: '1500' } })
    expect(useEditorStore.getState().edit!.transitions[0]!.durationMs).toBe(1500)
    await userEvent.click(screen.getByTestId('transition-none'))
    expect(useEditorStore.getState().edit!.transitions).toEqual([])
  })

  it('hiệu ứng hình: thêm tại đầu phát, chỉnh độ mạnh, chọn trên timeline, xóa', async () => {
    setup()
    await screen.findByTestId('editor-title')
    await userEvent.click(screen.getByTestId('tab-effects'))
    act(() => useEditorStore.getState().setTime(6000))
    await userEvent.click(screen.getByTestId('effect-add-vhs'))
    // Gần cuối video: hiệu ứng bị giới hạn trong video (6s → 7s).
    expect(useEditorStore.getState().edit!.effects[0]).toMatchObject({
      kind: 'vhs',
      start: 6000,
      end: 7000,
      intensity: 0.7,
    })
    const block = screen.getByTestId('timeline-effect')
    expect(block).toHaveTextContent('VHS cổ')
    fireEvent.change(screen.getByTestId('effect-intensity'), { target: { value: '0.3' } })
    expect(useEditorStore.getState().edit!.effects[0]!.intensity).toBe(0.3)

    act(() => useEditorStore.getState().setTime(0))
    await userEvent.click(screen.getByTestId('effect-add-confetti'))
    expect(screen.getAllByTestId('timeline-effect')).toHaveLength(2)
    // Bấm khối hiệu ứng trên timeline để chọn lại hiệu ứng đầu tiên.
    fireEvent.pointerDown(screen.getAllByTestId('timeline-effect')[0]!)
    expect(screen.getByTestId('effect-selected')).toHaveTextContent('VHS cổ')
    await userEvent.click(screen.getByTestId('effect-remove'))
    expect(useEditorStore.getState().edit!.effects.map((e) => e.kind)).toEqual(['confetti'])
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
