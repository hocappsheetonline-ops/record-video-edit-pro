import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/ipc'
import { UpdateService, type UpdaterLike } from './updater'

/** autoUpdater giả: phát sự kiện giống electron-updater. */
class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(async () => {
    this.emit('checking-for-update')
    return null
  })
  quitAndInstall = vi.fn()
}

function setup(updater: FakeUpdater | null = new FakeUpdater()) {
  const sent: UpdateState[] = []
  const log = vi.fn()
  const service = new UpdateService({
    updater: updater as unknown as UpdaterLike | null,
    send: (s) => sent.push(s),
    log,
  })
  return { service, sent, log, updater: updater! }
}

describe('UpdateService', () => {
  it('chạy từ mã nguồn: không hỗ trợ, không làm gì', async () => {
    const { service, sent } = setup(null)
    expect(service.state).toEqual({ state: 'unsupported' })
    expect(await service.check()).toEqual({ state: 'unsupported' })
    expect(sent).toEqual([])
    expect(() => service.install()).toThrow('update_not_ready')
  })

  it('có bản mới: tải ở nền, báo tiến độ, sẵn sàng thì cài khi người dùng bấm', async () => {
    const { service, sent, updater } = setup()
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(service.state).toEqual({ state: 'idle' })

    await service.check()
    updater.emit('update-available', { version: '0.2.0' })
    updater.emit('download-progress', { percent: 41.6 })
    updater.emit('download-progress', { percent: 130 })
    // Đang tải thì bấm kiểm tra lại không gọi thêm.
    await service.check()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(() => service.install()).toThrow('update_not_ready')

    updater.emit('update-downloaded', { version: '0.2.0' })
    expect(sent).toEqual([
      { state: 'checking' },
      { state: 'downloading', version: '0.2.0', percent: 0 },
      { state: 'downloading', version: '0.2.0', percent: 42 },
      { state: 'downloading', version: '0.2.0', percent: 100 },
      { state: 'ready', version: '0.2.0' },
    ])
    service.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('đã là bản mới nhất', async () => {
    const { service, updater } = setup()
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('checking-for-update')
      updater.emit('update-not-available')
      return null
    })
    expect(await service.check()).toEqual({ state: 'none' })
  })

  it('lỗi mạng: ghi nhật ký, báo lỗi và cho kiểm tra lại', async () => {
    const { service, updater, log } = setup()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(await service.check()).toEqual({
      state: 'error',
      message: 'net::ERR_INTERNET_DISCONNECTED',
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ERR_INTERNET_DISCONNECTED'))
    await service.check()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('lỗi phát qua sự kiện cũng được báo (chỉ một lần)', async () => {
    const { service, updater, sent, log } = setup()
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('error', new Error('HttpError: 404'))
      throw new Error('HttpError: 404')
    })
    await service.check()
    expect(sent).toEqual([{ state: 'error', message: 'HttpError: 404' }])
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('lịch kiểm tra: lần đầu sau khi mở app, rồi định kỳ; hủy được', async () => {
    vi.useFakeTimers()
    try {
      const { service, updater } = setup()
      updater.checkForUpdates.mockImplementation(async () => {
        updater.emit('update-not-available')
        return null
      })
      const stop = service.schedule(10_000, 60_000)
      await vi.advanceTimersByTimeAsync(9_999)
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(120_000)
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
      stop()
      await vi.advanceTimersByTimeAsync(600_000)
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
      expect(setup(null).service.schedule()).toBeTypeOf('function')
    } finally {
      vi.useRealTimers()
    }
  })
})
