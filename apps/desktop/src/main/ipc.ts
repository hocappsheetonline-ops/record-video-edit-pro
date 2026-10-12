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
  type Project,
  type TrackKind,
  type Waveform,
  type Filmstrip,
} from '@lumora/core'
import {
  IPC,
  type ActiveSession,
  type AudioAsset,
  type ImageAsset,
  type MemeItem,
  type AppInfo,
  type CaptureSources,
  type RecorderCapabilities,
  type SegmentStart,
} from '@shared/ipc'
import { validateKey, type Validators } from './key-validation'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiService } from './ai/service'
import type { LiveController } from './live/controller'
import { EXPORTS_DIR, safeFileName, type ExportManager } from './export/manager'
import {
  isProjectFolderName,
  listProjects,
  readEdit,
  readEvents,
  readProject,
  safeJoin,
  writeEdit,
} from './projects/library'
import { exportPack, importPack, packFileName } from './projects/share'
import type { SecretStore } from './secret-store'
import type { UpdateService } from './updater'
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
  waveform(project: Project, dir: string): Promise<Waveform | null>
  filmstrip(project: Project, dir: string): Promise<Filmstrip | null>
  /** Hộp thoại chọn nơi lưu gói chia sẻ (null nếu hủy). */
  pickPackSavePath(defaultName: string): Promise<string | null>
  /** Hộp thoại chọn gói chia sẻ để nhập (null nếu hủy). */
  pickPackToImport(): Promise<string | null>
  /** Hộp thoại chọn file nhạc rồi chép vào dự án (null nếu hủy). */
  importAudio(dir: string): Promise<AudioAsset | null>
  soundEffect(dir: string, id: string): Promise<AudioAsset>
  assetPeaks(dir: string, file: string): Promise<Waveform | null>
  /** Hộp thoại chọn ảnh/GIF rồi chép vào dự án (null nếu hủy). */
  importImage(dir: string): Promise<ImageAsset | null>
  trash(path: string): Promise<void>
  reveal(path: string): void
}

/** Thư viện meme cá nhân (hộp thoại chọn file nằm ở `pickFiles`). */
export interface MemesIpc {
  list(): Promise<MemeItem[]>
  pickAndAdd(): Promise<MemeItem[]>
  remove(file: string): Promise<MemeItem[]>
  useInProject(file: string, projectDir: string): Promise<ImageAsset>
}

export interface IpcDeps {
  settings: SettingsStore
  secrets: SecretStore
  validators?: Validators
  appInfo: () => AppInfo
  recording: RecordingIpc
  projects: ProjectsIpc
  exports: Pick<ExportManager, 'start' | 'write' | 'finish' | 'cancel'>
  ai: Pick<AiService, 'transcribe' | 'getTranscript' | 'suggestCuts' | 'summarize' | 'translate'>
  live: Pick<
    LiveController,
    | 'getConfig'
    | 'updateConfig'
    | 'secrets'
    | 'setSecret'
    | 'openRoom'
    | 'closeRoom'
    | 'start'
    | 'write'
    | 'stop'
    | 'startComments'
    | 'stopComments'
    | 'caption'
  >
  updates: Pick<UpdateService, 'state' | 'check' | 'install'>
  memes: MemesIpc
  openLogs(): Promise<void>
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
  ipcMain.handle(IPC.updateState, () => deps.updates.state)
  ipcMain.handle(IPC.updateCheck, () => deps.updates.check())
  ipcMain.handle(IPC.updateInstall, () => deps.updates.install())
  ipcMain.handle(IPC.openLogs, () => deps.openLogs())
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
  ipcMain.handle(IPC.projectsSharePack, async (_event, folder: unknown, mode: unknown) => {
    if (mode !== 'full' && mode !== 'edits') throw new Error('Kiểu gói không hợp lệ')
    const root = await projects.dir()
    const name = assertFolder(folder)
    const project = await readProject(root, name)
    const dir = safeJoin(root, name)
    if (!project || !dir) throw new Error('Không tìm thấy dự án')
    const out = await projects.pickPackSavePath(packFileName(project, mode))
    if (!out) return null
    const result = await exportPack(dir, project, mode, out)
    projects.reveal(result.path)
    return result
  })
  const projectDir = async (folder: unknown) => {
    const dir = safeJoin(await projects.dir(), assertFolder(folder))
    if (!dir) throw new Error('Thư mục dự án không hợp lệ')
    return dir
  }
  ipcMain.handle(IPC.assetsAddAudio, async (_event, folder: unknown) =>
    projects.importAudio(await projectDir(folder)),
  )
  ipcMain.handle(IPC.assetsAddSfx, async (_event, folder: unknown, id: unknown) => {
    if (typeof id !== 'string') throw new Error('sfx_unknown')
    return projects.soundEffect(await projectDir(folder), id)
  })
  ipcMain.handle(IPC.assetsAddImage, async (_event, folder: unknown) =>
    projects.importImage(await projectDir(folder)),
  )
  ipcMain.handle(IPC.memesList, () => deps.memes.list())
  ipcMain.handle(IPC.memesImport, () => deps.memes.pickAndAdd())
  ipcMain.handle(IPC.memesRemove, (_event, file: unknown) => {
    if (typeof file !== 'string') throw new Error('Tên file không hợp lệ')
    return deps.memes.remove(file)
  })
  ipcMain.handle(IPC.memesUse, async (_event, folder: unknown, file: unknown) => {
    if (typeof file !== 'string') throw new Error('Tên file không hợp lệ')
    return deps.memes.useInProject(file, await projectDir(folder))
  })
  ipcMain.handle(IPC.assetsPeaks, async (_event, folder: unknown, file: unknown) => {
    if (typeof file !== 'string') throw new Error('Tên file không hợp lệ')
    return projects.assetPeaks(await projectDir(folder), file)
  })
  ipcMain.handle(IPC.projectsImportPack, async () => {
    const pack = await projects.pickPackToImport()
    return pack ? importPack(pack, await projects.dir()) : null
  })
  ipcMain.handle(IPC.projectsReveal, async (_event, folder: unknown) => {
    const path = safeJoin(await projects.dir(), assertFolder(folder), PROJECT_FILE)
    if (path) projects.reveal(path)
  })

