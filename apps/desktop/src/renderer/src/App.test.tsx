import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretKey } from '@lumora/core'
import type { LumoraApi } from '@shared/ipc'
import { App } from './App'
import i18n from './i18n'
import { useAppStore } from './store/app'
import { createFakeApi as makeFakeApi } from './test/fake-api'

const CLAUDE_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234'

const createFakeApi = (options?: Parameters<typeof makeFakeApi>[0]) => makeFakeApi(options).api

const card = (key: SecretKey) => within(screen.getByTestId(`key-card-${key}`))
const clickInCard = (key: SecretKey, name: string) =>
  userEvent.click(card(key).getByRole('button', { name }))

async function renderApp(api: LumoraApi) {
  window.lumora = api
  render(<App />)
  await screen.findByTestId('nav-record')
}

beforeEach(async () => {
  useAppStore.setState({
    ready: false,
    page: 'record',
    settings: null,
    secrets: null,
    appInfo: null,
  })
  await act(() => i18n.changeLanguage('vi'))
})

describe('App', () => {
  it('hiển thị thanh điều hướng tiếng Việt', async () => {
    await renderApp(createFakeApi())
    expect(screen.getByTestId('nav-record')).toHaveTextContent('Quay')
    expect(screen.getByTestId('nav-settings')).toHaveTextContent('Cài đặt')
    expect(screen.getByRole('heading', { name: 'Quay màn hình' })).toBeInTheDocument()
  })

  it('chuyển trang khi bấm menu', async () => {
    await renderApp(createFakeApi())
    await userEvent.click(screen.getByTestId('nav-projects'))
    expect(screen.getByRole('heading', { name: 'Dự án' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-projects')).toHaveAttribute('aria-current', 'page')
  })

  it('đổi ngôn ngữ sang tiếng Anh', async () => {
    await renderApp(createFakeApi())
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.selectOptions(screen.getByLabelText('Ngôn ngữ'), 'en')
    await waitFor(() => expect(screen.getByTestId('nav-record')).toHaveTextContent('Record'))
    expect(document.documentElement.lang).toBe('en')
  })

  it('đổi giao diện sáng/tối', async () => {
    await renderApp(createFakeApi())
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.selectOptions(screen.getByLabelText('Giao diện'), 'light')
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
  })
})

describe('Cài đặt API key', () => {
  it('báo lỗi định dạng và không lưu key sai', async () => {
    const api = createFakeApi()
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.type(screen.getByLabelText('Claude (Anthropic)'), 'sk-wrong-key-1234567890')
    await clickInCard('anthropic', 'Lưu')
    expect(screen.getByTestId('key-feedback-anthropic')).toHaveTextContent('sk-ant-')
    expect(screen.getByTestId('key-status-anthropic')).toHaveTextContent('Chưa nhập')
  })

  it('lưu key hợp lệ và chỉ hiện dạng rút gọn', async () => {
    await renderApp(createFakeApi())
    await userEvent.click(screen.getByTestId('nav-settings'))
    const input = screen.getByLabelText('Claude (Anthropic)')
    await userEvent.type(input, CLAUDE_KEY)
    await clickInCard('anthropic', 'Lưu')
    await waitFor(() =>
      expect(screen.getByTestId('key-status-anthropic')).toHaveTextContent('sk-a••••••••1234'),
    )
    expect(input).toHaveValue('')
    expect(screen.getByTestId('key-feedback-anthropic')).toHaveTextContent('Đã lưu key')
  })

  it('kiểm tra key gọi main process và hiện kết quả', async () => {
    const api = createFakeApi()
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.type(screen.getByLabelText('ElevenLabs'), 'x'.repeat(32))
    await clickInCard('elevenlabs', 'Kiểm tra')
    await waitFor(() =>
      expect(screen.getByTestId('key-feedback-elevenlabs')).toHaveTextContent('Key hợp lệ'),
    )
    expect(api.testSecret).toHaveBeenCalledWith('elevenlabs', 'x'.repeat(32))
  })

  it('hiện lỗi khi key không đúng', async () => {
    const api = createFakeApi()
    vi.mocked(api.testSecret).mockResolvedValueOnce({ ok: false, reason: 'invalid' })
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.type(screen.getByLabelText('ElevenLabs'), 'x'.repeat(32))
    await clickInCard('elevenlabs', 'Kiểm tra')
    await waitFor(() =>
      expect(screen.getByTestId('key-feedback-elevenlabs')).toHaveTextContent('đã bị thu hồi'),
    )
  })

  it('xóa key đã lưu', async () => {
    await renderApp(createFakeApi())
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.type(screen.getByLabelText('Claude (Anthropic)'), CLAUDE_KEY)
    await clickInCard('anthropic', 'Lưu')
    await clickInCard('anthropic', 'Xóa')
    await waitFor(() =>
      expect(screen.getByTestId('key-status-anthropic')).toHaveTextContent('Chưa nhập'),
    )
  })

  it('khóa ô nhập khi máy không hỗ trợ mã hóa', async () => {
    await renderApp(createFakeApi({ encryptionAvailable: false }))
    await userEvent.click(screen.getByTestId('nav-settings'))
    expect(screen.getByRole('alert')).toHaveTextContent('không hỗ trợ mã hóa')
    expect(screen.getByLabelText('Claude (Anthropic)')).toBeDisabled()
  })
})

describe('Thông báo cập nhật', () => {
  it('bản mới tải xong: hiện thanh báo ở mọi trang, bấm để cập nhật hoặc để sau', async () => {
    const fake = makeFakeApi()
    await renderApp(fake.api)
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    act(() => fake.emitUpdate({ state: 'ready', version: '0.2.0' }))
    expect(await screen.findByTestId('update-banner')).toHaveTextContent('Lumora 0.2.0')
    await userEvent.click(screen.getByTestId('nav-projects'))
    expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('update-banner-install'))
    expect(fake.api.installUpdate).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Để sau' }))
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
  })
})

describe('Thanh tiêu đề cửa sổ không viền', () => {
  it('nút đèn giao thông gọi đúng lệnh cửa sổ; bấm đúp để phóng to', async () => {
    const api = createFakeApi()
    await renderApp(api)
    const bar = await screen.findByTestId('title-bar')
    await userEvent.click(screen.getByTestId('window-minimize'))
    expect(api.minimizeWindow).toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('window-maximize'))
    expect(api.toggleMaximizeWindow).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByTestId('window-maximize')).toHaveAttribute('aria-label', 'Thu về'),
    )
    await userEvent.dblClick(bar)
    expect(api.toggleMaximizeWindow).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByTestId('window-close'))
    expect(api.closeWindow).toHaveBeenCalled()
  })
})

describe('Màu chủ đạo', () => {
  it('mặc định xanh dương; chọn màu khác thì cả app đổi theo', async () => {
    await renderApp(createFakeApi())
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--lm-accent')).toBe('#1ed6d6'),
    )
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.click(screen.getByTestId('accent-#30d158'))
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--lm-accent')).toBe('#30d158'),
    )
    expect(screen.getByTestId('accent-#30d158')).toHaveAttribute('aria-pressed', 'true')
    // Giảm trong suốt: tắt kính mờ trên toàn app.
    expect(document.documentElement.dataset.glass).toBe('on')
    await userEvent.click(screen.getByTestId('settings-reduce-transparency'))
    await waitFor(() => expect(document.documentElement.dataset.glass).toBe('off'))
  })
})
