import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  shell,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from 'electron'

export type View = 'main' | 'bar' | 'region'

const preload = join(__dirname, '../preload/index.js')

function secureWebPreferences(extra: BrowserWindowConstructorOptions['webPreferences'] = {}) {
  return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, ...extra }
}

function hardenNavigation(win: BrowserWindow) {
  // Link ngoài mở bằng trình duyệt mặc định, không mở trong cửa sổ app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
}

function loadView(win: BrowserWindow, view: View) {
  const hash = view === 'main' ? '' : `/${view}`
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Lumora',
    backgroundColor: '#0b0b10',
    autoHideMenuBar: true,
    // Studio livestream cần chạy đều 30 khung/giây kể cả khi cửa sổ bị che.
    webPreferences: secureWebPreferences({ backgroundThrottling: false }),
  })
  win.once('ready-to-show', () => win.show())
  hardenNavigation(win)
  loadView(win, 'main')
  return win
}

export const BAR_SIZE = { width: 380, height: 64 }

/** Thanh điều khiển nhỏ nổi trên cùng trong lúc quay. Không bị quay vào video (Windows 10 2004+). */
export function createRecordingBar(workArea: Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...BAR_SIZE,
    x: Math.round(workArea.x + (workArea.width - BAR_SIZE.width) / 2),
    y: workArea.y + 16,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Lumora',
    webPreferences: secureWebPreferences({ backgroundThrottling: false }),
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setContentProtection(true)
  win.once('ready-to-show', () => win.showInactive())
  hardenNavigation(win)
  loadView(win, 'bar')
  return win
}

/** Lớp phủ trong suốt phủ kín một màn hình để người dùng kéo chọn vùng quay. */
export function createRegionPicker(bounds: Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    title: 'Lumora',
    webPreferences: secureWebPreferences(),
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.once('ready-to-show', () => {
    win.setBounds(bounds)
    win.show()
    win.focus()
  })
  hardenNavigation(win)
  loadView(win, 'region')
  return win
}