  ipcMain.handle(IPC.projectsGetEdit, async (_event, folder: unknown) =>
    readEdit(await projects.dir(), assertFolder(folder)),
  )
  ipcMain.handle(IPC.projectsSaveEdit, async (_event, folder: unknown, edit: unknown) => {
    await writeEdit(await projects.dir(), assertFolder(folder), edit)
  })
  ipcMain.handle(IPC.projectsGetEvents, async (_event, folder: unknown) =>
    readEvents(await projects.dir(), assertFolder(folder)),
  )
  const withProject =
    <T>(load: (project: Project, dir: string) => Promise<T>) =>
    async (_event: unknown, folder: unknown): Promise<T | null> => {
      const root = await projects.dir()
      const name = assertFolder(folder)
      const project = await readProject(root, name)
      const path = safeJoin(root, name)
      return project && path ? load(project, path) : null
    }
  ipcMain.handle(IPC.projectsWaveform, withProject(projects.waveform))
  ipcMain.handle(IPC.projectsFilmstrip, withProject(projects.filmstrip))

  ipcMain.handle(IPC.exportStart, async (_event, folder: unknown) => {
    const path = safeJoin(await projects.dir(), assertFolder(folder))
    if (!path) throw new Error('Thư mục dự án không hợp lệ')
    return deps.exports.start(path)
  })
  ipcMain.handle(IPC.exportWrite, (_event, id: unknown, position: unknown, data: unknown) => {
    if (typeof id !== 'string' || typeof position !== 'number')
      throw new Error('Dữ liệu xuất không hợp lệ')
    return deps.exports.write(id, position, asBytes(data))
  })
  ipcMain.handle(IPC.exportFinish, async (_event, id: unknown, folder: unknown, edit: unknown) => {
    if (typeof id !== 'string') throw new Error('Phiên xuất không hợp lệ')
    const dir = await projects.dir()
    const name = assertFolder(folder)
    const project = await readProject(dir, name)
    const path = safeJoin(dir, name)
    if (!project || !path) throw new Error('Dự án không hợp lệ')
    const saved = await writeEdit(dir, name, edit)
    return deps.exports.finish(id, project, saved, path, project.name)
  })
  ipcMain.handle(IPC.exportCancel, (_event, id: unknown) => {
    if (typeof id === 'string') return deps.exports.cancel(id)
  })
  ipcMain.handle(IPC.revealFile, async (_event, path: unknown) => {
    if (typeof path !== 'string') return
    const root = await projects.dir()
    const relative = path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]+/, '') : null
    const safe = relative ? safeJoin(root, relative) : null
    if (safe) projects.reveal(safe)
  })

  const projectPath = async (folder: unknown) => {
    const dir = await projects.dir()
    const name = assertFolder(folder)
    const path = safeJoin(dir, name)
    const project = await readProject(dir, name)
    if (!path || !project) throw new Error('Dự án không hợp lệ')
    return { path, project }
  }

  ipcMain.handle(IPC.aiTranscribe, async (_event, folder: unknown, language: unknown) => {
    const { path, project } = await projectPath(folder)
    const lang =
      typeof language === 'string' && /^[a-z]{2,3}$/i.test(language)
        ? language.toLowerCase()
        : undefined
    return deps.ai.transcribe(project, path, lang)
  })
  ipcMain.handle(IPC.aiGetTranscript, async (_event, folder: unknown) =>
    deps.ai.getTranscript((await projectPath(folder)).path),
  )
  ipcMain.handle(IPC.aiSuggestCuts, async (_event, folder: unknown) =>
    deps.ai.suggestCuts((await projectPath(folder)).path),
  )
  ipcMain.handle(IPC.aiSummarize, async (_event, folder: unknown) =>
    deps.ai.summarize((await projectPath(folder)).path),
  )
  ipcMain.handle(IPC.aiTranslate, (_event, lines: unknown, target: unknown) => {
    if (!Array.isArray(lines) || typeof target !== 'string')
      throw new Error('Dữ liệu dịch không hợp lệ')
    const clean = lines
      .filter(
        (l): l is { id: string; text: string } =>
          typeof l?.id === 'string' && typeof l?.text === 'string',
      )
      .slice(0, 2000)
    return deps.ai.translate(clean, target.slice(0, 8))
  })
  ipcMain.handle(
    IPC.saveExportText,
    async (_event, folder: unknown, fileName: unknown, content: unknown) => {
      const { path } = await projectPath(folder)
      if (typeof fileName !== 'string' || typeof content !== 'string')
        throw new Error('Dữ liệu không hợp lệ')
      const ext = /\.(srt|vtt|txt)$/i.exec(fileName)?.[1]?.toLowerCase()
      if (!ext) throw new Error('Loại file không được phép')
      const dir = join(path, EXPORTS_DIR)
      await mkdir(dir, { recursive: true })
      const name = `${safeFileName(fileName.slice(0, -(ext.length + 1)))}.${ext}`
      const file = join(dir, name)
      await writeFile(file, content, 'utf8')
      return { path: file, fileName: name }
    },
  )

  const { live } = deps
  ipcMain.handle(IPC.liveGetConfig, () => live.getConfig())
  ipcMain.handle(IPC.liveUpdateConfig, (_event, patch: unknown) => live.updateConfig(patch))
  ipcMain.handle(IPC.liveSecrets, () => live.secrets())
  ipcMain.handle(IPC.liveSetSecret, (_event, name: unknown, value: unknown) => {
    if (typeof name !== 'string' || typeof value !== 'string')
      throw new Error('Dữ liệu không hợp lệ')
    return live.setSecret(name as never, value)
  })
  ipcMain.handle(IPC.liveOpenRoom, () => live.openRoom())
  ipcMain.handle(IPC.liveCloseRoom, () => live.closeRoom())
  ipcMain.handle(IPC.liveStart, (_event, video: unknown) => {
    const v = (typeof video === 'object' && video !== null ? video : {}) as Record<string, unknown>
    const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
    return live.start({
      width: num(v.width, 1280),
      height: num(v.height, 720),
      fps: num(v.fps, 30),
    })
  })
  ipcMain.handle(IPC.liveWrite, (_event, data: unknown) => live.write(asBytes(data)))
  ipcMain.handle(IPC.liveStop, () => live.stop())
  ipcMain.handle(IPC.liveCommentsStart, (_event, platforms: unknown) => {
    const list = Array.isArray(platforms)
      ? platforms.filter((p): p is 'youtube' | 'facebook' => p === 'youtube' || p === 'facebook')
      : []
    return live.startComments(list)
  })
  ipcMain.handle(IPC.liveCommentsStop, () => live.stopComments())
  ipcMain.handle(IPC.liveCaption, (_event, data: unknown, language: unknown) =>
    live.caption(
      asBytes(data),
      typeof language === 'string' && /^[a-z]{0,3}$/i.test(language) ? language : '',
    ),
  )
}
