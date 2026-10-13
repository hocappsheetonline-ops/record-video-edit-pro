import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@lumora/core'
import type { SecretsStatus } from '@shared/ipc'
import i18n from '../i18n'
import { useAiStatus } from '../ai/status'
import { useJobs } from '../editor/jobs'
import { useAppStore } from '../store/app'
import { createFakeApi } from '../test/fake-api'
import { AiStatusBadge } from './AiStatusBadge'

const NO_SECRETS: SecretsStatus = {
  elevenlabs: { state: 'missing' },
  anthropic: { state: 'missing' },
  pixabay: { state: 'missing' },
}

beforeEach(async () => {
  useAppStore.setState({
    page: 'editor',
    settingsSection: null,
    settings: { ...DEFAULT_SETTINGS },
    secrets: NO_SECRETS,
  })
  useAiStatus.setState({
    text: { engine: 'none', ready: false, detail: '', problem: 'no_key' },
    speech: { engine: 'none', ready: false, detail: '', problem: 'no_key', missing: [] },
    checkedAt: 0,
  })
  useJobs.setState({ jobs: [], toasts: [] })
  await act(() => i18n.changeLanguage('vi'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AiStatusBadge', () => {
  it('chưa có key, chưa bật AI trên máy: báo chưa sẵn sàng, bấm mở mục AI trong Cài đặt', async () => {
    window.lumora = createFakeApi().api
    render(<AiStatusBadge />)
    const badge = screen.getByTestId('ai-status-badge')
    await waitFor(() => expect(useAiStatus.getState().checkedAt).toBeGreaterThan(0))
    expect(badge).toHaveAttribute('data-state', 'off')
    expect(badge).toHaveTextContent('AI chưa sẵn sàng')
    expect(badge.getAttribute('aria-label')).toContain('Chưa có key và chưa bật AI trên máy')
    await userEvent.click(badge)
    expect(useAppStore.getState().page).toBe('settings')
    expect(useAppStore.getState().settingsSection).toBe('ai')
  })

  it('Ollama có model và đã lưu key ElevenLabs: sẵn sàng, hiện tên cả hai', async () => {
    window.lumora = createFakeApi().api
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        localAi: { ...DEFAULT_SETTINGS.localAi, enabled: true, model: 'qwen2.5:7b' },
      },
      secrets: { ...NO_SECRETS, elevenlabs: { state: 'saved', masked: 'sk-…' } },
    })
    render(<AiStatusBadge />)
    const badge = screen.getByTestId('ai-status-badge')
    await waitFor(() => expect(badge).toHaveAttribute('data-state', 'ready'))
    expect(screen.getByTestId('ai-status-text')).toHaveTextContent(
      'AI: Ollama qwen2.5:7b · Giọng: ElevenLabs',
    )
    expect(badge.getAttribute('aria-label')).toContain('Ollama qwen2.5:7b')
    expect(badge.getAttribute('aria-label')).toContain('ElevenLabs')
  })

  it('bật AI trên máy nhưng Ollama chưa chạy: báo lý do', async () => {
    const fake = createFakeApi()
    fake.api.listLocalModels.mockRejectedValue(new Error('ECONNREFUSED'))
    window.lumora = fake.api
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, localAi: { ...DEFAULT_SETTINGS.localAi, enabled: true } },
      secrets: { ...NO_SECRETS, elevenlabs: { state: 'saved', masked: 'sk-…' } },
    })
    render(<AiStatusBadge />)
    const badge = screen.getByTestId('ai-status-badge')
    await waitFor(() => expect(badge).toHaveAttribute('data-state', 'partial'))
    expect(badge).toHaveTextContent('AI sẵn sàng một phần')
    expect(badge.getAttribute('aria-label')).toContain('Ollama chưa chạy')
  })

  it('việc AI đang chạy: hiện tên việc và thời gian đã chạy tăng mỗi giây', async () => {
    vi.useFakeTimers()
    window.lumora = createFakeApi().api
    const id = useJobs.getState().start('Đang tạo phụ đề', undefined, 'ai')
    render(<AiStatusBadge />)
    const badge = screen.getByTestId('ai-status-badge')
    expect(badge).toHaveAttribute('data-state', 'running')
    expect(badge).toHaveTextContent('Đang tạo phụ đề')
    expect(screen.getByTestId('ai-status-elapsed')).toHaveTextContent('0 s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.getByTestId('ai-status-elapsed')).toHaveTextContent('3 s')
    await act(async () => {
      useJobs.getState().finish(id)
    })
    expect(screen.queryByTestId('ai-status-elapsed')).not.toBeInTheDocument()
    expect(badge).not.toHaveAttribute('data-state', 'running')
  })
})
