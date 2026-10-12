import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, protocol, safeStorage, session, shell } from 'electron'
import { AiService } from './ai/service'
import { ExportManager } from './export/manager'
import { runFfmpeg } from './ffmpeg/runner'
import { registerIpc } from './ipc'
import { LiveController } from './live/controller'
import { GUEST_SCRIPT, guestHtml } from './live/guest-page'
import { SignalingServer } from './live/signaling'
import { Vault } from './vault'
import { handleMediaRequest, MEDIA_SCHEME } from './projects/media-protocol'
import { RecordingController } from './recording/controller'
import { SecretStore } from './secret-store'
import { SettingsStore } from './settings-store'
import { createMainWindow } from './windows'

// Cho phép test E2E chạy với thư mục dữ liệu riêng, không đụng vào dữ liệu thật của người dùng.
const userDataOverride = process.env.LUMORA_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

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

  void app.whenReady().then(() => {
    app.setAppUserModelId('app.lumora.desktop')
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

    registerIpc(ipcMain, {
      settings,
      secrets,
      live,
      ai: new AiService({ getKey: (key) => secrets.get(key), run: runFfmpeg }),
      recording,
      exports: new ExportManager(runFfmpeg),
      projects: {
        dir: projectsDir,
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
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
