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
  init(): Promise<void>
  setPage(page: Page): void
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
    set({ page })
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
