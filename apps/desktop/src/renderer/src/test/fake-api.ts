import { vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  maskSecret,
  type AppSettings,
  type Project,
  type SecretKey,
} from '@lumora/core'
import type {
  CaptureSources,
  LumoraApi,
  ProjectSummary,
  RecordingCommand,
  SecretsStatus,
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
    startExport: vi.fn<LumoraApi['startExport']>(async () => 'e1'),
    writeExport: vi.fn<LumoraApi['writeExport']>(async () => {}),
    finishExport: vi.fn<LumoraApi['finishExport']>(async () => ({
      path: '/x/out.mp4',
      fileName: 'out.mp4',
    })),
    cancelExport: vi.fn<LumoraApi['cancelExport']>(async () => {}),
    revealFile: vi.fn<LumoraApi['revealFile']>(async () => {}),
  } satisfies LumoraApi
  return {
    api,
    emitCommand: (c: RecordingCommand) => commandListeners.forEach((l) => l(c)),
    emitFinished: (folder: string) => finishedListeners.forEach((l) => l(folder)),
  }
}
