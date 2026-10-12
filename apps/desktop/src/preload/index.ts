import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type LumoraApi } from '@shared/ipc'

const api: LumoraApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  getSecretsStatus: () => ipcRenderer.invoke(IPC.secretsStatus),
  saveSecret: (key, value) => ipcRenderer.invoke(IPC.secretsSave, key, value),
  deleteSecret: (key) => ipcRenderer.invoke(IPC.secretsDelete, key),
  testSecret: (key, value) => ipcRenderer.invoke(IPC.secretsTest, key, value),
}

contextBridge.exposeInMainWorld('lumora', api)
