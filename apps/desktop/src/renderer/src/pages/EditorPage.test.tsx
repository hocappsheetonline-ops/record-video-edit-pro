import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipLayer } from '../components/TooltipLayer'
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
  render(
    <>
      <EditorPage />
      <TooltipLayer />
    </>,
  )
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
    await userEvent.click(screen.getByTestId('lib-audio'))
    await userEvent.click(screen.getByTestId('audio-section-music'))

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
    await userEvent.click(screen.getByTestId('audio-section-sfx'))
    await userEvent.click(screen.getByTestId('sfx-pop'))
    expect(api.addSoundEffect).toHaveBeenCalledWith(sampleSummary.folder, 'pop')
    await waitFor(() => expect(screen.getAllByTestId('timeline-audio')).toHaveLength(2))
    clip = useEditorStore.getState().edit!.audioClips[1]!
    expect(clip).toMatchObject({ kind: 'sfx', start: 3000, duration: 800, loop: false })
    expect(api.getAssetPeaks).toHaveBeenCalledWith(sampleSummary.folder, 'asset-sfx-pop.m4a')

    // Xóa hiệu ứng đang chọn rồi hoàn tác.
    expect(screen.getByTestId('props-title')).toHaveTextContent('pop')
    await userEvent.click(screen.getByTestId('props-delete'))
    expect(screen.getAllByTestId('timeline-audio')).toHaveLength(1)
    act(() => useEditorStore.getState().undo())
    expect(screen.getAllByTestId('timeline-audio')).toHaveLength(2)
  })

  it('thêm nhạc lỗi định dạng: báo lỗi dễ hiểu', async () => {
    const api = setup()
    await screen.findByTestId('editor-title')
    await userEvent.click(screen.getByTestId('lib-audio'))
    await userEvent.click(screen.getByTestId('audio-section-music'))
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
    await userEvent.click(screen.getByTestId('lib-effects'))
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
    expect(screen.getByTestId('props-title')).toHaveTextContent('VHS cổ')
    expect(screen.getByTestId('effect-kind')).toHaveValue('vhs')
    await userEvent.click(screen.getByTestId('props-delete'))
    expect(useEditorStore.getState().edit!.effects.map((e) => e.kind)).toEqual(['confetti'])
  })

  it('chữ và nhãn dán: thêm từ thư viện bên trái, chỉnh ở bảng bên phải, xóa', async () => {
    setup()
    await screen.findByTestId('editor-title')
    await userEvent.click(screen.getByTestId('lib-text'))
    await userEvent.click(screen.getByTestId('text-add-neon'))
    let o = useEditorStore.getState().edit!.overlays[0]!
    expect(o).toMatchObject({ kind: 'text', text: 'Nhập chữ', style: 'neon', start: 0, end: 3000 })
    expect(screen.getByTestId('timeline-overlay')).toHaveTextContent('Nhập chữ')
    // Thêm xong thì bảng bên phải hiện thuộc tính của chữ vừa thêm.
    expect(screen.getByTestId('props-title')).toHaveTextContent('Văn bản')

    await userEvent.clear(screen.getByTestId('overlay-edit-text'))
    await userEvent.type(screen.getByTestId('overlay-edit-text'), 'Đỉnh')
    await userEvent.click(screen.getByTestId('overlay-style-meme'))
    fireEvent.change(screen.getByTestId('overlay-size'), { target: { value: '0.2' } })
    await userEvent.click(screen.getByTestId('anim-loop-shake'))
    await userEvent.click(screen.getByTestId('pos-bottom'))
    o = useEditorStore.getState().edit!.overlays[0]!
    expect(o).toMatchObject({ text: 'Đỉnh', style: 'meme', size: 0.2, y: 0.85 })
    expect(o.anim).toMatchObject({ in: 'pop', loop: 'shake' })
    // Chữ không có phần xóa phông / âm lượng của video.
    expect(screen.queryByTestId('key-00ff00')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('lib-stickers'))
    await userEvent.click(screen.getByTestId('emoji-0'))
    expect(useEditorStore.getState().edit!.overlays.map((x) => x.kind)).toEqual(['text', 'emoji'])
    expect(screen.getByTestId('props-title')).toHaveTextContent('Nhãn dán')
    await userEvent.click(screen.getByTestId('props-delete'))
    expect(useEditorStore.getState().edit!.overlays).toHaveLength(1)
    // Quay lại cài đặt chung.
    fireEvent.pointerDown(screen.getAllByTestId('timeline-overlay')[0]!)
    await userEvent.click(screen.getByTestId('props-back'))
    expect(screen.getByTestId('tab-frame')).toBeInTheDocument()
  })

  it('meme video: thư viện có video, thêm vào timeline với tiếng, xóa phông xanh, phủ kín khung', async () => {
    const api = setup()
    await screen.findByTestId('editor-title')
    // Mặc định mở mục Meme: thư viện có ảnh GIF và video.
    const items = await screen.findAllByTestId('meme-item')
    expect(items.map((i) => i.getAttribute('data-kind'))).toEqual(['image', 'video'])
    expect(items[1]).toHaveTextContent('0:03')
    await userEvent.click(screen.getByTestId('media-filter-video'))
    expect(screen.getAllByTestId('meme-item')).toHaveLength(1)

    act(() => useEditorStore.getState().setTime(1000))
    await userEvent.click(screen.getByTestId('meme-item'))
    expect(api.useMeme).toHaveBeenCalledWith(sampleSummary.folder, 'meme-b.mp4')
    await waitFor(() => expect(useEditorStore.getState().edit!.overlays).toHaveLength(1))
    let o = useEditorStore.getState().edit!.overlays[0]!
    // Dài đúng bằng video (2.5 giây), có tiếng, không hiệu ứng bật ra.
    expect(o).toMatchObject({
      kind: 'video',
      file: 'asset-meme-b.mp4',
      start: 1000,
      end: 3500,
      sourceDuration: 2500,
      hasAudio: true,
      anim: expect.objectContaining({ in: 'none', out: 'none', loop: 'none' }),
      keyColor: '',
    })
    expect(o.aspect).toBeCloseTo(16 / 9)
    expect(screen.getByTestId('timeline-overlay')).toHaveAttribute('data-kind', 'video')
    expect(screen.getByTestId('props-title')).toHaveTextContent('Bruh')

    await userEvent.click(screen.getByTestId('key-00ff00'))
    fireEvent.change(screen.getByTestId('key-strength'), { target: { value: '0.8' } })
    fireEvent.change(screen.getByTestId('overlay-volume'), { target: { value: '0.5' } })
    await userEvent.click(screen.getByTestId('overlay-fill'))
    o = useEditorStore.getState().edit!.overlays[0]!
    // Khung 16:9 và video 16:9: phủ kín = cao bằng khung.
    expect(o).toMatchObject({ keyColor: '#00ff00', keyStrength: 0.8, volume: 0.5, size: 1, x: 0.5 })

    // Ảnh từ máy (vào riêng dự án) cũng thêm được.
    await userEvent.click(screen.getByTestId('overlay-add-image'))
    await waitFor(() => expect(useEditorStore.getState().edit!.overlays).toHaveLength(2))
    expect(useEditorStore.getState().edit!.overlays[1]).toMatchObject({ kind: 'image', aspect: 2 })
  })

  it('kéo thả file vào thư viện meme', async () => {
    const api = setup()
    await screen.findByTestId('editor-title')
    const zone = await screen.findByTestId('media-tab')
    const file = new File(['x'], 'bruh.mp4', { type: 'video/mp4' })
    fireEvent.dragOver(zone, { dataTransfer: { files: [file] } })
    expect(screen.getByText('Thả để thêm vào thư viện meme')).toBeInTheDocument()
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(api.addMemePaths).toHaveBeenCalledWith(['C:/drop/bruh.mp4']))
    api.addMemePaths.mockRejectedValueOnce(
      new Error("Error invoking remote method 'memes:add-paths': Error: video_unreadable"),
    )
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đọc được video này')
  })

  it('webcam: chọn trên khung xem trước mở phần Webcam; đặt vị trí tự do, khung mặt, viền', async () => {
    setup()
    await screen.findByTestId('editor-title')
    act(() => useEditorStore.getState().select({ kind: 'camera', id: '' }))
    expect(screen.getByTestId('tab-camera')).toHaveAttribute('aria-selected', 'true')
    fireEvent.pointerDown(screen.getByTestId('cam-pos-0.5-1'))
    expect(useEditorStore.getState().edit!.camera).toMatchObject({ x: 0.5, y: 1 })
    fireEvent.pointerDown(screen.getByTestId('cam-pos-0-0'))
    // Đúng góc thì nhớ cả góc.
    expect(useEditorStore.getState().edit!.camera).toMatchObject({
      x: 0,
      y: 0,
      position: 'top-left',
    })
    fireEvent.change(screen.getByTestId('cam-size'), { target: { value: '0.4' } })
    fireEvent.change(screen.getByTestId('cam-zoom'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByTestId('cam-focus-y'), { target: { value: '0.35' } })
    fireEvent.change(screen.getByTestId('cam-border'), { target: { value: '0.5' } })
    expect(useEditorStore.getState().edit!.camera).toMatchObject({
      size: 0.4,
      zoom: 1.5,
      focusY: 0.35,
      border: 0.5,
    })
    // Delete khi đang chọn webcam: ẩn webcam.
    await userEvent.keyboard('{Delete}')
    expect(useEditorStore.getState().edit!.camera.visible).toBe(false)
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
    await userEvent.click(screen.getByTestId('export-open'))
    expect(screen.getByTestId('export-dialog')).toBeVisible()
    expect(screen.getByTestId('export-size')).toHaveTextContent('1080 × 1920')
    // Đóng hộp thoại bằng Esc.
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('export-dialog').parentElement).not.toBeVisible()
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
    expect(screen.getByTestId('props-title')).toHaveTextContent('Video')
    await userEvent.click(screen.getByTestId('clip-tab-speed'))
    await userEvent.click(screen.getByTestId('speed-2'))
    expect(screen.getByTestId('timecode')).toHaveTextContent('/ 0:04.5')
  })

  it('clip: tab Âm thanh tắt tiếng / chỉnh âm lượng riêng; tab Tốc độ gõ số trực tiếp', async () => {
    setup()
    await screen.findByTestId('editor')
    fireEvent.pointerDown(screen.getAllByTestId('timeline-clip')[0]!)
    await userEvent.click(screen.getByTestId('clip-tab-audio'))
    await userEvent.click(screen.getByTestId('clip-muted'))
    expect(useEditorStore.getState().edit!.clips[0]!.audio).toEqual({
      mic: 1,
      system: 1,
      muted: true,
    })
    await userEvent.click(screen.getByTestId('clip-muted'))
    fireEvent.change(screen.getByTestId('clip-mic'), { target: { value: '1.5' } })
    expect(useEditorStore.getState().edit!.clips[0]!.audio).toMatchObject({
      mic: 1.5,
      muted: false,
    })
    // Nút đặt lại về mặc định.
    await userEvent.click(screen.getByTestId('clip-mic-reset'))
    expect(useEditorStore.getState().edit!.clips[0]!.audio!.mic).toBe(1)

    await userEvent.click(screen.getByTestId('clip-tab-speed'))
    const input = screen.getByTestId('clip-speed-slider-input')
    await userEvent.clear(input)
    await userEvent.type(input, '2.5{Enter}')
    expect(useEditorStore.getState().edit!.clips[0]!.speed).toBe(2.5)
    // Ngoài giới hạn thì kẹp lại.
    await userEvent.clear(input)
    await userEvent.type(input, '99{Enter}')
    expect(useEditorStore.getState().edit!.clips[0]!.speed).toBe(8)
  })

  it('ô số phần trăm: gõ 40 nghĩa là 40%; mũi tên lên tăng một bước', async () => {
    setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('tab-camera'))
    const input = screen.getByTestId('cam-size-input')
    expect(input).toHaveValue('22%')
    await userEvent.clear(input)
    await userEvent.type(input, '40{Enter}')
    expect(useEditorStore.getState().edit!.camera.size).toBe(0.4)
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}')
    expect(useEditorStore.getState().edit!.camera.size).toBe(0.41)
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('41%')
  })

  it('kho meme online: chưa có key thì hướng dẫn; có key thì tìm, xem thêm, tải và thêm vào video', async () => {
    const api = setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('media-source-tenor'))
    expect(screen.getByText('Cần key Tenor để tìm meme')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('online-open-settings'))
    expect(useAppStore.getState().page).toBe('settings')
    act(() => {
      useAppStore.setState({
        page: 'editor',
        secrets: {
          elevenlabs: { state: 'missing' },
          anthropic: { state: 'missing' },
          tenor: { state: 'saved', masked: 'AIza••••' },
          pixabay: { state: 'missing' },
        },
      })
    })
    expect(await screen.findAllByTestId('online-item')).toHaveLength(2)
    expect(api.onlineSearch).toHaveBeenCalledWith('tenor', '', null)
    expect(screen.getByTestId('online-attribution')).toHaveTextContent('Powered by Tenor')
    await userEvent.type(screen.getByTestId('online-search'), 'bruh{Enter}')
    await waitFor(() => expect(api.onlineSearch).toHaveBeenLastCalledWith('tenor', 'bruh', null))
    await userEvent.click(screen.getByTestId('online-more'))
    await waitFor(() => expect(screen.getAllByTestId('online-item')).toHaveLength(3))
    expect(api.onlineSearch).toHaveBeenLastCalledWith('tenor', 'bruh', '2')
    expect(screen.queryByTestId('online-more')).not.toBeInTheDocument()

    act(() => useEditorStore.getState().setTime(500))
    await userEvent.click(screen.getAllByTestId('online-item')[0]!)
    await waitFor(() => expect(useEditorStore.getState().edit!.overlays).toHaveLength(1))
    expect(api.onlineDownload).toHaveBeenCalledWith('tenor', '0')
    expect(api.useMeme).toHaveBeenCalledWith(sampleSummary.folder, 'meme-dl-0.mp4')
    expect(screen.getAllByTestId('online-item')[0]).toHaveAttribute('data-state', 'done')
    // Bấm lần nữa: không tải lại.
    await userEvent.click(screen.getAllByTestId('online-item')[0]!)
    await waitFor(() => expect(useEditorStore.getState().edit!.overlays).toHaveLength(2))
    expect(api.onlineDownload).toHaveBeenCalledTimes(1)

    // Lỗi key sai hiện lời giải thích.
    api.onlineSearch.mockRejectedValueOnce(
      new Error("Error invoking remote method 'online:search': Error: key_invalid"),
    )
    await userEvent.type(screen.getByTestId('online-search'), ' x{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('API key không đúng')
  })

  it('sticker động Tenor và âm thanh meme + giọng đọc AI', async () => {
    const api = setup()
    await screen.findByTestId('editor')
    act(() => {
      useAppStore.setState({
        secrets: {
          elevenlabs: { state: 'saved', masked: 'el••' },
          anthropic: { state: 'missing' },
          tenor: { state: 'saved', masked: 'AIza••' },
          pixabay: { state: 'missing' },
        },
      })
    })
    await userEvent.click(screen.getByTestId('lib-stickers'))
    await userEvent.click(screen.getByTestId('sticker-source-tenorSticker'))
    expect(await screen.findAllByTestId('online-item')).toHaveLength(2)
    expect(api.onlineSearch).toHaveBeenCalledWith('tenorSticker', '', null)

    await userEvent.click(screen.getByTestId('lib-audio'))
    await userEvent.click(screen.getByTestId('audio-section-meme'))
    await userEvent.click(screen.getByTestId('sfx-vineBoom'))
    expect(api.addSoundEffect).toHaveBeenCalledWith(sampleSummary.folder, 'vineBoom')
    await waitFor(() => expect(useEditorStore.getState().edit!.audioClips).toHaveLength(1))
    expect(await screen.findByTestId('speech-voice')).toHaveValue('voice-anna')
    await userEvent.selectOptions(screen.getByTestId('speech-voice'), 'voice-bao')
    await userEvent.click(screen.getByTestId('speech-line-1'))
    await waitFor(() => expect(useEditorStore.getState().edit!.audioClips).toHaveLength(2))
    expect(api.speak).toHaveBeenCalledWith(sampleSummary.folder, 'Ối dồi ôi', 'voice-bao')
    await userEvent.type(screen.getByTestId('speech-text'), 'Xin chào{Enter}')
    await waitFor(() =>
      expect(api.speak).toHaveBeenLastCalledWith(sampleSummary.folder, 'Xin chào', 'voice-bao'),
    )
    expect(useEditorStore.getState().edit!.audioClips.map((c) => c.name)).toEqual([
      'vineBoom',
      'Ối dồi ôi',
      'Xin chào',
    ])
  })

  it('nút chỉ có biểu tượng đều có tên và chú thích khi rê chuột', async () => {
    setup()
    await screen.findByTestId('editor')
    const unnamed = screen
      .getAllByRole('button')
      .filter((b) => !b.textContent?.trim() && !b.getAttribute('aria-label'))
    expect(unnamed.map((b) => b.outerHTML.slice(0, 120))).toEqual([])
    await userEvent.hover(screen.getByTestId('lib-audio'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Âm thanh')
    await userEvent.unhover(screen.getByTestId('lib-audio'))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    await userEvent.hover(screen.getByTestId('split'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('TáchS')
  })

  it('lọc tạp âm micro: chọn mức AI, xử lý ở nền rồi báo đã áp dụng; hiệu ứng giọng cho đoạn âm thanh', async () => {
    const api = setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('tab-audio'))
    await userEvent.click(screen.getByTestId('mic-fx-noise-medium'))
    expect(useEditorStore.getState().edit!.audio.micFx).toMatchObject({ noise: 'medium' })
    await waitFor(() =>
      expect(api.processAudio).toHaveBeenCalledWith(
        sampleSummary.folder,
        'seg0-mic.webm',
        expect.objectContaining({ noise: 'medium' }),
      ),
    )
    expect(await screen.findByText('Đã áp dụng')).toBeInTheDocument()
    expect(useEditorStore.getState().fxFiles).toMatchObject({
      'seg0-mic.webm|n2': 'fx-seg0-mic-test.m4a',
    })
    await userEvent.click(screen.getByTestId('mic-fx-enhance'))
    expect(useEditorStore.getState().edit!.audio.micFx.enhance).toBe(true)
    // Giữ nút "Gốc" để nghe bản gốc.
    fireEvent.pointerDown(screen.getByTestId('mic-fx-bypass'))
    expect(useEditorStore.getState().bypassFx).toBe(true)
    fireEvent.pointerUp(screen.getByTestId('mic-fx-bypass'))
    expect(useEditorStore.getState().bypassFx).toBe(false)

    // Đoạn hiệu ứng âm thanh: giọng sóc chuột, cao độ ẩn khi dùng giọng có sẵn.
    await userEvent.click(screen.getByTestId('lib-audio'))
    await userEvent.click(screen.getByTestId('sfx-pop'))
    await waitFor(() => expect(screen.getByTestId('fx-panel')).toBeInTheDocument())
    expect(screen.getByTestId('fx-pitch')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('fx-voice-chipmunk'))
    expect(useEditorStore.getState().edit!.audioClips[0]!.fx).toMatchObject({ voice: 'chipmunk' })
    expect(screen.queryByTestId('fx-pitch')).not.toBeInTheDocument()
    expect(screen.getByTestId('audio-fx-badge')).toBeInTheDocument()
  })

  it('tách âm thanh của video meme thành đoạn riêng', async () => {
    setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('media-filter-video'))
    act(() => useEditorStore.getState().setTime(1000))
    await userEvent.click(await screen.findByTestId('meme-item'))
    await userEvent.click(await screen.findByTestId('overlay-detach-audio'))
    const { overlays, audioClips } = useEditorStore.getState().edit!
    expect(overlays[0]!.hasAudio).toBe(false)
    expect(audioClips).toEqual([
      expect.objectContaining({
        file: 'asset-meme-b.mp4',
        name: 'Bruh',
        start: 1000,
        offset: 0,
        duration: 2500,
        sourceDuration: 2500,
      }),
    ])
    expect(useEditorStore.getState().selection).toMatchObject({ kind: 'audio' })
  })

  it('nhạc nền hiện vạch nhịp theo dạng sóng', async () => {
    const api = setup()
    api.getAssetPeaks.mockResolvedValue({
      bucketMs: 20,
      peaks: Array.from({ length: 300 }, (_, i) => (i % 25 === 5 ? 220 : 30)),
    })
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('lib-audio'))
    await userEvent.click(screen.getByTestId('audio-section-music'))
    await userEvent.click(screen.getByTestId('add-music'))
    // Nhạc phủ 7 giây, nhịp mỗi 0.5 giây.
    await waitFor(() => expect(screen.getAllByTestId('beat-mark').length).toBeGreaterThan(10))
  })

  it('lồng tiếng: ghi micro trong lúc phát, tắt tiếng bản gốc, dừng thì thêm đúng chỗ', async () => {
    const api = setup()
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Mic', groupId: 'g' },
        ],
        getUserMedia: vi.fn(async () => stream),
      },
    })
    class FakeRecorder {
      static isTypeSupported = () => true
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start = vi.fn()
      stop() {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(1234)]) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal(
      'AudioContext',
      class {
        createAnalyser = () => ({ fftSize: 0, getFloatTimeDomainData: () => undefined })
        createMediaStreamSource = () => ({ connect: () => undefined })
        close = async () => undefined
      },
    )
    await screen.findByTestId('editor')
    act(() => useEditorStore.getState().setTime(2000))
    await userEvent.click(screen.getByTestId('lib-audio'))
    await userEvent.click(screen.getByTestId('audio-section-voice'))
    expect(await screen.findByRole('option', { name: 'USB Mic' })).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('voice-countdown-toggle'))
    await userEvent.click(screen.getByTestId('voice-record'))
    await waitFor(() => expect(useEditorStore.getState().playing).toBe(true))
    expect(useEditorStore.getState().muteOriginal).toBe(true)
    await userEvent.click(await screen.findByTestId('voice-stop'))
    await waitFor(() => expect(useEditorStore.getState().edit!.audioClips).toHaveLength(1))
    expect(api.addVoiceover).toHaveBeenCalledWith(sampleSummary.folder, expect.any(ArrayBuffer))
    expect(useEditorStore.getState().edit!.audioClips[0]).toMatchObject({
      kind: 'voice',
      name: 'Lồng tiếng 1',
      start: 2000,
    })
    expect(useEditorStore.getState().playing).toBe(false)
    expect(useEditorStore.getState().muteOriginal).toBe(false)
    expect(track.stop).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('bộ lọc: áp dụng cho cả video, hoặc riêng clip đang chọn; độ mạnh; dùng lại bộ lọc chung', async () => {
    setup()
    await screen.findByTestId('editor')
    const edit = () => useEditorStore.getState().edit!
    await userEvent.click(screen.getByTestId('lib-filters'))
    expect(screen.getByTestId('look-target')).toHaveAttribute('data-target', 'all')
    expect(screen.getByTestId('filter-none')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByTestId('filter-bw'))
    expect(edit().look.filter).toBe('bw')
    fireEvent.change(screen.getByTestId('filter-intensity'), { target: { value: '0.5' } })
    expect(edit().look.intensity).toBe(0.5)
    // Chọn clip 2: bộ lọc chỉ cho clip đó, timeline có dấu bộ lọc.
    fireEvent.pointerDown(screen.getAllByTestId('timeline-clip')[1]!)
    expect(screen.getByTestId('look-target')).toHaveAttribute('data-target', 'clip')
    await userEvent.click(screen.getByTestId('filter-warm'))
    expect(edit().clips[1]!.look?.filter).toBe('warm')
    expect(edit().clips[0]).not.toHaveProperty('look')
    expect(edit().look.filter).toBe('bw')
    expect(screen.getAllByTestId('clip-look-badge')).toHaveLength(1)
    await userEvent.click(screen.getByTestId('look-use-global'))
    expect(edit().clips[1]).not.toHaveProperty('look')
    // Hoàn tác đưa bộ lọc riêng trở lại.
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(edit().clips[1]!.look?.filter).toBe('warm')
    await userEvent.click(screen.getByTestId('look-target-all'))
    expect(screen.getByTestId('look-target')).toHaveAttribute('data-target', 'all')
  })

  it('điều chỉnh: thanh trượt cho cả video và cho từng clip; đặt lại tất cả', async () => {
    setup()
    await screen.findByTestId('editor')
    const edit = () => useEditorStore.getState().edit!
    await userEvent.click(screen.getByTestId('tab-adjust'))
    fireEvent.change(screen.getByTestId('adjust-contrast'), { target: { value: '0.3' } })
    fireEvent.change(screen.getByTestId('adjust-temperature'), { target: { value: '-0.4' } })
    expect(edit().look.adjust).toMatchObject({ contrast: 0.3, temperature: -0.4 })
    expect(screen.getByTestId('adjust-temperature-input')).toHaveValue('-40%')
    await userEvent.click(screen.getByTestId('adjust-reset'))
    expect(edit().look.adjust.contrast).toBe(0)
    fireEvent.pointerDown(screen.getAllByTestId('timeline-clip')[0]!)
    await userEvent.click(screen.getByTestId('clip-tab-adjust'))
    expect(screen.getByTestId('look-target')).toHaveAttribute('data-target', 'clip')
    fireEvent.change(screen.getByTestId('adjust-vignette'), { target: { value: '0.6' } })
    expect(edit().clips[0]!.look?.adjust.vignette).toBe(0.6)
    expect(edit().look.adjust.vignette).toBe(0)
  })

  it('cắt / lật / xoay clip: lưu đúng, khung xuất đổi tỉ lệ khi xoay, đặt lại', async () => {
    setup()
    await screen.findByTestId('editor')
    const clip = () => useEditorStore.getState().edit!.clips[0]!
    fireEvent.pointerDown(screen.getAllByTestId('timeline-clip')[0]!)
    await userEvent.click(screen.getByTestId('clip-flip-h'))
    expect(clip().transform).toMatchObject({ flipH: true, rotate: 0 })
    expect(screen.getByTestId('clip-flip-h')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByTestId('clip-rotate-right'))
    expect(clip().transform!.rotate).toBe(90)
    await userEvent.click(screen.getByTestId('clip-rotate-left'))
    await userEvent.click(screen.getByTestId('clip-rotate-left'))
    expect(clip().transform!.rotate).toBe(270)
    expect(screen.getByTestId('clip-rotation')).toHaveTextContent('270°')
    fireEvent.change(screen.getByTestId('crop-left'), { target: { value: '0.2' } })
    fireEvent.change(screen.getByTestId('crop-bottom'), { target: { value: '0.1' } })
    expect(clip().transform!.crop.x).toBeCloseTo(0.2)
    expect(clip().transform!.crop.width).toBeCloseTo(0.8)
    expect(clip().transform!.crop.height).toBeCloseTo(0.9)
    await userEvent.click(screen.getByTestId('clip-transform-reset'))
    expect(clip()).not.toHaveProperty('transform')
    // Lật hai lần là về như cũ: không lưu biến đổi rỗng.
    await userEvent.click(screen.getByTestId('clip-flip-v'))
    await userEvent.click(screen.getByTestId('clip-flip-v'))
    expect(clip()).not.toHaveProperty('transform')
  })

  it('đóng băng khung hình: chèn tại đầu phát, chỉnh độ dài, không có tab âm thanh / tốc độ', async () => {
    setup()
    await screen.findByTestId('editor')
    act(() => useEditorStore.getState().setTime(1000))
    await userEvent.click(screen.getByTestId('freeze'))
    const clips = useEditorStore.getState().edit!.clips
    expect(clips).toHaveLength(4)
    expect(clips[1]).toMatchObject({ freeze: 2000 })
    expect(screen.getByTestId('timecode')).toHaveTextContent('/ 0:09.0')
    expect(screen.getAllByTestId('clip-freeze-badge')).toHaveLength(1)
    // Clip đứng yên được chọn sẵn.
    expect(screen.getByTestId('freeze-props')).toBeInTheDocument()
    expect(screen.queryByTestId('clip-tab-audio')).not.toBeInTheDocument()
    expect(screen.queryByTestId('clip-tab-speed')).not.toBeInTheDocument()
    const input = screen.getByTestId('freeze-duration-input')
    await userEvent.clear(input)
    await userEvent.type(input, '3.5{Enter}')
    expect(useEditorStore.getState().edit!.clips[1]!.freeze).toBe(3500)
    expect(screen.getByTestId('timecode')).toHaveTextContent('/ 0:10.5')
    await userEvent.click(screen.getByTestId('delete'))
    expect(useEditorStore.getState().edit!.clips).toHaveLength(3)
  })
  it('keyframe: thêm ở hai thời điểm, kéo thanh trượt sửa keyframe tại đầu phát, hình thoi trên timeline', async () => {
    setup()
    await screen.findByTestId('editor-title')
    const ov = () => useEditorStore.getState().edit!.overlays[0]!
    await userEvent.click(screen.getByTestId('lib-text'))
    await userEvent.click(screen.getByTestId('text-add-meme'))
    expect(screen.getByTestId('keyframe-count')).toHaveTextContent('Thêm keyframe ở hai thời điểm')
    // Chưa có keyframe: kéo cỡ là sửa giá trị gốc.
    fireEvent.change(screen.getByTestId('overlay-size'), { target: { value: '0.1' } })
    expect(ov().size).toBe(0.1)
    expect(ov()).not.toHaveProperty('keyframes')
    // Keyframe tại 0s, rồi tại 2s đổi cỡ → lớp tự to dần.
    await userEvent.click(screen.getByTestId('overlay-keyframe'))
    act(() => useEditorStore.getState().setTime(2000))
    fireEvent.change(screen.getByTestId('overlay-size'), { target: { value: '0.3' } })
    expect(ov().keyframes!.map((k) => [k.t, k.size])).toEqual([
      [0, 0.1],
      [2000, 0.3],
    ])
    expect(screen.getAllByTestId('keyframe-mark')).toHaveLength(2)
    expect(screen.getByTestId('overlay-keyframe')).toHaveAttribute('aria-pressed', 'true')
    // Giữa hai keyframe: thanh trượt hiện giá trị nội suy.
    act(() => useEditorStore.getState().setTime(1000))
    expect(screen.getByTestId('overlay-size-input')).toHaveValue('20%')
    expect(screen.getByTestId('overlay-keyframe')).toHaveAttribute('aria-pressed', 'false')
    // Kiểu chuyển, nhảy tới keyframe trước.
    await userEvent.click(screen.getByTestId('overlay-kf-prev'))
    expect(useEditorStore.getState().time).toBe(0)
    await userEvent.click(screen.getByTestId('kf-ease-easeOut'))
    expect(ov().keyframes![0]!.ease).toBe('easeOut')
    // Bỏ keyframe đầu, rồi xóa hết: lớp đứng yên ở tư thế hiện tại.
    await userEvent.click(screen.getByTestId('overlay-keyframe'))
    expect(ov().keyframes).toHaveLength(1)
    await userEvent.click(screen.getByTestId('overlay-kf-clear'))
    expect(ov()).not.toHaveProperty('keyframes')
    expect(ov().size).toBe(0.3)
  })

  it('lớp phủ: hoạt ảnh vào / ra / lặp, độ mờ, hòa trộn, lật; mặt nạ cho ảnh', async () => {
    setup()
    await screen.findByTestId('editor-title')
    const ov = () => useEditorStore.getState().edit!.overlays.at(-1)!
    await userEvent.click(screen.getByTestId('lib-text'))
    await userEvent.click(screen.getByTestId('text-add-title'))
    await userEvent.click(screen.getByTestId('anim-in-typewriter'))
    await userEvent.click(screen.getByTestId('anim-out-zoomOut'))
    const inMs = screen.getByTestId('anim-in-ms-input')
    await userEvent.clear(inMs)
    await userEvent.type(inMs, '1.2{Enter}')
    expect(ov().anim).toMatchObject({ in: 'typewriter', inMs: 1200, out: 'zoomOut' })
    fireEvent.change(screen.getByTestId('overlay-opacity'), { target: { value: '0.4' } })
    expect(ov().opacity).toBe(0.4)
    fireEvent.change(screen.getByTestId('overlay-blend'), { target: { value: 'screen' } })
    await userEvent.click(screen.getByTestId('overlay-flip-h'))
    expect(ov()).toMatchObject({ blend: 'screen', flipH: true })
    // Chữ không có mặt nạ; ảnh thì có, kiểu đánh chữ chỉ dành cho chữ.
    expect(screen.queryByTestId('mask-panel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('lib-media'))
    const items = await screen.findAllByTestId('meme-item')
    await userEvent.click(items[0]!)
    await waitFor(() => expect(ov().kind).toBe('image'))
    expect(screen.queryByTestId('anim-in-typewriter')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mask-heart'))
    fireEvent.change(screen.getByTestId('mask-feather'), { target: { value: '0.3' } })
    await userEvent.click(screen.getByTestId('mask-invert'))
    expect(ov().mask).toMatchObject({ shape: 'heart', feather: 0.3, invert: true })
    await userEvent.click(screen.getByTestId('mask-none'))
    expect(ov().mask).toBeUndefined()
  })
  it('đường cong tốc độ: chọn mẫu, chỉnh điểm bằng phím, về tốc độ cố định', async () => {
    setup()
    await screen.findByTestId('editor')
    const clip = () => useEditorStore.getState().edit!.clips[0]!
    fireEvent.pointerDown(screen.getAllByTestId('timeline-clip')[0]!)
    await userEvent.click(screen.getByTestId('clip-tab-speed'))
    await userEvent.click(screen.getByTestId('speed-mode-curve'))
    expect(clip().speedCurve?.preset).toBe('montage')
    expect(screen.getByTestId('clip-curve-badge')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('curve-bullet'))
    expect(clip().speedCurve?.preset).toBe('bullet')
    const before = screen.getByTestId('clip-length').textContent
    // Điểm giữa: mũi tên lên = nhanh hơn → clip ngắn lại; mẫu thành "tùy chỉnh".
    const point = screen.getByTestId('curve-point-2')
    point.focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(clip().speedCurve?.preset).toBe('custom')
    expect(clip().speedCurve!.points[2]!.v).toBeGreaterThan(0.25)
    expect(screen.getByTestId('clip-length').textContent).not.toBe(before)
    await userEvent.click(screen.getByTestId('speed-mode-fixed'))
    expect(clip()).not.toHaveProperty('speedCurve')
    expect(screen.getByTestId('clip-speed-slider')).toBeInTheDocument()
  })

  it('phát ngược: tạo bản đảo ngược ở nền rồi báo sẵn sàng; độ mờ của clip', async () => {
    const api = setup()
    await screen.findByTestId('editor')
    const clip = () => useEditorStore.getState().edit!.clips[0]!
    fireEvent.pointerDown(screen.getAllByTestId('timeline-clip')[0]!)
    await userEvent.click(screen.getByTestId('clip-reverse'))
    expect(clip().reversed).toBe(true)
    expect(api.reverseClip).toHaveBeenCalledWith(
      sampleSummary.folder,
      clip().sourceStart,
      clip().sourceEnd,
    )
    expect(await screen.findByTestId('clip-reverse-status')).toHaveTextContent('Đã sẵn sàng')
    expect(screen.getByTestId('clip-reverse-badge')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('clip-reverse'))
    expect(clip()).not.toHaveProperty('reversed')
    fireEvent.change(screen.getByTestId('clip-opacity'), { target: { value: '0.5' } })
    expect(clip().opacity).toBe(0.5)
    fireEvent.change(screen.getByTestId('clip-opacity'), { target: { value: '1' } })
    expect(clip()).not.toHaveProperty('opacity')
  })
})
