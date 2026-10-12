import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RECORDING_OPTIONS } from '@lumora/core'
import i18n from '../i18n'
import type { BarDeps } from '../lib/bar-controller'
import { createFakeApi } from '../test/fake-api'
import { RecordingBar } from './RecordingBar'

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

function setup(countdown: 0 | 3 = 0) {
  const fake = createFakeApi()
  window.lumora = fake.api
  vi.mocked(fake.api.getActiveSession).mockResolvedValue({
    options: {
      ...DEFAULT_RECORDING_OPTIONS,
      countdown,
      source: { kind: 'display', displayId: '1' },
    },
    rendererTracks: [],
    screenSourceId: null,
  })
  let release: () => void = () => {}
  const deps: BarDeps = {
    api: fake.api,
    openStream: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
    createRecorder: () => ({ start: async () => {}, stop: async () => {} }),
    // Đếm ngược chỉ tiếp tục khi test cho phép.
    sleep: () => new Promise<void>((resolve) => (release = resolve)),
    now: Date.now,
  }
  render(<RecordingBar deps={deps} />)
  return { ...fake, next: () => act(async () => release()) }
}

describe('RecordingBar', () => {
  it('đếm ngược rồi hiện đồng hồ và nút điều khiển', async () => {
    const { next } = setup(3)
    expect(await screen.findByTestId('countdown')).toHaveTextContent('3')
    await next()
    expect(screen.getByTestId('countdown')).toHaveTextContent('2')
    await next()
    await next()
    await waitFor(() =>
      expect(screen.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'recording'),
    )
    expect(screen.getByTestId('elapsed')).toHaveTextContent('0:00')
    expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeInTheDocument()
  })

  it('tạm dừng, tiếp tục và dừng', async () => {
    const { api } = setup()
    await waitFor(() =>
      expect(screen.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'recording'),
    )
    await userEvent.click(screen.getByTestId('bar-pause'))
    await waitFor(() =>
      expect(screen.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'paused'),
    )
    expect(api.endSegment).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('bar-pause'))
    await waitFor(() => expect(api.beginSegment).toHaveBeenCalledTimes(2))
    await userEvent.click(screen.getByTestId('bar-stop'))
    await waitFor(() => expect(api.finishRecording).toHaveBeenCalled())
  })

  it('phím tắt toàn cục từ main process điều khiển được thanh', async () => {
    const { api, emitCommand } = setup()
    await waitFor(() =>
      expect(screen.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'recording'),
    )
    act(() => emitCommand('stop'))
    await waitFor(() => expect(api.finishRecording).toHaveBeenCalled())
  })

  it('hủy cần bấm hai lần', async () => {
    const { api } = setup()
    await waitFor(() =>
      expect(screen.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'recording'),
    )
    await userEvent.click(screen.getByTestId('bar-cancel'))
    expect(api.cancelRecording).not.toHaveBeenCalled()
    expect(screen.getByTestId('recording-bar')).toHaveTextContent('Bấm lần nữa để xóa')
    await userEvent.click(screen.getByTestId('bar-cancel'))
    await waitFor(() => expect(api.cancelRecording).toHaveBeenCalled())
  })
})
