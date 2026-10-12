import { dirname, join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron'
import { EVENTS } from '@shared/ipc'
import { AiService } from './ai/service'
import { ExportManager } from './export/manager'
import { runFfmpeg } from './ffmpeg/runner'
import { registerIpc } from './ipc'
import { LiveController } from './live/controller'
import { Logger, loggingIpc } from './logger'
import { UpdateService, type UpdaterLike } from './updater'
import { GUEST_SCRIPT, guestHtml } from './live/guest-page'
import { SignalingServer } from './live/signaling'
import { Vault } from './vault'
import { handleMediaRequest, MEDIA_SCHEME } from './projects/media-protocol'
import { assetPeaks, AUDIO_EXTENSIONS, createSoundEffect, importAudioFile } from './projects/assets'
import { loadFilmstrip } from './projects/filmstrip'
import { importImageFile, MEDIA_EXTENSIONS, MemeLibrary } from './projects/images'
import { PACK_EXTENSION } from './projects/share'
import { loadWaveform } from './projects/waveform'
import { RecordingController } from './recording/controller'
import { SecretStore } from './secret-store'
import { SettingsStore } from './settings-store'
import { createMainWindow } from './windows'

// Cho phép test E2E chạy với thư mục dữ liệu riêng, không đụng vào dữ liệu thật của người dùng.
const userDataOverride = process.env.LUMORA_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

// Nhật ký lỗi: %APPDATA%\Lumora\logs\main.log (đã che API key, stream key).
const logger = new Logger(join(app.getPath('userData'), 'logs', 'main.log'))
process.on('uncaughtException', (error) => logger.error('main', error))
process.on('unhandledRejection', (reason) => logger.error('main', reason))
app.on('render-process-gone', (_event, _wc, details) =>
  logger.warn('renderer', `Giao diện bị dừng: ${details.reason} (exit ${details.exitCode})`),
)
app.on('child-process-gone', (_event, details) => {
  if (details.reason !== 'clean-exit')
    logger.warn('process', `${details.type} dừng: ${details.reason} (exit ${details.exitCode})`)
})

/** Bộ tự cập nhật chỉ chạy ở bản đã cài (đóng gói); chạy từ mã nguồn thì bỏ qua. */
async function loadUpdater(): Promise<UpdaterLike | null> {
  if (!app.isPackaged || process.env.LUMORA_DISABLE_UPDATES === '1') return null
  // electron-updater là CommonJS: khi import động, các export nằm trong `default`.
  type UpdaterModule = typeof import('electron-updater')
  const mod = (await import('electron-updater')) as UpdaterModule & { default?: UpdaterModule }
  const autoUpdater = mod.default?.autoUpdater ?? mod.autoUpdater
  autoUpdater.logger = {
    info: (m: unknown) => void logger.info('update', String(m)),
    warn: (m: unknown) => void logger.warn('update', String(m)),
    error: (m: unknown) => void logger.error('update', m),
    debug: () => undefined,
  }
  return autoUpdater
}

// Giao thức riêng để giao diện phát video trong thư mục dự án (hỗ trợ tua).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
])

