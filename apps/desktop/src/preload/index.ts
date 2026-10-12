import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENTS, IPC, type LumoraApi, type Unsubscribe } from '@shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LumoraApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  getSecretsStatus: () => ipcRenderer.invoke(IPC.secretsStatus),
  saveSecret: (key, value) => ipcRenderer.invoke(IPC.secretsSave, key, value),
  deleteSecret: (key) => ipcRenderer.invoke(IPC.secretsDelete, key),
  testSecret: (key, value) => ipcRenderer.invoke(IPC.secretsTest, key, value),

  getCaptureSources: () => ipcRenderer.invoke(IPC.captureSources),
  getRecorderCapabilities: () => ipcRenderer.invoke(IPC.recorderCapabilities),
  pickRegion: (displayId) => ipcRenderer.invoke(IPC.pickRegion, displayId),
  submitRegion: (region) => ipcRenderer.invoke(IPC.submitRegion, region),
  startRecording: (options) => ipcRenderer.invoke(IPC.startRecording, options),

  getActiveSession: () => ipcRenderer.invoke(IPC.activeSession),
  beginSegment: () => ipcRenderer.invoke(IPC.beginSegment),
  trackStarted: (index, kind, startedAt) =>
    ipcRenderer.invoke(IPC.trackStarted, index, kind, startedAt),
  writeChunk: (index, kind, data) => ipcRenderer.invoke(IPC.writeChunk, index, kind, data),
  endSegment: () => ipcRenderer.invoke(IPC.endSegment),
  finishRecording: () => ipcRenderer.invoke(IPC.finishRecording),
  cancelRecording: () => ipcRenderer.invoke(IPC.cancelRecording),
  onRecordingCommand: (listener) => subscribe(EVENTS.recordingCommand, listener),
  onRecordingFinished: (listener) => subscribe(EVENTS.recordingFinished, listener),
  onRecordingError: (listener) => subscribe(EVENTS.recordingError, listener),

  listProjects: () => ipcRenderer.invoke(IPC.projectsList),
  getProject: (folder) => ipcRenderer.invoke(IPC.projectsGet, folder),
  deleteProject: (folder) => ipcRenderer.invoke(IPC.projectsDelete, folder),
  revealProject: (folder) => ipcRenderer.invoke(IPC.projectsReveal, folder),

  getEdit: (folder) => ipcRenderer.invoke(IPC.projectsGetEdit, folder),
  saveEdit: (folder, edit) => ipcRenderer.invoke(IPC.projectsSaveEdit, folder, edit),
  getEvents: (folder) => ipcRenderer.invoke(IPC.projectsGetEvents, folder),
  startExport: (folder) => ipcRenderer.invoke(IPC.exportStart, folder),
  writeExport: (id, position, data) => ipcRenderer.invoke(IPC.exportWrite, id, position, data),
  finishExport: (id, folder, edit) => ipcRenderer.invoke(IPC.exportFinish, id, folder, edit),
  cancelExport: (id) => ipcRenderer.invoke(IPC.exportCancel, id),
  revealFile: (path) => ipcRenderer.invoke(IPC.revealFile, path),

  transcribe: (folder, language) => ipcRenderer.invoke(IPC.aiTranscribe, folder, language),
  getTranscript: (folder) => ipcRenderer.invoke(IPC.aiGetTranscript, folder),
  suggestCuts: (folder) => ipcRenderer.invoke(IPC.aiSuggestCuts, folder),
  summarize: (folder) => ipcRenderer.invoke(IPC.aiSummarize, folder),
  translateLines: (lines, target) => ipcRenderer.invoke(IPC.aiTranslate, lines, target),
  saveExportText: (folder, fileName, content) =>
    ipcRenderer.invoke(IPC.saveExportText, folder, fileName, content),
}

contextBridge.exposeInMainWorld('lumora', api)
