import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { registerIpc } from './ipc'
import { SecretStore } from './secret-store'
import { SettingsStore } from './settings-store'

// Cho phép test E2E chạy với thư mục dữ liệu riêng, không đụng vào dữ liệu thật của người dùng.
const userDataOverride = process.env.LUMORA_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Lumora',
    backgroundColor: '#0b0b10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Link ngoài mở bằng trình duyệt mặc định, không mở trong cửa sổ app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('app.lumora.desktop')
    // Chỉ dùng cho test E2E trên Linux CI/container không có keyring. Windows luôn dùng DPAPI.
    if (process.platform === 'linux' && process.env.LUMORA_E2E_PLAINTEXT_SECRETS === '1') {
      safeStorage.setUsePlainTextEncryption(true)
    }
    const userData = app.getPath('userData')
    registerIpc(ipcMain, {
      settings: new SettingsStore(join(userData, 'settings.json')),
      secrets: new SecretStore(join(userData, 'secrets.json'), safeStorage),
      appInfo: () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        encryptionAvailable: safeStorage.isEncryptionAvailable(),
      }),
    })

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
