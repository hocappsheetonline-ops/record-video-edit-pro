import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, maskSecret, type AppSettings, type SecretKey } from '@lumora/core'
import type { LumoraApi, SecretsStatus } from '@shared/ipc'
import { App } from './App'
import i18n from './i18n'
import { useAppStore } from './store/app'

const CLAUDE_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234'

/** API giả thay cho main process, giữ trạng thái trong bộ nhớ. */
function createFakeApi(options: { encryptionAvailable?: boolean } = {}) {
  let settings: AppSettings = { ...DEFAULT_SETTINGS }
  const secrets: Partial<Record<SecretKey, string>> = {}
  const status = (): SecretsStatus => ({
    elevenlabs: secrets.elevenlabs
      ? { state: 'saved', masked: maskSecret(secrets.elevenlabs) }
      : { state: 'missing' },
    anthropic: secrets.anthropic
      ? { state: 'saved', masked: maskSecret(secrets.anthropic) }
      : { state: 'missing' },
  })
  const api: LumoraApi = {
    getAppInfo: async () => ({
      name: 'Lumora',
      version: '0.1.0',
      platform: 'win32',
      encryptionAvailable: options.encryptionAvailable ?? true,
    }),
    getSettings: async () => settings,
    updateSettings: async (patch) => (settings = { ...settings, ...patch }),
    getSecretsStatus: async () => status(),
    saveSecret: async (key, value) => {
      secrets[key] = value
      return status()
    },
    deleteSecret: async (key) => {
      delete secrets[key]
      return status()
    },
    testSecret: vi.fn(async () => ({ ok: true as const })),
  }
  return api
}

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
