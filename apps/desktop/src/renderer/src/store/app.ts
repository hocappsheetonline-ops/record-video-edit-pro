import { create } from 'zustand'
import type { AppSettings, SecretKey } from '@lumora/core'
import type { AppInfo, SecretsStatus } from '@shared/ipc'
import { lumora } from '../api'

export const PAGES = ['record', 'projects', 'editor', 'live', 'settings'] as const
export type Page = (typeof PAGES)[number]

interface AppState {
  ready: boolean
  page: Page
  appInfo: AppInfo | null
  settings: AppSettings | null
  secrets: SecretsStatus | null
  /** Dự án đang mở trong trang Dự án (tên thư mục), null là đang xem danh sách. */
  openProject: string | null
  /** Dự án đang mở trong trình chỉnh sửa. */
  editorFolder: string | null
  /**
   * Mục cần cuộn tới khi mở trang Cài đặt (ví dụ bấm vào thanh trạng thái AI). Trang Cài đặt
   * cuộn tới `[data-section="ai"]` rồi tự xóa bằng `clearSettingsSection()`.
   */
  settingsSection: 'ai' | null
  init(): Promise<void>
  openEditor(folder: string): void
  setPage(page: Page): void
  /** Mở trang Cài đặt, tùy chọn cuộn tới một mục. */
  openSettings(section?: 'ai'): void
  clearSettingsSection(): void
  showProject(folder: string | null): void
  updateSettings(patch: Partial<AppSettings>): Promise<void>
  saveSecret(key: SecretKey, value: string): Promise<void>
  deleteSecret(key: SecretKey): Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  page: 'record',
  appInfo: null,
  settings: null,
  secrets: null,
  openProject: null,
  editorFolder: null,
  settingsSection: null,

  async init() {
    const api = lumora()
    const [appInfo, settings, secrets] = await Promise.all([
      api.getAppInfo(),
      api.getSettings(),
      api.getSecretsStatus(),
    ])
    set({ appInfo, settings, secrets, ready: true })
  },

  setPage(page) {
    set({ page, openProject: null })
  },

  openSettings(section) {
    set({ page: 'settings', openProject: null, settingsSection: section ?? null })
  },

  clearSettingsSection() {
    set({ settingsSection: null })
  },

  openEditor(folder) {
    set({ page: 'editor', editorFolder: folder })
  },

  showProject(folder) {
    set({ page: 'projects', openProject: folder })
  },

  async updateSettings(patch) {
    set({ settings: await lumora().updateSettings(patch) })
  },

  async saveSecret(key, value) {
    set({ secrets: await lumora().saveSecret(key, value) })
  },

  async deleteSecret(key) {
    set({ secrets: await lumora().deleteSecret(key) })
  },
}))
