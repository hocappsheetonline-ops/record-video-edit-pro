import { vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  maskSecret,
  type AppSettings,
  type LiveComment,
  type Project,
  type SecretKey,
} from '@lumora/core'
import type {
  CaptureSources,
  LiveConfig,
  LiveEnded,
  LiveStatus,
  LumoraApi,
  ProjectSummary,
  RecordingCommand,
  SecretsStatus,
  UpdateState,
} from '@shared/ipc'

export const sampleProject: Project = {
  version: 1,
  id: 'p1',
  name: '2026-10-12 09.30.00',
  createdAt: '2026-10-12T02:30:00.000Z',
  source: {
    kind: 'display',
    name: 'Dell',
    captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  },
  engine: 'ffmpeg',
  encoder: 'h264_nvenc',
  fps: 60,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 1000,
      endedAt: 6000,
      tracks: {
        screen: { file: 'seg0-screen.mkv', startedAt: 1000 },
        camera: { file: 'seg0-camera.mkv', startedAt: 1100 },
        mic: { file: 'seg0-mic.webm', startedAt: 1050 },
      },
    },
    {
      index: 1,
      startedAt: 9000,
      endedAt: 11000,
      tracks: { screen: { file: 'seg1-screen.mkv', startedAt: 9000 } },
    },
  ],
  hasEvents: true,
  inputMode: 'hook',
  durationMs: 7000,
}

export const sampleTranscript = {
  language: 'vi',
  words: [
    { text: 'Xin', start: 0, end: 300 },
    { text: 'chào', start: 350, end: 700 },
    { text: 'ừm', start: 800, end: 1000 },
    { text: 'các', start: 1100, end: 1300 },
    { text: 'bạn.', start: 1350, end: 1700 },
    { text: 'Hôm', start: 4100, end: 4300 },
    { text: 'nay', start: 4350, end: 4600 },
  ],
}

export const sampleSummary: ProjectSummary = {
  folder: '2026-10-12 09.30.00.lumora',
  id: 'p1',
  name: sampleProject.name,
  createdAt: sampleProject.createdAt,
  durationMs: 7000,
  sourceKind: 'display',
  hasThumbnail: true,
}

