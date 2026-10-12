import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { createFakeApi } from '../test/fake-api'
import { AboutCard } from './AboutCard'

const appInfo = { name: 'Lumora', version: '0.1.0', platform: 'win32', encryptionAvailable: true }

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

function setup() {
  const fake = createFakeApi()
  window.lumora = fake.api
  render(<AboutCard appInfo={appInfo} />)
  return fake
}

describe('AboutCard', () => {
  it('kiểm tra cập nhật: báo đã là bản mới nhất', async () => {
    const { api } = setup()
    expect(screen.getByTestId('app-version')).toHaveTextContent('Lumora · Phiên bản 0.1.0')
    await userEvent.click(await screen.findByTestId('update-check'))
    expect(api.checkForUpdates).toHaveBeenCalled()
    expect(await screen.findByText('Bạn đang dùng bản mới nhất.')).toBeInTheDocument()
  })

  it('đang tải rồi sẵn sàng: hiện tiến độ và nút khởi động lại để cập nhật', async () => {
    const fake = setup()
    await screen.findByTestId('update-check')
    act(() => fake.emitUpdate({ state: 'downloading', version: '0.2.0', percent: 37 }))
    expect(screen.getByTestId('update-status')).toHaveTextContent('Đang tải bản 0.2.0… 37%')
    expect(screen.getByTestId('update-check')).toBeDisabled()
    act(() => fake.emitUpdate({ state: 'ready', version: '0.2.0' }))
    await userEvent.click(screen.getByTestId('update-install'))
    expect(fake.api.installUpdate).toHaveBeenCalled()
  })

  it('lỗi cập nhật hiện màu đỏ; bản chạy từ mã nguồn ẩn nút kiểm tra', async () => {
    const fake = setup()
    await screen.findByTestId('update-check')
    act(() => fake.emitUpdate({ state: 'error', message: 'offline' }))
    expect(screen.getByTestId('update-status')).toHaveTextContent(
      'Không kiểm tra được cập nhật: offline',
    )
    expect(screen.getByTestId('update-status')).toHaveClass('text-danger')
    act(() => fake.emitUpdate({ state: 'unsupported' }))
    expect(screen.queryByTestId('update-check')).not.toBeInTheDocument()
    expect(screen.getByTestId('update-status')).toHaveTextContent('chỉ có ở bản cài đặt')
  })

  it('mở thư mục nhật ký lỗi', async () => {
    const { api } = setup()
    await userEvent.click(screen.getByTestId('open-logs'))
    await waitFor(() => expect(api.openLogs).toHaveBeenCalled())
    vi.restoreAllMocks()
  })
})
