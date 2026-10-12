import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENTS, IPC, type LumoraApi, type Unsubscribe } from '@shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LumoraApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getUpdateState: () => ipcRenderer.invoke(IPC.updateState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateState: (listener) => subscribe(EVENTS.updateState, listener),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
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
  getWaveform: (folder) => ipcRenderer.invoke(IPC.projectsWaveform, folder),
  getFilmstrip: (folder) => ipcRenderer.invoke(IPC.projectsFilmstrip, folder),
  sharePack: (folder, mode) => ipcRenderer.invoke(IPC.projectsSharePack, folder, mode),
  importPack: () => ipcRenderer.invoke(IPC.projectsImportPack),
  addAudioFile: (folder) => ipcRenderer.invoke(IPC.assetsAddAudio, folder),
  addSoundEffect: (folder, id) => ipcRenderer.invoke(IPC.assetsAddSfx, folder, id),
  getAssetPeaks: (folder, file) => ipcRenderer.invoke(IPC.assetsPeaks, folder, file),
  addImageFile: (folder) => ipcRenderer.invoke(IPC.assetsAddImage, folder),
  listMemes: () => ipcRenderer.invoke(IPC.memesList),
  importMemes: () => ipcRenderer.invoke(IPC.memesImport),
  addMemePaths: (paths) => ipcRenderer.invoke(IPC.memesAddPaths, paths),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  removeMeme: (file) => ipcRenderer.invoke(IPC.memesRemove, file),
  useMeme: (folder, file) => ipcRenderer.invoke(IPC.memesUse, folder, file),
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
  listVoices: () => ipcRenderer.invoke(IPC.aiVoices),
  speak: (folder, text, voiceId) => ipcRenderer.invoke(IPC.aiSpeak, folder, text, voiceId),
  onlineSearch: (source, q, next) => ipcRenderer.invoke(IPC.onlineSearch, source, q, next),
  onlineDownload: (source, id) => ipcRenderer.invoke(IPC.onlineDownload, source, id),
  cacheInfo: () => ipcRenderer.invoke(IPC.cacheInfo),
  cacheClear: () => ipcRenderer.invoke(IPC.cacheClear),
  saveExportText: (folder, fileName, content) =>
    ipcRenderer.invoke(IPC.saveExportText, folder, fileName, content),

  getLiveConfig: () => ipcRenderer.invoke(IPC.liveGetConfig),
  updateLiveConfig: (patch) => ipcRenderer.invoke(IPC.liveUpdateConfig, patch),
  getLiveSecrets: () => ipcRenderer.invoke(IPC.liveSecrets),
  setLiveSecret: (name, value) => ipcRenderer.invoke(IPC.liveSetSecret, name, value),
  openGuestRoom: () => ipcRenderer.invoke(IPC.liveOpenRoom),
  closeGuestRoom: () => ipcRenderer.invoke(IPC.liveCloseRoom),
  startLive: (video) => ipcRenderer.invoke(IPC.liveStart, video),
  writeLive: (data) => ipcRenderer.invoke(IPC.liveWrite, data),
  stopLive: () => ipcRenderer.invoke(IPC.liveStop),
  startComments: (platforms) => ipcRenderer.invoke(IPC.liveCommentsStart, platforms),
  stopComments: () => ipcRenderer.invoke(IPC.liveCommentsStop),
  transcribeLiveChunk: (data, language) => ipcRenderer.invoke(IPC.liveCaption, data, language),
  onLiveStatus: (listener) => subscribe(EVENTS.liveStatus, listener),
  onLiveEnded: (listener) => subscribe(EVENTS.liveEnded, listener),
  onLiveComments: (listener) => subscribe(EVENTS.liveComments, listener),
  onLiveCommentError: (listener) => subscribe(EVENTS.liveCommentError, listener),
}

contextBridge.exposeInMainWorld('lumora', api)
