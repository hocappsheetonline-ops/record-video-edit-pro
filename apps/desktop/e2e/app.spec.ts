import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

// Chạy thư mục app (đọc package.json) giống bản cài thật, để tên và phiên bản app đúng.
const APP_DIR = join(__dirname, '..')
const CLAUDE_KEY = 'sk-ant-api03-e2e-test-key-abcdefghijklmnop-9876'

let userDataDir: string

async function launch(): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const args = [APP_DIR]
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

test.beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'lumora-e2e-'))
})

test.afterEach(async () => {
  await rm(userDataDir, { recursive: true, force: true })
})

test('mở app, hiện cửa sổ Lumora với giao diện tiếng Việt', async () => {
  const { app, page, errors } = await launch()
  expect(await page.title()).toBe('Lumora')
  await expect(page.getByTestId('nav-record')).toHaveText('Quay')
  await expect(page.getByRole('heading', { name: 'Quay màn hình' })).toBeVisible()

  // Giao diện không được truy cập Node.js, chỉ dùng API an toàn qua window.lumora.
  const isolated = await page.evaluate(() => {
    const win = globalThis as { require?: unknown; lumora?: { getSettings?: unknown } }
    return {
      hasRequire: typeof win.require !== 'undefined',
      hasApi: typeof win.lumora?.getSettings === 'function',
    }
  })
  expect(isolated).toEqual({ hasRequire: false, hasApi: true })
  expect(errors).toEqual([])
  await app.close()
})

test('điều hướng qua các màn hình', async () => {
  const { app, page } = await launch()
  const pages = [
    ['nav-projects', 'Dự án'],
    ['nav-editor', 'Trình chỉnh sửa'],
    ['nav-live', 'Livestream'],
    ['nav-settings', 'Cài đặt'],
    ['nav-record', 'Quay màn hình'],
  ] as const
  for (const [testId, heading] of pages) {
    await page.getByTestId(testId).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
  }
  await app.close()
})

test('lưu API key đã mã hóa và giữ lại sau khi mở lại app', async () => {
  let { app, page } = await launch()
  await page.getByTestId('nav-settings').click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByTestId('app-version')).toHaveText('Lumora · Phiên bản 0.1.0')

  const card = page.getByTestId('key-card-anthropic')
  await card.getByLabel('Claude (Anthropic)').fill(CLAUDE_KEY)
  await card.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('Đã lưu: sk-a••••••••9876')
  await app.close()

  const onDisk = await readFile(join(userDataDir, 'secrets.json'), 'utf8')
  expect(onDisk).toContain('anthropic')
  expect(onDisk).not.toContain(CLAUDE_KEY)

  ;({ app, page } = await launch())
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('Đã lưu: sk-a••••••••9876')

  await page.getByTestId('key-card-anthropic').getByRole('button', { name: 'Xóa' }).click()
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('Chưa nhập')
  await app.close()
})

test('báo lỗi khi key sai định dạng mà không cần mạng', async () => {
  const { app, page } = await launch()
  await page.getByTestId('nav-settings').click()
  const card = page.getByTestId('key-card-elevenlabs')
  await card.getByLabel('ElevenLabs').fill('ngan')
  await card.getByRole('button', { name: 'Kiểm tra' }).click()
  await expect(page.getByTestId('key-feedback-elevenlabs')).toHaveText(
    'Key quá ngắn, có thể bạn dán thiếu',
  )
  await app.close()
})

test('đổi ngôn ngữ và giao diện, giữ lại sau khi mở lại app', async () => {
  let { app, page } = await launch()
  await page.getByTestId('nav-settings').click()
  await page.getByLabel('Ngôn ngữ').selectOption('en')
  await expect(page.getByTestId('nav-record')).toHaveText('Record')
  await page.getByLabel('Theme').selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await app.close()

  ;({ app, page } = await launch())
  await expect(page.getByTestId('nav-record')).toHaveText('Record')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await app.close()
})
