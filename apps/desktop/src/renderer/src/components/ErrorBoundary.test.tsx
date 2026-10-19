import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { useAppStore } from '../store/app'
import { createFakeApi } from '../test/fake-api'
import { ErrorBoundary } from './ErrorBoundary'

function Thrower({ fail }: { fail: boolean }) {
  if (fail) throw new Error('boom render')
  return <p data-testid="fine">ok</p>
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
  useAppStore.setState({ page: 'editor', editorFolder: 'a.lumora' })
})

describe('ErrorBoundary', () => {
  it('lỗi khi dựng giao diện: hiện màn hình lỗi thay vì trang trắng / đen, ghi vào nhật ký', async () => {
    const api = createFakeApi().api
    window.lumora = api
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Thrower fail />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('crash-screen')).toHaveTextContent('Trình chỉnh sửa gặp lỗi')
    expect(screen.getByTestId('crash-screen')).toHaveTextContent('boom render')
    expect(api.reportError).toHaveBeenCalledWith(expect.stringContaining('boom render'))

    // "Thử mở lại" dựng lại cây con.
    rerender(
      <ErrorBoundary resetKey="a">
        <Thrower fail={false} />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByTestId('crash-retry'))
    expect(screen.getByTestId('fine')).toBeInTheDocument()

    // Lỗi lại rồi "Về Dự án": chuyển trang và bỏ màn hình lỗi.
    rerender(
      <ErrorBoundary resetKey="a">
        <Thrower fail />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('crash-screen')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('crash-back'))
    expect(useAppStore.getState().page).toBe('projects')
    quiet.mockRestore()
  })

  it('đổi khóa (mở dự án khác) tự bỏ màn hình lỗi', () => {
    window.lumora = createFakeApi().api
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Thrower fail />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('crash-screen')).toBeInTheDocument()
    rerender(
      <ErrorBoundary resetKey="b">
        <Thrower fail={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('fine')).toBeInTheDocument()
    quiet.mockRestore()
  })
})
