import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createTestDirs, launchApp, probeMedia, type TestDirs } from './helpers'

// Quay thật: ffmpeg quay màn hình (ddagrab/gdigrab trên Windows, x11grab trên Linux),
// webcam và micro giả của Chromium được ghi bằng MediaRecorder.
test.describe.configure({ timeout: 120_000 })

let dirs: TestDirs
test.beforeEach(() => {
  dirs = createTestDirs()
})
test.afterEach(() => dirs.cleanup())

function projectFolder(): string {
  const folders = readdirSync(dirs.projects).filter((f) => f.endsWith('.lumora'))
  expect(folders).toHaveLength(1)
  return join(dirs.projects, folders[0]!)
}

interface SavedProject {
  engine: string
  cursorHidden: boolean
  hasEvents: boolean
  inputMode: 'hook' | 'poll' | null
  source: { kind: string; captureRect: { width: number; height: number } | null }
  segments: { index: number; tracks: Record<string, { file: string; startedAt: number }> }[]
}

function readProject(folder: string): SavedProject {
  return JSON.parse(readFileSync(join(folder, 'project.json'), 'utf8')) as SavedProject
}

/** Chờ dò xong khả năng quay và tải xong danh sách màn hình. */
async function waitForEngine(page: Page) {
  await expect(page.locator('[data-testid^="display-"]').first()).toBeVisible()
  await expect(page.getByTestId('engine-info')).not.toHaveText(/Đang kiểm tra/, { timeout: 60_000 })
  return (await page.getByTestId('engine-info').textContent()) ?? ''
}

/** Chọn webcam và micro giả đầu tiên, tắt đếm ngược. */
async function chooseDevices(page: Page) {
  await expect(page.getByTestId('camera-select').locator('option')).not.toHaveCount(1)
  await page.getByTestId('camera-select').selectOption({ index: 1 })
  await page.getByTestId('mic-select').selectOption({ index: 1 })
  await page.getByTestId('countdown-select').selectOption('0')
}

async function startRecording(app: ElectronApplication, page: Page): Promise<Page> {
  const barPromise = app.waitForEvent('window')
  await page.getByTestId('start-recording').click()
  const bar = await barPromise
  await expect(bar.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'recording', {
    timeout: 30_000,
  })
  return bar
}

