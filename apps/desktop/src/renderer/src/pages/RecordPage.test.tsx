import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { createFakeApi } from '../test/fake-api'
import { RecordPage } from './RecordPage'

const devices = [
  { kind: 'videoinput', deviceId: 'cam1', label: 'HD Webcam', groupId: '' },
  { kind: 'audioinput', deviceId: 'mic1', label: 'Micro USB', groupId: '' },
  { kind: 'audiooutput', deviceId: 'spk', label: 'Loa', groupId: '' },
]

beforeEach(async () => {
  localStorage.clear()
  await act(() => i18n.changeLanguage('vi'))
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => devices),
      // Xem trước webcam/micro không chạy được trong jsdom; giao diện phải tự bỏ qua.
      getUserMedia: vi.fn(async () => Promise.reject(new Error('no device'))),
    },
  })
})

async function setup(options?: Parameters<typeof createFakeApi>[0]) {
  const fake = createFakeApi(options)
  window.lumora = fake.api
  render(<RecordPage />)
  await screen.findByTestId('display-1')
  await screen.findByText(/Quay bằng FFmpeg|bộ quay dự phòng/)
  return fake.api
}

describe('RecordPage', () => {
  it('liệt kê màn hình, chọn sẵn màn hình chính và hiện độ phân giải thật', async () => {
    await setup()
    expect(screen.getByTestId('display-1')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('display-1')).toHaveTextContent('Màn hình 1')
    expect(screen.getByTestId('display-1')).toHaveTextContent('1920 × 1080 · Chính')
    expect(screen.getByTestId('display-2')).toHaveTextContent('LG UltraFine')
    expect(screen.getByTestId('engine-info')).toHaveTextContent('h264_nvenc')
  })

  it('bắt đầu quay toàn màn hình với thiết bị đã chọn', async () => {
    const api = await setup()
    await userEvent.click(screen.getByTestId('display-2'))
    await userEvent.selectOptions(screen.getByTestId('camera-select'), 'cam1')
    await userEvent.selectOptions(screen.getByTestId('mic-select'), 'mic1')
    await userEvent.selectOptions(screen.getByTestId('countdown-select'), '0')
    await userEvent.click(screen.getByLabelText('Thu âm thanh máy tính'))
    await userEvent.click(screen.getByTestId('start-recording'))
    expect(api.startRecording).toHaveBeenCalledWith({
      source: { kind: 'display', displayId: '2' },
      fps: 60,
      countdown: 0,
      cameraId: 'cam1',
      micId: 'mic1',
      systemAudio: true,
    })
  })

  it('nhớ lựa chọn cho lần sau', async () => {
    await setup()
    await userEvent.selectOptions(screen.getByTestId('mic-select'), 'mic1')
    expect(JSON.parse(localStorage.getItem('lumora.record')!)).toMatchObject({ micId: 'mic1' })
  })

  it('quay một vùng: phải chọn vùng trước', async () => {
    const api = await setup()
    await userEvent.click(screen.getByTestId('mode-region'))
    await userEvent.click(screen.getByTestId('start-recording'))
    expect(screen.getByRole('alert')).toHaveTextContent('chưa chọn vùng')
    await userEvent.click(screen.getByTestId('pick-region'))
    expect(api.pickRegion).toHaveBeenCalledWith('1')
    expect(await screen.findByTestId('region-info')).toHaveTextContent('800 × 450')
    await userEvent.click(screen.getByTestId('start-recording'))
    expect(api.startRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: 'region',
          displayId: '1',
          region: { x: 10, y: 20, width: 800, height: 450 },
        },
      }),
    )
  })

  it('quay cửa sổ', async () => {
    const api = await setup()
    await userEvent.click(screen.getByTestId('mode-window'))
    await userEvent.click(screen.getByTestId('window-window:7:0'))
    await userEvent.click(screen.getByTestId('start-recording'))
    expect(api.startRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: 'window', sourceId: 'window:7:0', name: 'Visual Studio Code' },
      }),
    )
  })

  it('khóa chế độ vùng và cảnh báo khi không có FFmpeg', async () => {
    await setup({ screenEngine: 'browser' })
    expect(screen.getByTestId('mode-region')).toBeDisabled()
    expect(screen.getByTestId('engine-info')).toHaveTextContent(
      'con trỏ chuột sẽ nằm sẵn trong video',
    )
  })

  it('hiện lỗi dễ hiểu khi main process từ chối', async () => {
    const api = await setup()
    vi.mocked(api.startRecording).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'recording:start': RecordingPlanError: display_not_found",
      ),
    )
    await userEvent.click(screen.getByTestId('start-recording'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy màn hình đã chọn'),
    )
  })
})
