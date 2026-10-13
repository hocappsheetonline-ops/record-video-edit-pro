import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretKey, WhisperModel } from '@lumora/core'
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

describe('AI cục bộ (Ollama)', () => {
  it('bật, kiểm tra kết nối và chọn model đã tải', async () => {
    const api = createFakeApi()
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.click(screen.getByText(/Nâng cao/))
    await userEvent.click(screen.getByTestId('local-ai-enabled'))
    await waitFor(() => expect(useAppStore.getState().settings?.localAi.enabled).toBe(true))
    await userEvent.click(screen.getByTestId('local-ai-check'))
    expect(await screen.findByTestId('local-ai-status')).toHaveTextContent('2 model')
    expect(api.listLocalModels).toHaveBeenCalledWith('http://127.0.0.1:11434')
    await userEvent.selectOptions(screen.getByTestId('local-ai-model'), 'llama3.2')
    await waitFor(() => expect(useAppStore.getState().settings?.localAi.model).toBe('llama3.2'))
    // Tải model ngay trong app: tiến độ hiện rồi báo xong và tải lại danh sách.
    await userEvent.click(screen.getByTestId('local-ai-pull'))
    await waitFor(() =>
      expect(screen.getByTestId('local-ai-status')).toHaveTextContent('Đã tải model llama3.2'),
    )
    expect(api.pullLocalModel).toHaveBeenCalledWith('http://127.0.0.1:11434', 'llama3.2')
    await userEvent.click(screen.getByTestId('local-ai-install'))
    await waitFor(() =>
      expect(screen.getByTestId('local-ai-status')).toHaveTextContent('mở bộ cài Ollama'),
    )
    expect(api.installOllama).toHaveBeenCalled()
    // Chọn nhanh model và chạy thử đo tốc độ.
    await userEvent.click(screen.getByTestId('local-ai-pick-qwen2.5:3b'))
    await waitFor(() => expect(useAppStore.getState().settings?.localAi.model).toBe('qwen2.5:3b'))
    await userEvent.click(screen.getByTestId('local-ai-benchmark'))
    await waitFor(() =>
      expect(screen.getByTestId('local-ai-status')).toHaveTextContent(
        'Nạp 1.2 s · 24.5 token/giây · nhanh, dùng tốt',
      ),
    )
    expect(api.benchmarkLocalModel).toHaveBeenCalledWith('http://127.0.0.1:11434', 'qwen2.5:3b')
    api.listLocalModels.mockRejectedValueOnce(new Error('ollama_offline'))
    await userEvent.click(screen.getByTestId('local-ai-check'))
    await waitFor(() =>
      expect(screen.getByTestId('local-ai-status')).toHaveTextContent('Không kết nối được'),
    )
  })
})

