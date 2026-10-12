import type { IpcMain } from 'electron'
import { checkKeyFormat, isSecretKey, type AppSettings } from '@lumora/core'
import { IPC, type AppInfo } from '@shared/ipc'
import { validateKey, type Validators } from './key-validation'
import type { SecretStore } from './secret-store'
import type { SettingsStore } from './settings-store'

export interface IpcDeps {
  settings: SettingsStore
  secrets: SecretStore
  validators?: Validators
  appInfo: () => AppInfo
}

function assertSecretKey(value: unknown) {
  if (!isSecretKey(value)) throw new Error(`Loại API key không hợp lệ: ${String(value)}`)
  return value
}

/** Đăng ký các handler IPC. Dữ liệu từ giao diện luôn được kiểm tra lại ở đây. */
export function registerIpc(ipcMain: Pick<IpcMain, 'handle'>, deps: IpcDeps): void {
  const { settings, secrets } = deps

  ipcMain.handle(IPC.appInfo, () => deps.appInfo())
  ipcMain.handle(IPC.settingsGet, () => settings.get())
  ipcMain.handle(IPC.settingsUpdate, (_event, patch: unknown) =>
    settings.update(
      typeof patch === 'object' && patch !== null ? (patch as Partial<AppSettings>) : {},
    ),
  )

  ipcMain.handle(IPC.secretsStatus, () => secrets.status())
  ipcMain.handle(IPC.secretsSave, async (_event, rawKey: unknown, value: unknown) => {
    const key = assertSecretKey(rawKey)
    const secret = typeof value === 'string' ? value.trim() : ''
    const formatError = checkKeyFormat(key, secret)
    if (formatError) throw new Error(`Định dạng key không hợp lệ: ${formatError}`)
    await secrets.set(key, secret)
    return secrets.status()
  })
  ipcMain.handle(IPC.secretsDelete, async (_event, rawKey: unknown) => {
    await secrets.delete(assertSecretKey(rawKey))
    return secrets.status()
  })
  ipcMain.handle(IPC.secretsTest, async (_event, rawKey: unknown, value: unknown) => {
    const key = assertSecretKey(rawKey)
    const secret = typeof value === 'string' ? value.trim() : ((await secrets.get(key)) ?? '')
    return validateKey(key, secret, deps.validators)
  })
}
