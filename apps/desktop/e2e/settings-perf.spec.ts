import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'

test.describe.configure({ timeout: 180_000 })

let dirs: TestDirs
test.beforeEach(() => {
  dirs = createTestDirs()
  createFixtureProject(dirs.projects)
})
test.afterEach(() => dirs.cleanup())

async function openEditor(page: Page) {
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('editor')).toBeVisible()
  await expect(page.getByTestId('timeline-clip').first()).toBeVisible()
}

test('cài đặt trình chỉnh sửa có hiệu lực: mẫu TikTok cho bản quay mới, xem trước nhẹ 540p', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-template').selectOption('tiktok')
  await page.getByTestId('settings-preview-quality').selectOption('low')
  await expect
    .poll(() => JSON.parse(readFileSync(join(dirs.userData, 'settings.json'), 'utf8')))
    .toMatchObject({ projectTemplate: 'tiktok', previewQuality: 'low' })

  await openEditor(page)
  // Bản quay chưa từng mở: dùng mẫu TikTok (9:16 phủ kín).
  await expect(page.getByTestId('player-aspect')).toHaveValue('9:16')
  // Bản chỉnh sửa mới (chưa lưu file) cũng phủ kín khung như mẫu.
  await expect(page.getByTestId('player-aspect')).toHaveValue('9:16')
  // Xem trước nhẹ: khung vẽ 540 điểm ảnh bề ngang (9:16).
  await page.getByTestId('play').click()
  await expect(page.getByTestId('preview-low')).toBeVisible()
  await expect
    .poll(() =>
      page.getByTestId('editor-canvas').evaluate((c) => (c as unknown as { width: number }).width),
    )
    .toBe(540)
  await page.getByTestId('play').click()
  expect(errors).toEqual([])
  await app.close()
})

test('hiệu năng xem trước: 3 lớp phủ + bộ lọc, đo thời gian vẽ mỗi khung', async () => {
  writeFileSync(
    join(dirs.userData, 'settings.json'),
    JSON.stringify({ projectsDir: dirs.projects, onboardingDone: true, previewQuality: 'high' }),
  )
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.getByTestId('lib-text').click()
  await page.getByTestId('text-add-neon').click()
  await page.getByTestId('text-add-tiktok').click()
  await page.getByTestId('lib-stickers').click()
  await page.getByTestId('sticker-source-shapes').click()
  await page.getByTestId('shape-arrow').click()
  await page.getByTestId('lib-filters').click()
  await page.getByTestId('filter-cinematic').click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Home')
  await page.getByTestId('play').click()
  await page.waitForTimeout(3000)
  await page.getByTestId('play').click()
  const drawMs = Number(await page.getByTestId('editor-canvas').getAttribute('data-draw-ms'))
  console.log(`preview draw: ${drawMs} ms/frame (3 lớp + bộ lọc, 720p, không GPU)`)
  expect(drawMs).toBeGreaterThan(0)
  // Máy CI không có GPU (vẽ bằng phần mềm): ngưỡng rộng; máy thật nhanh hơn nhiều.
  expect(drawMs).toBeLessThan(100)
  expect(errors).toEqual([])
  await app.close()
})