test('quay toàn màn hình kèm webcam, micro; tạm dừng rồi quay tiếp; phát lại được', async () => {
  const { app, page } = await launchApp(dirs.userData)
  const engine = await waitForEngine(page)
  expect(engine).toContain('FFmpeg')
  await chooseDevices(page)

  const bar = await startRecording(app, page)
  await page.waitForTimeout(2500)
  await bar.getByTestId('bar-pause').click()
  await expect(bar.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'paused')
  await page.waitForTimeout(1000)
  await bar.getByTestId('bar-pause').click()
  await expect(bar.getByTestId('recording-bar')).toHaveAttribute('data-phase', 'recording')
  await page.waitForTimeout(1500)
  await bar.getByTestId('bar-stop').click()

  // Quay xong, app tự mở dự án vừa lưu.
  await expect(page.getByTestId('project-detail')).toBeVisible({ timeout: 60_000 })
  const folder = projectFolder()
  const project = readProject(folder)
  expect(project).toMatchObject({ engine: 'ffmpeg', cursorHidden: true, hasEvents: true })
  expect(project.source.kind).toBe('display')
  // Trên Windows, hook chuột/bàn phím (uiohook) phải chạy được để có dữ liệu click cho auto-zoom.
  if (process.platform === 'win32') expect(project.inputMode).toBe('hook')
  else expect(project.inputMode).not.toBeNull()
  expect(project.segments).toHaveLength(2)
  expect(Object.keys(project.segments[0]!.tracks).sort()).toEqual(['camera', 'mic', 'screen'])

  const files = readdirSync(folder)
  expect(files).toEqual(expect.arrayContaining(['events.jsonl', 'thumbnail.jpg']))
  expect(files.filter((f) => f.includes('.rec.'))).toEqual([])

  const screen = probeMedia(join(folder, 'seg0-screen.mkv'))
  expect(screen.durationMs).toBeGreaterThan(1500)
  expect(screen.width).toBe(project.source.captureRect!.width)
  expect(screen.height).toBe(project.source.captureRect!.height)
  const camera = probeMedia(join(folder, 'seg0-camera.mkv'))
  expect(camera.durationMs).toBeGreaterThan(1500)
  const mic = probeMedia(join(folder, 'seg0-mic.webm'))
  expect(mic.hasAudio).toBe(true)
  expect(mic.durationMs).toBeGreaterThan(1500)
  expect(probeMedia(join(folder, 'seg1-screen.mkv')).durationMs).toBeGreaterThan(800)

  // Trình phát đọc được video qua giao thức lumora-media.
  const screenVideo = page.getByTestId('player-screen')
  await expect
    .poll(() => screenVideo.evaluate((v) => (v as unknown as { readyState: number }).readyState), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(1)
  expect(
    await screenVideo.evaluate((v) => (v as unknown as { duration: number }).duration),
  ).toBeGreaterThan(1.5)
  await expect(page.getByTestId('player-camera')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(2)

  // Danh sách dự án hiện bản quay mới.
  await page.getByTestId('nav-projects').click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await app.close()
})

test('quay một vùng: video đúng kích thước vùng đã chọn', async () => {
  const { app, page } = await launchApp(dirs.userData)
  await waitForEngine(page)
  await page.getByTestId('mode-region').click()
  await page.getByTestId('countdown-select').selectOption('0')

  const pickerPromise = app.waitForEvent('window')
  await page.getByTestId('pick-region').click()
  const picker = await pickerPromise
  await picker.getByTestId('region-picker').waitFor()
  await picker.mouse.move(100, 100)
  await picker.mouse.down()
  await picker.mouse.move(500, 340, { steps: 5 })
  await picker.mouse.up()
  // Bấm xác nhận đóng luôn cửa sổ chọn vùng: chờ cửa sổ đóng thay vì chờ lượt bấm "xong"
  // (Playwright có thể báo trang đã đóng giữa chừng). Kết quả được kiểm tra ngay bên dưới.
  await Promise.all([
    picker.waitForEvent('close'),
    picker
      .getByTestId('region-confirm')
      .click()
      .catch(() => undefined),
  ])
  await expect(page.getByTestId('region-info')).toContainText('400 × 240')

  const bar = await startRecording(app, page)
  await page.waitForTimeout(1500)
  await bar.getByTestId('bar-stop').click()
  await expect(page.getByTestId('project-detail')).toBeVisible({ timeout: 60_000 })

  const folder = projectFolder()
  const project = readProject(folder)
  expect(project.source.kind).toBe('region')
  const scale = await page.evaluate(
    () => (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio,
  )
  const expected = {
    width: Math.floor((400 * scale) / 2) * 2,
    height: Math.floor((240 * scale) / 2) * 2,
  }
  expect(project.source.captureRect).toMatchObject(expected)
  const info = probeMedia(join(folder, 'seg0-screen.mkv'))
  expect({ width: info.width, height: info.height }).toEqual(expected)
  await app.close()
})

test('không có FFmpeg: dùng bộ quay của Electron', async () => {
  const { app, page } = await launchApp(dirs.userData, { env: { LUMORA_DISABLE_FFMPEG: '1' } })
  expect(await waitForEngine(page)).toContain('bộ quay dự phòng')
  await expect(page.getByTestId('mode-region')).toBeDisabled()
  await page.getByTestId('countdown-select').selectOption('0')

  const bar = await startRecording(app, page)
  await page.waitForTimeout(2000)
  await bar.getByTestId('bar-stop').click()
  await expect(page.getByTestId('project-detail')).toBeVisible({ timeout: 60_000 })

  const folder = projectFolder()
  const project = readProject(folder)
  expect(project).toMatchObject({ engine: 'browser', cursorHidden: false })
  expect(probeMedia(join(folder, 'seg0-screen.mkv')).durationMs).toBeGreaterThan(1000)
  await app.close()
})

test('hủy bản quay sẽ xóa sạch file', async () => {
  const { app, page } = await launchApp(dirs.userData)
  await waitForEngine(page)
  await page.getByTestId('countdown-select').selectOption('0')
  const bar = await startRecording(app, page)
  await page.waitForTimeout(1000)
  const closed = bar.waitForEvent('close')
  await bar.getByTestId('bar-cancel').click()
  await bar.getByTestId('bar-cancel').click()
  await closed
  await expect.poll(() => readdirSync(dirs.projects)).toEqual([])
  expect(existsSync(dirs.projects)).toBe(true)
  await page.getByTestId('nav-projects').click()
  await expect(page.getByText(/Chưa có dự án nào/)).toBeVisible()
  await app.close()
})