let mainWindow: BrowserWindow | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    app.setAppUserModelId('app.lumora.desktop')
    logger.info(
      'app',
      `Lumora ${app.getVersion()} (${process.platform} ${process.arch}, Electron ${process.versions.electron})`,
    )
    // Chỉ dùng cho test E2E trên Linux CI/container không có keyring. Windows luôn dùng DPAPI.
    if (process.platform === 'linux' && process.env.LUMORA_E2E_PLAINTEXT_SECRETS === '1') {
      safeStorage.setUsePlainTextEncryption(true)
    }

    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(ALLOWED_PERMISSIONS.has(permission)),
    )

    const userData = app.getPath('userData')
    const settings = new SettingsStore(join(userData, 'settings.json'))
    const projectsDir = async () =>
      (await settings.get()).projectsDir || join(app.getPath('videos'), 'Lumora')

    protocol.handle(MEDIA_SCHEME, async (request) =>
      handleMediaRequest(request, await projectsDir()),
    )

    const recording = new RecordingController({ mainWindow: () => mainWindow, projectsDir })
    const secrets = new SecretStore(join(userData, 'secrets.json'), safeStorage)
    const live = new LiveController({
      configPath: join(userData, 'live.json'),
      vault: new Vault(join(userData, 'live-secrets.json'), safeStorage),
      signaling: new SignalingServer({ guestHtml, guestScript: GUEST_SCRIPT }),
      projectsDir,
      encoder: () => recording.encoder(),
      run: runFfmpeg,
      send: (channel, payload) => mainWindow?.webContents.send(channel, payload),
      elevenLabsKey: () => secrets.get('elevenlabs'),
    })
    app.on('before-quit', () => void live.shutdown())

    const updates = new UpdateService({
      // Lỗi khi nạp bộ cập nhật không được làm hỏng việc mở app.
      updater: await loadUpdater().catch((error: unknown) => {
        logger.error('update', error)
        return null
      }),
      send: (state) => mainWindow?.webContents.send(EVENTS.updateState, state),
      log: (message) => logger.warn('update', message),
    })

    /** Hộp thoại chọn file theo đuôi (một hoặc nhiều file). */
    const pickFiles = async (extensions: string[], multiple: boolean): Promise<string[]> => {
      const options = {
        properties: multiple ? (['openFile', 'multiSelections'] as const) : (['openFile'] as const),
        filters: [{ name: 'Media', extensions }],
      }
      const r = mainWindow
        ? await dialog.showOpenDialog(mainWindow, {
            ...options,
            properties: [...options.properties],
          })
        : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
      return r.canceled ? [] : r.filePaths
    }
    const memes = new MemeLibrary(join(userData, 'memes'), runFfmpeg)

    registerIpc(loggingIpc(ipcMain, logger), {
      memes: {
        list: () => memes.list(),
        pickAndAdd: async () => {
          const files = await pickFiles(MEDIA_EXTENSIONS, true)
          return files.length > 0 ? memes.add(files) : memes.list()
        },
        add: (paths) => memes.add(paths),
        remove: (file) => memes.remove(file),
        useInProject: (file, dir) => memes.useInProject(file, dir),
      },
      updates,
      openLogs: async () => {
        await shell.openPath(dirname(logger.file))
      },
      settings,
      secrets,
      live,
      ai: new AiService({ getKey: (key) => secrets.get(key), run: runFfmpeg }),
      recording,
      exports: new ExportManager(runFfmpeg),
      projects: {
        dir: projectsDir,
        waveform: (project, dir) => loadWaveform(project, dir, runFfmpeg),
        filmstrip: (project, dir) => loadFilmstrip(project, dir, runFfmpeg),
        pickPackSavePath: async (defaultName) => {
          const options = {
            defaultPath: join(app.getPath('documents'), defaultName),
            filters: [{ name: 'Lumora', extensions: [PACK_EXTENSION] }],
          }
          const r = mainWindow
            ? await dialog.showSaveDialog(mainWindow, options)
            : await dialog.showSaveDialog(options)
          return r.canceled || !r.filePath ? null : r.filePath
        },
        importAudio: async (dir) => {
          const options = {
            properties: ['openFile' as const],
            filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
          }
          const r = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options)
          const file = r.canceled ? null : r.filePaths[0]
          return file ? importAudioFile(file, dir, runFfmpeg) : null
        },
        soundEffect: (dir, id) => createSoundEffect(id, dir, runFfmpeg),
        importImage: async (dir) => {
          const file = await pickFiles(MEDIA_EXTENSIONS, false)
          return file[0] ? importImageFile(file[0], dir, runFfmpeg) : null
        },
        assetPeaks: (dir, file) => assetPeaks(dir, file, runFfmpeg),
        pickPackToImport: async () => {
          const options = {
            properties: ['openFile' as const],
            filters: [{ name: 'Lumora', extensions: [PACK_EXTENSION] }],
          }
          const r = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options)
          return r.canceled ? null : (r.filePaths[0] ?? null)
        },
        trash: (path) => shell.trashItem(path),
        reveal: (path) => shell.showItemInFolder(path),
      },
      appInfo: () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        encryptionAvailable: safeStorage.isEncryptionAvailable(),
      }),
    })

    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
      // Đóng cửa sổ chính khi đang quay: lưu lại phần đã quay.
      if (recording.isRecording) void recording.finish().catch(() => undefined)
    })
    // Kiểm tra bản mới sau khi app mở xong (không làm chậm lúc khởi động), rồi 4 giờ một lần.
    updates.schedule()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
