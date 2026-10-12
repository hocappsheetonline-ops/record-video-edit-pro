import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { useAppStore } from '../store/app'
import { createFakeApi, sampleSummary } from '../test/fake-api'
import { ProjectsPage } from './ProjectsPage'

beforeEach(async () => {
  useAppStore.setState({ page: 'projects', openProject: null })
  await act(() => i18n.changeLanguage('vi'))
})

function setup() {
  const fake = createFakeApi()
  window.lumora = fake.api
  render(<ProjectsPage />)
  return fake.api
}

describe('ProjectsPage', () => {
  it('liệt kê dự án với ảnh thu nhỏ và thời lượng', async () => {
    setup()
    const card = await screen.findByTestId('project-card')
    expect(card).toHaveTextContent(sampleSummary.name)
    expect(card).toHaveTextContent('0:07')
    expect(card.querySelector('img')).toHaveAttribute(
      'src',
      'lumora-media://projects/2026-10-12%2009.30.00.lumora/thumbnail.jpg',
    )
  })

  it('mở dự án: trình phát có đủ track và chuyển được giữa các đoạn', async () => {
    setup()
    await userEvent.click(await screen.findByTestId('project-card'))
    expect(await screen.findByTestId('project-name')).toHaveTextContent(sampleSummary.name)
    expect(screen.getByTestId('player-screen')).toHaveAttribute(
      'src',
      'lumora-media://projects/2026-10-12%2009.30.00.lumora/seg0-screen.mkv',
    )
    expect(screen.getByTestId('player-camera')).toBeInTheDocument()
    expect(screen.getByTestId('player-mic')).toBeInTheDocument()
    expect(screen.getByTestId('track-list')).toHaveTextContent('Màn hình')
    expect(screen.getByTestId('track-list')).toHaveTextContent('Webcam')

    await userEvent.click(screen.getByRole('tab', { name: /Đoạn 2/ }))
    expect(screen.getByTestId('player-screen')).toHaveAttribute(
      'src',
      expect.stringContaining('seg1-screen.mkv'),
    )
    expect(screen.queryByTestId('player-camera')).not.toBeInTheDocument()
  })

  it('xóa dự án sau khi xác nhận', async () => {
    const api = setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(await screen.findByTestId('project-card'))
    await userEvent.click(await screen.findByRole('button', { name: 'Xóa' }))
    expect(api.deleteProject).toHaveBeenCalledWith(sampleSummary.folder)
    await waitFor(() => expect(screen.getByText(/Chưa có dự án nào/)).toBeInTheDocument())
  })

  it('không xóa khi người dùng bấm hủy', async () => {
    const api = setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(await screen.findByTestId('project-card'))
    await userEvent.click(await screen.findByRole('button', { name: 'Xóa' }))
    expect(api.deleteProject).not.toHaveBeenCalled()
  })
})
