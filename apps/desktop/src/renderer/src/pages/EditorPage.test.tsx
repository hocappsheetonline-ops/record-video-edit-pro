import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  render(<EditorPage />)
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

  it('đổi tỉ lệ khung hình làm đổi kích thước xuất', async () => {
    setup()
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByTestId('aspect-9:16'))
    await userEvent.click(screen.getByTestId('tab-export'))
    expect(screen.getByTestId('export-size')).toHaveTextContent('1080 × 1920')
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
    await userEvent.selectOptions(screen.getByTestId('clip-speed'), '2')
    expect(screen.getByTestId('timecode')).toHaveTextContent('/ 0:04.5')
  })
})
