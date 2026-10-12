import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@lumora/core'
import { TooltipLayer } from '../components/TooltipLayer'
import { runJob, useJobs } from '../editor/jobs'
import { useEditorStore } from '../editor/store'
import i18n from '../i18n'
import { useAppStore } from '../store/app'
import { createFakeApi, sampleSummary } from '../test/fake-api'
import { EditorPage } from './EditorPage'
import { ProjectsPage } from './ProjectsPage'
import { SettingsPage } from './SettingsPage'

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
  useEditorStore.getState().reset()
  useJobs.setState({ jobs: [], toasts: [] })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

async function setup(settings: Partial<typeof DEFAULT_SETTINGS> = { onboardingDone: true }) {
  const fake = createFakeApi()
  window.lumora = fake.api
  useAppStore.setState({
    page: 'editor',
    editorFolder: sampleSummary.folder,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  })
  render(
    <>
      <EditorPage />
      <TooltipLayer />
    </>,
  )
  await screen.findByTestId('editor-title')
  return fake.api
}
const s = () => useEditorStore.getState()

describe('hoàn thiện (v0.9)', () => {
  it('lịch sử: tên bước trong nút hoàn tác, danh sách các bước, bấm để quay về / tới', async () => {
    await setup()
    act(() => s().addEffect('shake'))
    act(() => s().addOverlay({ kind: 'text', text: 'A' }))
    act(() => s().updateOverlay(s().edit!.overlays[0]!.id, { text: 'B' }))
    expect(screen.getByTestId('undo')).toHaveAttribute('aria-label', 'Hoàn tác: Sửa lớp phủ')
    await userEvent.click(screen.getByTestId('history-open'))
    const items = screen.getAllByTestId('history-item')
    expect(items.map((i) => i.textContent)).toEqual([
      '3Sửa lớp phủ',
      '2Thêm lớp phủ',
      '1Thêm hiệu ứng',
      '0Mở dự án',
    ])
    expect(items[0]).toHaveAttribute('data-current', 'true')
    await userEvent.click(items[2]!)
    expect(s().edit!.overlays).toHaveLength(0)
    expect(s().edit!.effects).toHaveLength(1)
    // Các bước sau vẫn còn (làm lại được), hiện gạch ngang.
    expect(screen.getAllByTestId('history-item')[0]).toHaveAttribute('data-future', 'true')
    await userEvent.click(screen.getAllByTestId('history-item')[0]!)
    expect(s().edit!.overlays[0]!.text).toBe('B')
  })

  it('việc nền: hiện trong danh sách có tiến độ, hủy được; thông báo khi xong', async () => {
    await setup()
    let resolve: (v: number) => void = () => {}
    const cancel = vi.fn()
    let report: (p: number | null) => void = () => {}
    let job!: Promise<number>
    act(() => {
      job = runJob(
        'Xuất MP4',
        (r) => {
          report = r
          return new Promise<number>((res) => (resolve = res))
        },
        { cancel },
      )
    })
    act(() => report(0.4))
    expect(screen.getByTestId('jobs-count')).toHaveTextContent('1')
    await userEvent.click(screen.getByTestId('jobs-button'))
    expect(screen.getByTestId('job-item')).toHaveTextContent('Xuất MP4')
    expect(screen.getByTestId('job-item')).toHaveTextContent('40%')
    await userEvent.click(screen.getByTestId('job-cancel'))
    expect(cancel).toHaveBeenCalled()
    await act(async () => {
      resolve(1)
      await job
    })
    expect(screen.getByTestId('job-item')).toHaveAttribute('data-status', 'done')
    act(() => {
      useJobs.getState().toast({ kind: 'success', text: 'Đã xong' })
    })
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã xong')
  })

  it('phím ? mở bảng phím tắt, Esc đóng; đường gióng đổi kiểu vòng quanh', async () => {
    await setup()
    await userEvent.keyboard('?')
    expect(screen.getByTestId('shortcuts-dialog')).toHaveTextContent('Xóa dồn')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('shortcuts-dialog')).not.toBeInTheDocument()
    const toggle = screen.getByTestId('guides-toggle')
    await userEvent.click(toggle)
    expect(s().guides).toBe('thirds')
    await userEvent.click(toggle)
    expect(s().guides).toBe('safe')
    await userEvent.click(toggle)
    expect(s().guides).toBe('none')
  })

  it('hướng dẫn lần đầu: 5 bước, Bỏ qua thì lưu lại không hiện nữa', async () => {
    await setup({ onboardingDone: false })
    const card = screen.getByTestId('onboarding')
    expect(card).toHaveAttribute('data-step', 'library')
    await userEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByTestId('onboarding')).toHaveAttribute('data-step', 'preview')
    await userEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByTestId('onboarding')).toHaveAttribute('data-step', 'library')
    await userEvent.click(screen.getByTestId('onboarding-skip'))
    await waitFor(() => expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument())
    expect(useAppStore.getState().settings?.onboardingDone).toBe(true)
  })

  it('mẫu dự án TikTok: bản quay mở lần đầu thành 9:16 phủ kín', async () => {
    await setup({ onboardingDone: true, projectTemplate: 'tiktok' })
    expect(s().edit!.frame).toMatchObject({ aspect: '9:16', fill: true })
  })
})

describe('cài đặt và dự án', () => {
  it('cài đặt trình chỉnh sửa: chất lượng xem trước, mẫu dự án, xem lại hướng dẫn', async () => {
    const fake = createFakeApi()
    window.lumora = fake.api
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
    render(<SettingsPage />)
    await userEvent.selectOptions(screen.getByTestId('settings-preview-quality'), 'low')
    await userEvent.selectOptions(screen.getByTestId('settings-template'), 'square')
    await userEvent.click(screen.getByTestId('settings-onboarding'))
    expect(useAppStore.getState().settings).toMatchObject({
      previewQuality: 'low',
      projectTemplate: 'square',
      onboardingDone: false,
    })
  })

  it('đổi tên và nhân đôi dự án', async () => {
    const fake = createFakeApi()
    window.lumora = fake.api
    useAppStore.setState({ page: 'projects', openProject: sampleSummary.folder })
    render(<ProjectsPage />)
    await userEvent.click(await screen.findByTestId('project-rename-open'))
    const input = screen.getByTestId('project-rename')
    await userEvent.clear(input)
    await userEvent.type(input, 'Hướng dẫn mới{Enter}')
    expect(fake.api.renameProject).toHaveBeenCalledWith(sampleSummary.folder, 'Hướng dẫn mới')
    expect(await screen.findByTestId('project-name')).toHaveTextContent('Hướng dẫn mới')
    await userEvent.click(screen.getByTestId('project-duplicate'))
    expect(fake.api.duplicateProject).toHaveBeenCalledWith(sampleSummary.folder, '(bản sao)')
    await waitFor(() => expect(useAppStore.getState().openProject).toBe('copy.lumora'))
    fireEvent.keyDown(window, { key: 'Escape' })
  })
})
