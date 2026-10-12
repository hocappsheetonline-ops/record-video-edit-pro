import type { IpcMain } from 'electron'
import {
  checkKeyFormat,
  isSecretKey,
  parseRecordingOptions,
  PROJECT_FILE,
  TRACK_KINDS,
  type AppSettings,
  type Rect,
  type RecordingOptions,
  type TrackKind,
} from '@lumora/core'
import {
  IPC,
  type ActiveSession,
  type AppInfo,
  type CaptureSources,
  type RecorderCapabilities,
  type SegmentStart,
} from '@shared/ipc'
import { validateKey, type Validators } from './key-validation'
import { isProjectFolderName, listProjects, readProject, safeJoin } from './projects/library'
import type { SecretStore } from './secret-store'
import type { SettingsStore } from './settings-store'

/** Những gì IPC cần từ bộ điều phối quay (RecordingController). */
export interface RecordingIpc {
  capabilities(): Promise<RecorderCapabilities>
  sources(): Promise<CaptureSources>
  pickRegion(displayId: string): Promise<Rect | null>
  submitRegion(region: Rect | null): void
  start(options: RecordingOptions): Promise<void>
  activeSession(): ActiveSession | null
  beginSegment(): Promise<SegmentStart>
  trackStarted(index: number, kind: TrackKind, startedAt: number): Promise<void>
  writeChunk(index: number, kind: TrackKind, data: Uint8Array): Promise<void>
  endSegment(): Promise<void>
  finish(): Promise<void>
  cancel(): Promise<void>
}

export interface ProjectsIpc {
  dir(): Promise<string>
  trash(path: string): Promise<void>
  reveal(path: string): void
}

export interface IpcDeps {
  settings: SettingsStore
  secrets: SecretStore
  validators?: Validators
  appInfo: () => AppInfo
  recording: RecordingIpc
  projects: ProjectsIpc
}

function assertSecretKey(value: unknown) {
  if (!isSecretKey(value)) throw new Error(`Loại API key không hợp lệ: ${String(value)}`)
  return value
}

function assertTrack(index: unknown, kind: unknown): [number, TrackKind] {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new Error('Chỉ số đoạn không hợp lệ')
  }
  if (!TRACK_KINDS.includes(kind as TrackKind)) throw new Error('Loại track không hợp lệ')
  return [index, kind as TrackKind]
}

function asBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new Error('Dữ liệu ghi không hợp lệ')
}

function parseRegion(value: unknown): Rect | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  const nums = ['x', 'y', 'width', 'height'].map((k) => r[k])
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const [x, y, width, height] = nums as number[]
  return width! > 0 && height! > 0 ? { x: x!, y: y!, width: width!, height: height! } : null
}

function assertFolder(folder: unknown): string {
  if (typeof folder !== 'string' || !isProjectFolderName(folder)) {
    throw new Error('Thư mục dự án không hợp lệ')
  }
  return folder
}

/** Đăng ký các handler IPC. Dữ liệu từ giao diện luôn được kiểm tra lại ở đây. */
export function registerIpc(ipcMain: Pick<IpcMain, 'handle'>, deps: IpcDeps): void {
  const { settings, secrets, recording, projects } = deps

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

  ipcMain.handle(IPC.recorderCapabilities, () => recording.capabilities())
  ipcMain.handle(IPC.captureSources, () => recording.sources())
  ipcMain.handle(IPC.pickRegion, (_event, displayId: unknown) => {
    if (typeof displayId !== 'string') throw new Error('Màn hình không hợp lệ')
    return recording.pickRegion(displayId)
  })
  ipcMain.handle(IPC.submitRegion, (_event, region: unknown) =>
    recording.submitRegion(parseRegion(region)),
  )
  ipcMain.handle(IPC.startRecording, (_event, options: unknown) => {
    const parsed = parseRecordingOptions(options)
    if (!parsed) throw new Error('Tùy chọn quay không hợp lệ')
    return recording.start(parsed)
  })
  ipcMain.handle(IPC.activeSession, () => recording.activeSession())
  ipcMain.handle(IPC.beginSegment, () => recording.beginSegment())
  ipcMain.handle(IPC.trackStarted, (_event, index: unknown, kind: unknown, startedAt: unknown) => {
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) {
      throw new Error('Thời điểm không hợp lệ')
    }
    return recording.trackStarted(...assertTrack(index, kind), startedAt)
  })
  ipcMain.handle(IPC.writeChunk, (_event, index: unknown, kind: unknown, data: unknown) =>
    recording.writeChunk(...assertTrack(index, kind), asBytes(data)),
  )
  ipcMain.handle(IPC.endSegment, () => recording.endSegment())
  ipcMain.handle(IPC.finishRecording, () => recording.finish())
  ipcMain.handle(IPC.cancelRecording, () => recording.cancel())

  ipcMain.handle(IPC.projectsList, async () => listProjects(await projects.dir()))
  ipcMain.handle(IPC.projectsGet, async (_event, folder: unknown) =>
    readProject(await projects.dir(), assertFolder(folder)),
  )
  ipcMain.handle(IPC.projectsDelete, async (_event, folder: unknown) => {
    const dir = await projects.dir()
    const path = safeJoin(dir, assertFolder(folder))
    if (!path) throw new Error('Thư mục dự án không hợp lệ')
    await projects.trash(path)
    return listProjects(dir)
  })
  ipcMain.handle(IPC.projectsReveal, async (_event, folder: unknown) => {
    const path = safeJoin(await projects.dir(), assertFolder(folder), PROJECT_FILE)
    if (path) projects.reveal(path)
  })
}