describe('Giọng nói cục bộ (whisper.cpp + Piper)', () => {
  it('hiện trạng thái, cài whisper.cpp, chọn và tải model, bật', async () => {
    const api = createFakeApi()
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.click(screen.getByText(/Nâng cao/))
    // Trạng thái và danh mục tải lúc mở trang: chưa cài gì, hai model, hai giọng (tiếng Việt trước).
    expect(await screen.findByTestId('local-speech-whisper-status')).toHaveTextContent(
      'Chưa cài whisper.cpp',
    )
    expect(screen.getByTestId('local-speech-piper-status')).toHaveTextContent('Chưa cài Piper')
    expect(await screen.findByTestId('local-speech-model-small')).toHaveTextContent('488 MB')
    expect(screen.getByTestId('local-speech-model-large-v3-turbo-q5_0')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const groups = screen
      .getByTestId('local-speech-piper')
      .querySelectorAll('[data-testid^="local-speech-voices-"]')
    expect([...groups].map((g) => g.getAttribute('data-testid'))).toEqual([
      'local-speech-voices-vi',
      'local-speech-voices-en',
    ])
    expect(screen.queryByTestId('local-speech-unsupported')).toBeNull()
    // Cài whisper.cpp: tiến độ kind 'speech' hiện trên thanh, xong thì báo và tải lại trạng thái.
    api.localSpeechStatus.mockResolvedValue({
      supported: true,
      platform: 'win32',
      whisper: { installed: true, models: [] },
      piper: { installed: false, voices: [] },
    })
    await userEvent.click(screen.getByTestId('local-speech-install-whisper'))
    expect(api.installLocalSpeech).toHaveBeenCalledWith('whisper')
    await waitFor(() =>
      expect(screen.getByTestId('local-speech-status')).toHaveTextContent('Đã cài whisper.cpp'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('local-speech-whisper-status')).toHaveTextContent(
        'Đã cài whisper.cpp',
      ),
    )
    expect(screen.queryByTestId('local-speech-install-whisper')).toBeNull()
    // Chọn model khác rồi tải: cài đặt đổi theo chip, nút tải gọi đúng model.
    await userEvent.click(screen.getByTestId('local-speech-model-small'))
    await waitFor(() =>
      expect(useAppStore.getState().settings?.localSpeech.whisperModel).toBe('small'),
    )
    api.localSpeechStatus.mockResolvedValue({
      supported: true,
      platform: 'win32',
      whisper: { installed: true, models: ['small'] },
      piper: { installed: false, voices: [] },
    })
    await userEvent.click(screen.getByTestId('local-speech-download-model'))
    expect(api.downloadLocalSpeech).toHaveBeenCalledWith('model', 'small')
    await waitFor(() =>
      expect(screen.getByTestId('local-speech-status')).toHaveTextContent('Đã tải small'),
    )
    // Model đã tải: chip có dấu check, nút tải đổi thành xóa.
    expect(await screen.findByTestId('local-speech-remove-model')).toBeInTheDocument()
    expect(screen.getByTestId('local-speech-model-small')).toHaveAttribute('data-installed', 'true')
    await userEvent.click(screen.getByTestId('local-speech-remove-model'))
    expect(api.removeLocalSpeech).toHaveBeenCalledWith('model', 'small')
    // Bật giọng nói cục bộ.
    await userEvent.click(screen.getByTestId('local-speech-enable'))
    await waitFor(() => expect(useAppStore.getState().settings?.localSpeech.enabled).toBe(true))
  })

  it('thanh tiến độ hiện MB đã tải từ sự kiện kind speech; giọng Piper chọn và tải được', async () => {
    const fake = makeFakeApi()
    const api = fake.api
    // Giữ lời gọi tải treo để xem thanh tiến độ trong lúc chạy.
    let finish = () => {}
    api.downloadLocalSpeech.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.click(screen.getByText(/Nâng cao/))
    await screen.findByTestId('local-speech-voice-en_US-lessac-medium')
    await userEvent.click(screen.getByTestId('local-speech-voice-en_US-lessac-medium'))
    await waitFor(() =>
      expect(useAppStore.getState().settings?.localSpeech.piperVoice).toBe('en_US-lessac-medium'),
    )
    await userEvent.click(screen.getByTestId('local-speech-download-voice'))
    expect(api.downloadLocalSpeech).toHaveBeenCalledWith('voice', 'en_US-lessac-medium')
    act(() => {
      fake.emitLocalAiProgress({
        kind: 'speech',
        status: 'download',
        item: 'en_US-lessac-medium',
        completed: 30_000_000,
        total: 60_000_000,
      })
    })
    expect(screen.getByTestId('local-speech-progress')).toHaveTextContent(
      'Đang tải en_US-lessac-medium… 30 / 60 MB · 50%',
    )
    // Tiến độ của Ollama không lẫn vào thanh này.
    act(() => {
      fake.emitLocalAiProgress({ kind: 'pull', status: 'x', completed: 1, total: 100 })
    })
    expect(screen.getByTestId('local-speech-progress')).toHaveTextContent('30 / 60 MB')
    act(() => finish())
    await waitFor(() => expect(screen.queryByTestId('local-speech-progress')).toBeNull())
    expect(screen.getByTestId('local-speech-status')).toHaveTextContent(
      'Đã tải en_US-lessac-medium',
    )
  })

  it('máy không hỗ trợ: báo thay vì hiện nút cài; lỗi tải hiện mã', async () => {
    const api = createFakeApi()
    api.localSpeechStatus.mockResolvedValue({
      supported: false,
      platform: 'linux',
      whisper: { installed: false, models: [] },
      piper: { installed: false, voices: [] },
    })
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await userEvent.click(screen.getByText(/Nâng cao/))
    expect(await screen.findByTestId('local-speech-unsupported')).toHaveTextContent('linux')
    expect(screen.queryByTestId('local-speech-install-whisper')).toBeNull()
    expect(screen.queryByTestId('local-speech-download-voice')).toBeNull()
    // Máy hỗ trợ nhưng tải lỗi: câu báo có mã HTTP.
    api.localSpeechStatus.mockResolvedValue({
      supported: true,
      platform: 'win32',
      whisper: { installed: false, models: [] },
      piper: { installed: false, voices: [] },
    })
    await userEvent.click(screen.getByTestId('local-speech-refresh'))
    api.installLocalSpeech.mockRejectedValueOnce(new Error('local_speech_download:404'))
    await userEvent.click(await screen.findByTestId('local-speech-install-piper'))
    await waitFor(() =>
      expect(screen.getByTestId('local-speech-status')).toHaveTextContent('mã 404'),
    )
  })
})

describe('Thiết lập AI trên máy một chạm', () => {
  const step = (key: string) => screen.getByTestId(`local-setup-step-${key}`)
  const openSettings = async () => {
    await userEvent.click(screen.getByTestId('nav-settings'))
    // Chờ kiểm tra lúc gắn thẻ xong (Ollama giả đang chạy với hai model).
    await waitFor(() => expect(step('ollama')).toHaveAttribute('data-state', 'done'))
  }

  it('danh sách sáu việc: Ollama và model đã xong, giọng nói còn thiếu; nút ghi "Hoàn tất thiết lập"', async () => {
    await renderApp(createFakeApi())
    await openSettings()
    expect(
      within(screen.getByTestId('local-setup-card')).getAllByTestId(/^local-setup-step-/),
    ).toHaveLength(6)
    expect(step('ollamaModel')).toHaveAttribute('data-state', 'done')
    expect(step('ollamaModel')).toHaveTextContent('Model qwen2.5:7b đã tải')
    for (const key of ['whisper', 'whisperModel', 'piper', 'piperVoice'])
      expect(step(key)).toHaveAttribute('data-state', 'missing')
    expect(step('piperVoice')).toHaveTextContent('Giọng vi_VN-vais1000-medium đã tải')
    const run = screen.getByTestId('local-setup-run')
    expect(run).toHaveTextContent('Hoàn tất thiết lập')
    expect(run).toBeEnabled()
    expect(screen.queryByTestId('local-setup-cancel')).toBeNull()
    expect(screen.queryByTestId('local-setup-progress')).toBeNull()
  })

  it('bấm một nút: cài whisper.cpp → tải model → cài Piper → tải giọng, xong thì bật cả hai', async () => {
    const fake = makeFakeApi()
    const api = fake.api
    // Trạng thái giả nhớ những gì đã cài / tải để danh sách cập nhật sau mỗi bước.
    const installed = {
      whisper: false,
      piper: false,
      models: [] as WhisperModel[],
      voices: [] as string[],
    }
    api.localSpeechStatus.mockImplementation(async () => ({
      supported: true,
      platform: 'win32',
      whisper: { installed: installed.whisper, models: [...installed.models] },
      piper: { installed: installed.piper, voices: [...installed.voices] },
    }))
    api.installLocalSpeech.mockImplementation(async (tool) => {
      installed[tool] = true
    })
    // Giữ lời gọi tải model Whisper treo để xem dòng trạng thái và thanh tiến độ giữa chừng.
    let finishModel = () => {}
    api.downloadLocalSpeech.mockImplementation(
      (kind, id) =>
        new Promise<void>((resolve) => {
          const done = () => {
            if (kind === 'model') installed.models.push(id as WhisperModel)
            else installed.voices.push(id)
            resolve()
          }
          if (kind === 'model') finishModel = done
          else done()
        }),
    )
    await renderApp(api)
    await openSettings()
    await userEvent.click(screen.getByTestId('local-setup-run'))
    await waitFor(() =>
      expect(screen.getByTestId('local-setup-status')).toHaveTextContent(
        'Bước 2/4: Đang tải model Whisper large-v3-turbo-q5_0',
      ),
    )
    expect(step('whisper')).toHaveAttribute('data-state', 'done')
    expect(step('whisperModel')).toHaveAttribute('data-state', 'busy')
    expect(screen.getByTestId('local-setup-run')).toBeDisabled()
    expect(screen.getByTestId('local-setup-cancel')).toBeInTheDocument()
    act(() => {
      fake.emitLocalAiProgress({
        kind: 'speech',
        status: 'download',
        item: 'large-v3-turbo-q5_0',
        completed: 120_000_000,
        total: 574_000_000,
      })
    })
    expect(screen.getByTestId('local-setup-status')).toHaveTextContent('· 120 / 574 MB')
    expect(screen.getByTestId('local-setup-progress')).toHaveAttribute('aria-valuenow', '21')
    act(() => finishModel())
    await waitFor(() => expect(screen.getByTestId('local-setup-status')).toHaveTextContent('Xong!'))
    // Đúng thứ tự: whisper.cpp, model Whisper, Piper, giọng.
    expect(api.installLocalSpeech.mock.calls).toEqual([['whisper'], ['piper']])
    expect(api.downloadLocalSpeech.mock.calls).toEqual([
      ['model', 'large-v3-turbo-q5_0'],
      ['voice', 'vi_VN-vais1000-medium'],
    ])
    const order = [
      api.installLocalSpeech.mock.invocationCallOrder[0],
      api.downloadLocalSpeech.mock.invocationCallOrder[0],
      api.installLocalSpeech.mock.invocationCallOrder[1],
      api.downloadLocalSpeech.mock.invocationCallOrder[1],
    ]
    expect(order).toEqual([...order].sort((a, b) => a! - b!))
    expect(api.installOllama).not.toHaveBeenCalled()
    expect(api.pullLocalModel).not.toHaveBeenCalled()
    for (const key of ['ollama', 'ollamaModel', 'whisper', 'whisperModel', 'piper', 'piperVoice'])
      expect(step(key)).toHaveAttribute('data-state', 'done')
    const run = screen.getByTestId('local-setup-run')
    expect(run).toHaveTextContent('Đã sẵn sàng ✓')
    expect(run).toBeDisabled()
    expect(screen.queryByTestId('local-setup-progress')).toBeNull()
    expect(useAppStore.getState().settings?.localAi.enabled).toBe(true)
    expect(useAppStore.getState().settings?.localSpeech.enabled).toBe(true)
    expect(screen.getByTestId('local-setup-use-ai')).toBeChecked()
    expect(screen.getByTestId('local-setup-use-speech')).toBeChecked()
  })

  it('Ollama tắt: cài Ollama trước, hỏi lại mỗi 3 giây tới khi lên, rồi mới tải model', async () => {
    const api = createFakeApi()
    api.listLocalModels.mockRejectedValue(new Error('ollama_offline'))
    await renderApp(api)
    await userEvent.click(screen.getByTestId('nav-settings'))
    await waitFor(() => expect(step('ollama')).toHaveAttribute('data-state', 'missing'))
    expect(step('ollamaModel')).toHaveAttribute('data-state', 'missing')
    expect(screen.getByTestId('local-setup-run')).toHaveTextContent('Thiết lập tất cả')
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByTestId('local-setup-run'))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(api.installOllama).toHaveBeenCalledTimes(1)
      expect(api.pullLocalModel).not.toHaveBeenCalled()
      expect(screen.getByTestId('local-setup-status')).toHaveTextContent(
        'Bước 1/6: Đang chờ bạn cài Ollama… bấm Next trong bộ cài',
      )
      expect(step('ollama')).toHaveAttribute('data-state', 'busy')
      // Người dùng cài xong: lần hỏi tiếp theo (3 giây sau) thấy Ollama chạy nhưng chưa có model.
      const asked = api.listLocalModels.mock.calls.length
      api.listLocalModels.mockResolvedValue(['llama3.2'])
      await act(() => vi.advanceTimersByTimeAsync(3000))
      expect(api.listLocalModels.mock.calls.length).toBeGreaterThan(asked)
    } finally {
      vi.useRealTimers()
    }
    await waitFor(() => expect(step('ollama')).toHaveAttribute('data-state', 'done'))
    await waitFor(() =>
      expect(api.pullLocalModel).toHaveBeenCalledWith('http://127.0.0.1:11434', 'qwen2.5:7b'),
    )
    expect(api.installOllama.mock.invocationCallOrder[0]).toBeLessThan(
      api.pullLocalModel.mock.invocationCallOrder[0]!,
    )
  })

  it('bước lỗi thì dừng, nêu tên bước và lý do, nút vẫn còn để thử lại', async () => {
    const api = createFakeApi()
    api.installLocalSpeech.mockRejectedValueOnce(new Error('local_speech_download:404'))
    await renderApp(api)
    await openSettings()
    await userEvent.click(screen.getByTestId('local-setup-run'))
    await waitFor(() =>
      expect(screen.getByTestId('local-setup-status')).toHaveTextContent(
        'Lỗi ở bước "whisper.cpp đã cài": Không tải được (mã 404)',
      ),
    )
    expect(step('whisper')).toHaveAttribute('data-state', 'error')
    expect(api.downloadLocalSpeech).not.toHaveBeenCalled()
    expect(screen.getByTestId('local-setup-run')).toBeEnabled()
    expect(screen.getByTestId('local-setup-run')).toHaveTextContent('Hoàn tất thiết lập')
    expect(useAppStore.getState().settings?.localSpeech.enabled).toBe(false)
  })

  it('hai công tắc bật / tắt AI và giọng nói trên máy', async () => {
    await renderApp(createFakeApi())
    await openSettings()
    await userEvent.click(screen.getByTestId('local-setup-use-ai'))
    await waitFor(() => expect(useAppStore.getState().settings?.localAi.enabled).toBe(true))
    await userEvent.click(screen.getByTestId('local-setup-use-speech'))
    await waitFor(() => expect(useAppStore.getState().settings?.localSpeech.enabled).toBe(true))
    await userEvent.click(screen.getByTestId('local-setup-use-ai'))
    await waitFor(() => expect(useAppStore.getState().settings?.localAi.enabled).toBe(false))
    expect(useAppStore.getState().settings?.localSpeech.enabled).toBe(true)
  })

  it('phần Nâng cao thu gọn sẵn và chứa hai thẻ chi tiết cũ', async () => {
    await renderApp(createFakeApi())
    await openSettings()
    const details = screen.getByTestId('local-setup-advanced')
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByTestId('local-ai-enabled')).toBeInTheDocument()
    expect(within(details).getByTestId('local-speech-enable')).toBeInTheDocument()
    await userEvent.click(screen.getByText(/Nâng cao/))
    expect(details).toHaveAttribute('open')
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
