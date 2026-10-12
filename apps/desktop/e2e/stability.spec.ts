import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'

test.describe.configure({ timeout: 240_000 })

let dirs: TestDirs
let projectDir: string
test.beforeEach(() => {
  dirs = createTestDirs()
  projectDir = createFixtureProject(dirs.projects)
})
test.afterEach(() => dirs.cleanup())

async function openEditor(page: Page) {
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('editor')).toBeVisible()
  await expect(page.getByTestId('timeline-clip').first()).toBeVisible()
}

test('app tắt đột ngột khi đang chỉnh sửa: mở lại thấy bản tự lưu và thông báo khôi phục', async () => {
  const first = await launchApp(dirs.userData)
  await openEditor(first.page)
  await first.page.getByTestId('lib-text').click()
  await first.page.getByTestId('text-add-title').click()
  await expect
    .poll(() => {
      try {
        return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8')).overlays?.length
      } catch {
        return 0
      }
    })
    .toBe(1)
  expect(existsSync(join(projectDir, '.editing.lock'))).toBe(true)
  // Tắt ngang (như mất điện): không kịp gỡ khóa.
  first.app.process().kill('SIGKILL')
  await new Promise((r) => setTimeout(r, 1000))

  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await expect(page.getByTestId('toast')).toContainText('tắt đột ngột')
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  // Rời trình chỉnh sửa bình thường thì gỡ khóa; mở lại không báo nữa.
  await page.getByTestId('editor-back').click()
  await expect.poll(() => existsSync(join(projectDir, '.editing.lock'))).toBe(false)
  expect(errors).toEqual([])
  await app.close()
})

test('lỗi giao diện được ghi vào main.log; tỉ lệ xem trước 200% cuộn được', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('lumora-test-boom')
    })
  })
  const log = join(dirs.userData, 'logs', 'main.log')
  await expect
    .poll(() => (existsSync(log) ? readFileSync(log, 'utf8') : ''), { timeout: 10_000 })
    .toContain('lumora-test-boom')
  expect(readFileSync(log, 'utf8')).toMatch(/ERROR \[renderer\]/)

  const canvas = page.getByTestId('editor-canvas')
  const fit = (await canvas.boundingBox())!
  await page.getByTestId('preview-zoom').selectOption('200')
  await expect(canvas).toHaveAttribute('data-zoom', '200')
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(2000)
  const area = page.getByTestId('player-area')
  expect(await area.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await page.getByTestId('preview-zoom').selectOption('fit')
  await expect
    .poll(async () => Math.round((await canvas.boundingBox())!.width))
    .toBe(Math.round(fit.width))
  expect(errors.filter((e) => !e.includes('lumora-test-boom'))).toEqual([])
  await app.close()
})

test('mở / đóng trình chỉnh sửa nhiều lần không rò rỉ bộ nhớ', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  const cdp = await page.context().newCDPSession(page)
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('HeapProfiler.collectGarbage')
    const r = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }
    return r.usedSize
  }
  const cycle = async () => {
    await openEditor(page)
    await page.getByTestId('play').click()
    await page.waitForTimeout(300)
    await page.getByTestId('play').click()
    await page.getByTestId('editor-back').click()
    await expect(page.getByTestId('editor')).toHaveCount(0)
  }
  // Hai vòng khởi động (nạp mã, phông chữ, bộ nhớ đệm) rồi mới đo.
  await cycle()
  await cycle()
  const before = await heap()
  for (let i = 0; i < 10; i++) await cycle()
  const after = await heap()
  console.log(`heap: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`)
  expect(after).toBeLessThan(before * 1.3)
  expect(errors).toEqual([])
  await app.close()
})
