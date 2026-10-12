import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp } from './helpers'
import { startMockAi } from './mock-ai'

/**
 * Chụp ảnh giao diện cho phần "Hướng dẫn sử dụng" của README (docs/images). Chỉ chạy khi
 * LUMORA_DOCS=1: `LUMORA_DOCS=1 npx playwright test e2e/docs.spec.ts`.
 */
test.skip(process.env.LUMORA_DOCS !== '1', 'chỉ chạy khi tạo ảnh tài liệu')
test.describe.configure({ timeout: 180_000 })

const OUT = join(__dirname, '..', '..', '..', 'docs', 'images')

test('ảnh hướng dẫn', async () => {
  mkdirSync(OUT, { recursive: true })
  const dirs = createTestDirs()
  createFixtureProject(dirs.projects)
  const mock = await startMockAi()
  const { app, page } = await launchApp(dirs.userData, {
    env: { LUMORA_ELEVENLABS_BASE_URL: mock.url, LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })
  const shot = (name: string) =>
    page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80 })
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.waitForTimeout(2500)
    await shot('record')
    await page.getByTestId('nav-settings').click()
    const card = page.getByTestId('key-card-elevenlabs')
    await card.getByLabel('ElevenLabs').fill('el_test_key_0123456789abcdef')
    await card.getByRole('button', { name: 'Lưu' }).click()
    await page.getByTestId('nav-projects').click()
    await page.getByTestId('project-card').click()
    await page.getByTestId('open-editor').click()
    await expect(page.getByTestId('editor')).toBeVisible()

    // Trình chỉnh sửa: chữ + hiệu ứng + marker.
    await page.getByTestId('lib-text').click()
    await page.getByTestId('text-add-neon').click()
    await page.getByTestId('overlay-edit-text').fill('Lumora')
    await page.getByTestId('lib-stickers').click()
    await page.getByTestId('sticker-source-shapes').click()
    await page.getByTestId('shape-arrow').click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('m')
    await page.waitForTimeout(800)
    await shot('editor')

    await page.getByTestId('lib-text').click()
    await page.getByTestId('timeline-overlay').first().click()
    await page.waitForTimeout(500)
    await shot('text')

    await page.getByTestId('timeline-overlay').first().click({ button: 'right' })
    await page.waitForTimeout(300)
    await shot('timeline-menu')
    await page.keyboard.press('Escape')

    await page.getByTestId('lib-captions').click()
    await page.getByTestId('captions-generate').click()
    await expect(page.getByTestId('caption-line')).toHaveCount(2)
    await page.getByTestId('caption-template-tiktok').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(800)
    await shot('captions')

    await page.getByTestId('export-open').click()
    await page.waitForTimeout(300)
    await shot('export')
  } finally {
    await app.close()
    await mock.close()
    dirs.cleanup()
  }
})
