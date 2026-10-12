import type { UpdateState } from '@shared/ipc'

/** Phần của `autoUpdater` (electron-updater) mà app dùng; tách ra để test bằng bản giả. */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'checking-for-update' | 'update-not-available', listener: () => void): unknown
  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateDeps {
  /** null khi chạy từ mã nguồn (chưa đóng gói): không tự cập nhật. */
  updater: UpdaterLike | null
  send(state: UpdateState): void
  log(message: string): void
}

/**
 * Tự cập nhật từ GitHub Releases: kiểm tra, tải bản mới ở nền, rồi chờ người dùng bấm
 * "Khởi động lại để cập nhật" (hoặc tự cài khi thoát app).
 */
export class UpdateService {
  private current: UpdateState

  constructor(private readonly deps: UpdateDeps) {
    const u = deps.updater
    this.current = u ? { state: 'idle' } : { state: 'unsupported' }
    if (!u) return
    u.autoDownload = true
    u.autoInstallOnAppQuit = true
    u.on('checking-for-update', () => this.set({ state: 'checking' }))
    u.on('update-not-available', () => this.set({ state: 'none' }))
    u.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 }),
    )
    u.on('download-progress', (p) => {
      if (this.current.state === 'downloading')
        this.set({ ...this.current, percent: Math.max(0, Math.min(100, Math.round(p.percent))) })
    })
    u.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version }))
    u.on('error', (error) => {
      deps.log(`Cập nhật lỗi: ${error.message}`)
      this.set({ state: 'error', message: error.message })
    })
  }

  get state(): UpdateState {
    return this.current
  }

  private set(state: UpdateState) {
    this.current = state
    this.deps.send(state)
  }

  async check(): Promise<UpdateState> {
    const u = this.deps.updater
    if (!u) return this.current
    if (
      this.current.state === 'checking' ||
      this.current.state === 'downloading' ||
      this.current.state === 'ready'
    )
      return this.current
    try {
      await u.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (this.current.state !== 'error') {
        this.deps.log(`Cập nhật lỗi: ${message}`)
        this.set({ state: 'error', message })
      }
    }
    return this.current
  }

  /**
   * Kiểm tra lần đầu sau `firstDelayMs` (để app mở nhanh), rồi định kỳ mỗi `intervalMs`
   * — app để mở lâu ngày vẫn nhận được bản mới. Trả về hàm hủy lịch.
   */
  schedule(firstDelayMs = 10_000, intervalMs = 4 * 60 * 60 * 1000): () => void {
    if (!this.deps.updater) return () => undefined
    const first = setTimeout(() => void this.check(), firstDelayMs)
    const repeat = setInterval(() => void this.check(), intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(repeat)
    }
  }

  install(): void {
    if (this.current.state !== 'ready') throw new Error('update_not_ready')
    this.deps.updater?.quitAndInstall(false, true)
  }
}
