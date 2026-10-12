import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'

test.describe.configure({ timeout: 180_000 })

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
}

test('hướng dẫn lần đầu, phím tắt, đường gióng, lịch sử, xuất chạy nền vẫn chỉnh sửa được', async () => {
  // Hồ sơ mới tinh: chưa xem hướng dẫn.
  writeFileSync(
    join(dirs.userData, 'settings.json'),
    JSON.stringify({ projectsDir: dirs.projects, onboardingDone: false }),
  )
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const steps: string[] = []
  for (let i = 0; i < 5; i++) {
    const card = page.getByTestId('onboarding')
    await expect(card).toBeVisible()
    steps.push((await card.getAttribute('data-step')) ?? '')
    await expect(page.getByTestId('onboarding-ring')).toBeVisible()
    await page.getByTestId('onboarding-next').click()
  }
  expect(steps).toEqual(['library', 'preview', 'timeline', 'properties', 'export'])
  await expect(page.getByTestId('onboarding')).toHaveCount(0)
  await expect
    .poll(
      () => JSON.parse(readFileSync(join(dirs.userData, 'settings.json'), 'utf8')).onboardingDone,
    )
    .toBe(true)

  // Phím ? và đường gióng.
  await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('?')
  await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0)
  await page.getByTestId('guides-toggle').click()
  await expect(page.getByTestId('preview-guides')).toHaveAttribute('data-mode', 'thirds')
  await page.getByTestId('guides-toggle').click()
  await expect(page.getByTestId('preview-guides')).toHaveAttribute('data-mode', 'safe')

  // Lịch sử: thêm chữ rồi quay lại lúc mở dự án.
  await page.getByTestId('lib-text').click()
  await page.getByTestId('text-add-title').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await page.getByTestId('history-open').click()
  await expect(page.getByTestId('history-item').first()).toContainText('Thêm lớp phủ')
  await page.getByTestId('history-item').last().click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(0)
  await page.getByTestId('history-item').first().click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await page.keyboard.press('Escape')

  // Xuất: đóng hộp thoại ngay, vẫn chỉnh sửa; theo dõi ở Việc đang làm; xong có thông báo.
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await page.getByTestId('export-close').click()
  await expect(page.getByTestId('jobs-button')).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByTestId('timeline-marker')).toHaveCount(1)
  await page.getByTestId('jobs-button').click()
  await expect(page.getByTestId('job-item')).toContainText('Xuất MP4')
  await expect(page.getByTestId('job-item')).toHaveAttribute('data-status', 'done', {
    timeout: 150_000,
  })
  await expect(page.getByTestId('toast')).toContainText('mp4')
  expect(readdirSync(join(projectDir, 'exports')).some((f) => f.endsWith('.mp4'))).toBe(true)

  expect(errors).toEqual([])
  await app.close()
})

test('dự án: đổi tên, nhân đôi (không chép video đã xuất)', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('project-rename-open').click()
  await page.getByTestId('project-rename').fill('Hướng dẫn Lumora')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('project-name')).toHaveText('Hướng dẫn Lumora')
  expect(JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')).name).toBe(
    'Hướng dẫn Lumora',
  )
  await page.getByTestId('project-duplicate').click()
  await expect(page.getByTestId('project-name')).toHaveText('Hướng dẫn Lumora (bản sao)')
  const folders = readdirSync(dirs.projects).filter((f) => f.endsWith('.lumora'))
  expect(folders).toHaveLength(2)
  expect(errors).toEqual([])
  await app.close()
})
