import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { useLiveStore } from '../live/store'
import { useAppStore } from '../store/app'
import { createFakeApi } from '../test/fake-api'
import { LivePage } from './LivePage'

// Canvas, WebAudio, MediaRecorder và WebRTC không có trong jsdom: thay bằng bản giả ghi lại lời gọi.
const mocks = vi.hoisted(() => ({
  engines: [] as {
    state: Record<string, unknown>
    setOnStage: ReturnType<typeof vi.fn>
    rename: ReturnType<typeof vi.fn>
  }[],
  broadcasts: [] as { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[],
  hubs: [] as { onChange: (guests: unknown[]) => void; setOnStage: ReturnType<typeof vi.fn> }[],
}))

vi.mock('../live/studio', async () => {
  const { vi } = await import('vitest')
  class StudioEngine {
    canvas = document.createElement('canvas')
    state: Record<string, unknown> = { layout: 'grid' }
    captionSource = null
    setHost = vi.fn()
    setOnStage = vi.fn()
    rename = vi.fn()
    setScreen = vi.fn()
    isOnStage = vi.fn(() => false)
    videoOf = vi.fn(() => null)
    programStream = vi.fn(() => ({}))
    dispose = vi.fn()
    constructor(
      readonly size: { width: number; height: number },
      readonly fps = 30,
    ) {
      mocks.engines.push(this)
    }
    attach(el: HTMLElement) {
      this.canvas.dataset.testid = 'live-program'
      el.appendChild(this.canvas)
      return () => this.canvas.remove()
    }
  }
  return { StudioEngine, HOST_ID: 'host' }
})

vi.mock('../live/broadcaster', async () => {
  const { vi } = await import('vitest')
  class Broadcaster {
    start = vi.fn()
    stop = vi.fn(async () => {})
    constructor() {
      mocks.broadcasts.push(this)
    }
  }
  class CaptionChunker {
    start = vi.fn()
    stop = vi.fn()
  }
  return { Broadcaster, CaptionChunker }
})

vi.mock('../live/guest-hub', async () => {
  const { vi } = await import('vitest')
  class GuestHub {
    connect = vi.fn(async () => {})
    setOnStage = vi.fn()
    kick = vi.fn()
    close = vi.fn()
    constructor(
      _engine: unknown,
      _room: unknown,
      readonly onChange: (guests: unknown[]) => void,
    ) {
      mocks.hubs.push(this)
    }
  }
  return { GuestHub }
})

const initial = useLiveStore.getState()

beforeEach(async () => {
  mocks.engines.length = 0
  mocks.broadcasts.length = 0
  mocks.hubs.length = 0
  useLiveStore.setState(initial, true)
  useAppStore.setState({ page: 'live', openProject: null })
  await act(() => i18n.changeLanguage('vi'))
})
afterEach(() => vi.restoreAllMocks())

function setup() {
  const fake = createFakeApi()
  window.lumora = fake.api
  render(<LivePage />)
  return fake
}

async function addDestination(name: string, key: string) {
  await userEvent.type(screen.getByTestId('dest-name'), name)
  await userEvent.type(screen.getByTestId('dest-key'), key)
  await userEvent.click(screen.getByTestId('dest-add'))
}

describe('LivePage', () => {
  it('hiện khung chương trình 720p và chưa có kênh phát', async () => {
    setup()
    expect(await screen.findByTestId('live-program')).toBeInTheDocument()
    expect(mocks.engines[0]).toMatchObject({ size: { width: 1280, height: 720 } })
    expect(screen.getByText(/Chưa có kênh phát/)).toBeInTheDocument()
    expect(screen.getByTestId('live-go')).toHaveTextContent('Bắt đầu (chỉ ghi máy)')
  })

  it('thêm kênh YouTube kèm stream key (key lưu riêng, không nằm trong cấu hình)', async () => {
    const { api } = setup()
    await screen.findByTestId('live-program')
    await addDestination('Kênh chính', 'abcd-efgh')

    const item = await screen.findByTestId('destination')
    expect(item).toHaveTextContent('Kênh chính')
    expect(item).toHaveTextContent('rtmp://a.rtmp.youtube.com/live2')
    expect(item).toHaveTextContent('Đã lưu stream key')
    const saved = vi.mocked(api.updateLiveConfig).mock.calls.at(-1)![0]
    expect(saved.destinations?.[0]).toMatchObject({
      platform: 'youtube',
      name: 'Kênh chính',
      enabled: true,
    })
    expect(JSON.stringify(saved)).not.toContain('abcd-efgh')
    expect(api.setLiveSecret).toHaveBeenCalledWith(
      `stream:${saved.destinations![0]!.id}`,
      'abcd-efgh',
    )
    expect(screen.getByTestId('live-go')).toHaveTextContent('Phát trực tiếp (1 kênh)')
  })

  it('từ chối địa chỉ máy chủ không phải RTMP', async () => {
    const { api } = setup()
    await screen.findByTestId('live-program')
    await userEvent.selectOptions(screen.getByTestId('dest-platform'), 'custom')
    await userEvent.clear(screen.getByTestId('dest-server'))
    await userEvent.type(screen.getByTestId('dest-server'), 'http://example.com/live')
    await userEvent.click(screen.getByTestId('dest-add'))
    expect(screen.getByText(/phải bắt đầu bằng rtmp/)).toBeInTheDocument()
    expect(api.updateLiveConfig).not.toHaveBeenCalled()
  })

  it('phát trực tiếp: gửi luồng, hiện trạng thái, kết thúc thì mở được dự án', async () => {
    const fake = setup()
    await screen.findByTestId('live-program')
    await addDestination('YT', 'k1')
    await userEvent.click(screen.getByTestId('live-go'))

    expect(fake.api.startLive).toHaveBeenCalledWith({ width: 1280, height: 720, fps: 30 })
    expect(mocks.broadcasts[0]!.start).toHaveBeenCalled()
    const stop = await screen.findByTestId('live-stop')
    const id = useLiveStore.getState().config!.destinations[0]!.id
    act(() =>
      fake.emitLiveStatus({
        seconds: 65.4,
        bitrate: 4480,
        fps: 30,
        destinations: { [id]: { state: 'live' } },
      }),
    )
    expect(screen.getByTestId('live-clock')).toHaveTextContent('01:05')
    expect(screen.getByTestId('live-status')).toHaveTextContent('4480 kbps')
    expect(screen.getByTestId(`dest-state-${id}`)).toHaveTextContent('Đang phát')
    // Đang phát thì không được thêm/xóa kênh.
    expect(screen.getByTestId('dest-add')).toBeDisabled()

    await userEvent.click(stop)
    expect(mocks.broadcasts[0]!.stop).toHaveBeenCalled()
    expect(fake.api.stopLive).toHaveBeenCalled()
    const ended = await screen.findByTestId('live-ended')
    expect(ended).toHaveTextContent('Buổi phát đã kết thúc')
    await userEvent.click(within(ended).getByTestId('live-open-project'))
    expect(useAppStore.getState()).toMatchObject({
      page: 'projects',
      openProject: 'Live 2026.lumora',
    })
  })

  it('báo lỗi dễ hiểu khi thiếu stream key', async () => {
    const { api } = setup()
    await screen.findByTestId('live-program')
    vi.mocked(api.startLive).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'live:start': LiveError: missing_stream_key:Trang FB",
      ),
    )
    await userEvent.click(screen.getByTestId('live-go'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kênh "Trang FB" chưa có stream key.',
    )
    expect(screen.getByTestId('live-go')).toBeEnabled()
  })

  it('FFmpeg dừng vì lỗi giữa chừng: quay về trạng thái chờ và hiện lỗi', async () => {
    const fake = setup()
    await screen.findByTestId('live-program')
    await userEvent.click(screen.getByTestId('live-go'))
    await screen.findByTestId('live-stop')
    act(() => fake.emitLiveEnded({ error: 'Connection reset by peer', folder: null }))
    expect(await screen.findByTestId('live-go')).toBeInTheDocument()
    expect(mocks.broadcasts[0]!.stop).toHaveBeenCalled()
    expect(screen.getByTestId('live-ended')).toHaveTextContent('Lỗi: Connection reset by peer')
  })

  it('đổi bố cục, banner và tên host cập nhật lên khung hình', async () => {
    setup()
    await screen.findByTestId('live-program')
    const engine = mocks.engines[0]!
    await userEvent.click(screen.getByTestId('layout-solo'))
    expect(engine.state.layout).toBe('solo')
    expect(screen.getByTestId('layout-solo')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(screen.getByTestId('banner-text'), 'Chào mừng')
    await userEvent.click(screen.getByTestId('banner-toggle'))
    expect(engine.state).toMatchObject({ banner: 'Chào mừng', showBanner: true })
    await userEvent.clear(screen.getByTestId('host-name'))
    await userEvent.type(screen.getByTestId('host-name'), 'An')
    expect(engine.rename).toHaveBeenLastCalledWith('host', 'An')
    await userEvent.click(screen.getByTestId('host-on-stage'))
    expect(engine.setOnStage).toHaveBeenLastCalledWith('host', false)
    // Làm đẹp mặt cho webcam host.
    fireEvent.change(screen.getByTestId('host-beauty'), { target: { value: '1' } })
    expect((engine.state.hostBeauty as { smooth: number }).smooth).toBeCloseTo(0.72)
  })

  it('mời khách: mở phòng, hiện link, đưa khách lên sóng', async () => {
    const { api } = setup()
    await screen.findByTestId('live-program')
    await userEvent.click(screen.getByTestId('live-tab-guests'))
    await userEvent.click(screen.getByTestId('open-room'))
    expect(api.openGuestRoom).toHaveBeenCalled()
    expect(await screen.findByTestId('invite-link-local')).toHaveTextContent(
      'http://192.168.1.5:47800/join/r1',
    )
    act(() => mocks.hubs[0]!.onChange([{ id: 'g1', name: 'Bình', connected: true }]))
    const guest = await screen.findByTestId('guest')
    expect(guest).toHaveTextContent('Bình')
    expect(guest).toHaveTextContent('Sẵn sàng')
    expect(screen.getByTestId('live-tab-guests')).toHaveTextContent('(1)')
    await userEvent.click(screen.getByTestId('guest-stage-g1'))
    expect(mocks.hubs[0]!.setOnStage).toHaveBeenCalledWith('g1', true)
  })

  it('bình luận: lưu API key, đọc bình luận, hiện một bình luận lên sóng', async () => {
    const fake = setup()
    await screen.findByTestId('live-program')
    await userEvent.click(screen.getByTestId('live-tab-comments'))
    await userEvent.type(screen.getByTestId('yt-video'), 'vid123')
    await userEvent.tab()
    await userEvent.type(screen.getByTestId('yt-key'), 'AIza-key')
    await userEvent.click(screen.getByTestId('comments-toggle'))
    expect(fake.api.updateLiveConfig).toHaveBeenCalledWith({ youtubeVideoId: 'vid123' })
    expect(fake.api.setLiveSecret).toHaveBeenCalledWith('youtube-api-key', 'AIza-key')
    expect(fake.api.startComments).toHaveBeenCalledWith(['youtube'])
    expect(screen.getByTestId('comments-toggle')).toHaveTextContent('Dừng đọc bình luận')

    act(() =>
      fake.emitComments([
        { id: 'c1', platform: 'youtube', author: 'Minh', text: 'Hay quá!', at: 1 },
        { id: 'c2', platform: 'youtube', author: 'Lan', text: 'Xin chào', at: 2 },
      ]),
    )
    const items = await screen.findAllByTestId('comment')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Lan')
    await userEvent.click(within(items[1]!).getByTestId('comment-feature'))
    expect(mocks.engines[0]!.state.featured).toMatchObject({ id: 'c1', text: 'Hay quá!' })
    await userEvent.click(within(items[1]!).getByTestId('comment-feature'))
    expect(mocks.engines[0]!.state.featured).toBeNull()
  })

  it('cài đặt: đổi 1080p tạo lại khung hình đúng kích thước', async () => {
    const { api } = setup()
    await screen.findByTestId('live-program')
    await userEvent.click(screen.getByTestId('live-tab-settings'))
    await userEvent.click(screen.getByTestId('live-res-1080'))
    expect(api.updateLiveConfig).toHaveBeenCalledWith({ resolution: 1080 })
    await waitFor(() =>
      expect(mocks.engines.at(-1)).toMatchObject({ size: { width: 1920, height: 1080 } }),
    )
    await userEvent.click(screen.getByTestId('live-record-locally'))
    expect(api.updateLiveConfig).toHaveBeenCalledWith({ recordLocally: false })
  })
})