export const sampleSources: CaptureSources = {
  displays: [
    {
      id: '1',
      label: '',
      bounds: { x: 0, y: 0, width: 1536, height: 864 },
      scaleFactor: 1.25,
      primary: true,
      thumbnail: '',
    },
    {
      id: '2',
      label: 'LG UltraFine',
      bounds: { x: 1536, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1,
      primary: false,
      thumbnail: '',
    },
  ],
  windows: [{ id: 'window:7:0', name: 'Visual Studio Code', thumbnail: '' }],
}

/** API giả thay cho main process, giữ trạng thái trong bộ nhớ. */
export function createFakeApi(
  options: { encryptionAvailable?: boolean; screenEngine?: 'ffmpeg' | 'browser' } = {},
) {
  let settings: AppSettings = { ...DEFAULT_SETTINGS }
  const secrets: Partial<Record<SecretKey, string>> = {}
  let projects = [sampleSummary]
  const commandListeners = new Set<(c: RecordingCommand) => void>()
  const commentListeners = new Set<(c: LiveComment[]) => void>()
  const updateListeners = new Set<(s: UpdateState) => void>()
  const statusListeners = new Set<(s: LiveStatus) => void>()
  const endedListeners = new Set<(e: LiveEnded) => void>()
  let liveConfig: LiveConfig = {
    destinations: [],
    resolution: 720,
    videoBitrate: 4500,
    recordLocally: true,
    publicUrl: '',
    youtubeVideoId: '',
    facebookVideoId: '',
  }
  const secretNames = new Set<string>()
  const liveSecrets = () => ({
    streamKeys: Object.fromEntries(
      liveConfig.destinations.map((d) => [d.id, secretNames.has(`stream:${d.id}`)]),
    ),
    youtubeApiKey: secretNames.has('youtube-api-key'),
    facebookToken: secretNames.has('facebook-token'),
  })
  const finishedListeners = new Set<(folder: string) => void>()
  const status = (): SecretsStatus => ({
    elevenlabs: secrets.elevenlabs
      ? { state: 'saved', masked: maskSecret(secrets.elevenlabs) }
      : { state: 'missing' },
    anthropic: secrets.anthropic
      ? { state: 'saved', masked: maskSecret(secrets.anthropic) }
      : { state: 'missing' },
  })
  const api = {
    getAppInfo: async () => ({
      name: 'Lumora',
      version: '0.1.0',
      platform: 'win32',
      encryptionAvailable: options.encryptionAvailable ?? true,
    }),
    getUpdateState: vi.fn<LumoraApi['getUpdateState']>(async () => ({ state: 'idle' })),
    checkForUpdates: vi.fn<LumoraApi['checkForUpdates']>(async () => ({ state: 'none' })),
    installUpdate: vi.fn<LumoraApi['installUpdate']>(async () => {}),
    onUpdateState: (l: (s: UpdateState) => void) => {
      updateListeners.add(l)
      return () => updateListeners.delete(l)
    },
    openLogs: vi.fn<LumoraApi['openLogs']>(async () => {}),
    getSettings: async () => settings,
    updateSettings: async (patch: Partial<AppSettings>) => (settings = { ...settings, ...patch }),
    getSecretsStatus: async () => status(),
    saveSecret: async (key: SecretKey, value: string) => {
      secrets[key] = value
      return status()
    },
    deleteSecret: async (key: SecretKey) => {
      delete secrets[key]
      return status()
    },
    testSecret: vi.fn<LumoraApi['testSecret']>(async () => ({ ok: true })),

    getCaptureSources: vi.fn<LumoraApi['getCaptureSources']>(async () => sampleSources),
    getRecorderCapabilities: vi.fn<LumoraApi['getRecorderCapabilities']>(async () => ({
      screenEngine: options.screenEngine ?? 'ffmpeg',
      backend: options.screenEngine === 'browser' ? null : 'ddagrab',
      encoder: options.screenEngine === 'browser' ? null : 'h264_nvenc',
      systemAudio: true,
    })),
    pickRegion: vi.fn<LumoraApi['pickRegion']>(async () => ({
      x: 10,
      y: 20,
      width: 800,
      height: 450,
    })),
    submitRegion: vi.fn<LumoraApi['submitRegion']>(async () => {}),
    startRecording: vi.fn<LumoraApi['startRecording']>(async () => {}),
    getActiveSession: vi.fn<LumoraApi['getActiveSession']>(async () => null),
    beginSegment: vi.fn<LumoraApi['beginSegment']>(async () => ({ index: 0, rendererTracks: [] })),
    trackStarted: vi.fn<LumoraApi['trackStarted']>(async () => {}),
    writeChunk: vi.fn<LumoraApi['writeChunk']>(async () => {}),
    endSegment: vi.fn<LumoraApi['endSegment']>(async () => {}),
    finishRecording: vi.fn<LumoraApi['finishRecording']>(async () => {}),
    cancelRecording: vi.fn<LumoraApi['cancelRecording']>(async () => {}),
    onRecordingCommand: (l: (c: RecordingCommand) => void) => {
      commandListeners.add(l)
      return () => commandListeners.delete(l)
    },
    onRecordingFinished: (l: (folder: string) => void) => {
      finishedListeners.add(l)
      return () => finishedListeners.delete(l)
    },
    onRecordingError: () => () => {},

    listProjects: vi.fn<LumoraApi['listProjects']>(async () => projects),
    getProject: vi.fn<LumoraApi['getProject']>(async (folder: string) =>
      folder === sampleSummary.folder ? sampleProject : null,
    ),
    deleteProject: vi.fn<LumoraApi['deleteProject']>(
      async (folder: string) => (projects = projects.filter((p) => p.folder !== folder)),
    ),
    revealProject: vi.fn<LumoraApi['revealProject']>(async () => {}),
    getEdit: vi.fn<LumoraApi['getEdit']>(async () => null),
    saveEdit: vi.fn<LumoraApi['saveEdit']>(async () => {}),
    getEvents: vi.fn<LumoraApi['getEvents']>(async () => []),
    getWaveform: vi.fn<LumoraApi['getWaveform']>(async () => null),
    getFilmstrip: vi.fn<LumoraApi['getFilmstrip']>(async () => null),
    sharePack: vi.fn<LumoraApi['sharePack']>(async (_folder, mode) => ({
      path: `/x/Demo${mode === 'edits' ? ' (bản chỉnh sửa)' : ''}.lumorapack`,
      bytes: mode === 'edits' ? 4096 : 52_428_800,
    })),
    importPack: vi.fn<LumoraApi['importPack']>(async () => ({
      folder: sampleSummary.folder,
      status: 'created',
      mode: 'full',
    })),
    startExport: vi.fn<LumoraApi['startExport']>(async () => 'e1'),
    writeExport: vi.fn<LumoraApi['writeExport']>(async () => {}),
    finishExport: vi.fn<LumoraApi['finishExport']>(async () => ({
      path: '/x/out.mp4',
      fileName: 'out.mp4',
    })),
    cancelExport: vi.fn<LumoraApi['cancelExport']>(async () => {}),
    revealFile: vi.fn<LumoraApi['revealFile']>(async () => {}),
    transcribe: vi.fn<LumoraApi['transcribe']>(async () => sampleTranscript),
    getTranscript: vi.fn<LumoraApi['getTranscript']>(async () => null),
    suggestCuts: vi.fn<LumoraApi['suggestCuts']>(async () => [
      { id: 'ai0', kind: 'filler', start: 800, end: 1100, text: 'ừm', reason: 'Từ đệm' },
      { id: 's0', kind: 'silence', start: 2500, end: 4000, text: '', reason: '' },
    ]),
    summarize: vi.fn<LumoraApi['summarize']>(async () => ({
      titles: ['Hướng dẫn Lumora', 'Lumora trong 5 phút', 'Quay màn hình đẹp'],
      description: 'Video hướng dẫn.',
      hashtags: ['#lumora'],
      chapters: [
        { start: 0, title: 'Mở đầu' },
        { start: 5500, title: 'Phần 2' },
      ],
    })),
    translateLines: vi.fn<LumoraApi['translateLines']>(async (lines) =>
      lines.map((l) => ({ id: l.id, text: `EN: ${l.text}` })),
    ),
    saveExportText: vi.fn<LumoraApi['saveExportText']>(async (_folder, fileName) => ({
      path: `/x/${fileName}`,
      fileName,
    })),
    getLiveConfig: vi.fn<LumoraApi['getLiveConfig']>(async () => liveConfig),
    updateLiveConfig: vi.fn<LumoraApi['updateLiveConfig']>(
      async (patch) => (liveConfig = { ...liveConfig, ...patch }),
    ),
    getLiveSecrets: vi.fn<LumoraApi['getLiveSecrets']>(async () => liveSecrets()),
    setLiveSecret: vi.fn<LumoraApi['setLiveSecret']>(async (name, value) => {
      if (value) secretNames.add(name)
      else secretNames.delete(name)
      return liveSecrets()
    }),
    openGuestRoom: vi.fn<LumoraApi['openGuestRoom']>(async () => ({
      room: 'r1',
      hostKey: 'k1',
      port: 47800,
      inviteUrls: ['http://192.168.1.5:47800/join/r1'],
    })),
    closeGuestRoom: vi.fn<LumoraApi['closeGuestRoom']>(async () => {}),
    startLive: vi.fn<LumoraApi['startLive']>(async () => {}),
    writeLive: vi.fn<LumoraApi['writeLive']>(async () => {}),
    stopLive: vi.fn<LumoraApi['stopLive']>(async () => ({
      error: null,
      folder: 'Live 2026.lumora',
    })),
    startComments: vi.fn<LumoraApi['startComments']>(async () => {}),
    stopComments: vi.fn<LumoraApi['stopComments']>(async () => {}),
    transcribeLiveChunk: vi.fn<LumoraApi['transcribeLiveChunk']>(async () => ''),
    onLiveStatus: (l: (s: LiveStatus) => void) => {
      statusListeners.add(l)
      return () => statusListeners.delete(l)
    },
    onLiveEnded: (l: (e: LiveEnded) => void) => {
      endedListeners.add(l)
      return () => endedListeners.delete(l)
    },
    onLiveComments: (l: (c: LiveComment[]) => void) => {
      commentListeners.add(l)
      return () => commentListeners.delete(l)
    },
    onLiveCommentError: () => () => {},
  } satisfies LumoraApi
  return {
    api,
    emitCommand: (c: RecordingCommand) => commandListeners.forEach((l) => l(c)),
    emitFinished: (folder: string) => finishedListeners.forEach((l) => l(folder)),
    emitComments: (comments: LiveComment[]) => commentListeners.forEach((l) => l(comments)),
    emitUpdate: (state: UpdateState) => updateListeners.forEach((l) => l(state)),
    emitLiveStatus: (status: LiveStatus) => statusListeners.forEach((l) => l(status)),
    emitLiveEnded: (ended: LiveEnded) => endedListeners.forEach((l) => l(ended)),
  }
}
