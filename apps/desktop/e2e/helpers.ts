import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

// Chạy thư mục app (đọc package.json) giống bản cài thật, để tên và phiên bản app đúng.
const APP_DIR = join(__dirname, '..')

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  errors: string[]
}

export interface TestDirs {
  userData: string
  projects: string
  cleanup(): void
}

export function createTestDirs(): TestDirs {
  const userData = mkdtempSync(join(tmpdir(), 'lumora-e2e-'))
  const projects = join(userData, 'projects')
  mkdirSync(projects)
  // Lưu dự án vào thư mục tạm thay vì thư mục Videos thật của máy.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ projectsDir: projects }))
  return { userData, projects, cleanup: () => rmSync(userData, { recursive: true, force: true }) }
}

export async function launchApp(
  userDataDir: string,
  options: { env?: Record<string, string> } = {},
): Promise<LaunchedApp> {
  const args = [
    APP_DIR,
    // Webcam và micro giả của Chromium, tự cấp quyền.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ]
  if (process.platform === 'linux') {
    // Container Linux không có keyring; Electron chạy bằng root cần tắt sandbox của Chromium.
    args.push('--password-store=basic')
    if (process.getuid?.() === 0) args.push('--no-sandbox')
  }
  const app = await electron.launch({
    args,
    env: {
      ...process.env,
      LUMORA_USER_DATA_DIR: userDataDir,
      LUMORA_E2E_PLAINTEXT_SECRETS: '1',
      ELECTRON_RENDERER_URL: '',
      ...options.env,
    },
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.getByTestId('nav-record').waitFor()
  return { app, page, errors }
}

export interface MediaInfo {
  durationMs: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
}

/** Đọc thông tin file media bằng ffmpeg đóng gói kèm app. */
export function probeMedia(file: string): MediaInfo {
  let stderr = ''
  try {
    execFileSync(ffmpegPath as unknown as string, ['-hide_banner', '-i', file], { stdio: 'pipe' })
  } catch (error) {
    // `ffmpeg -i` không có đầu ra nên luôn thoát với mã lỗi; thông tin nằm trong stderr.
    stderr = String((error as { stderr?: Buffer }).stderr ?? '')
  }
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr)
  const video = /Stream #.*Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr)
  return {
    durationMs: duration
      ? Math.round(
          (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000,
        )
      : null,
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
    hasAudio: /Stream #.*Audio:/.test(stderr),
  }
}
