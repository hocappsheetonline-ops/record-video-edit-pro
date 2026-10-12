import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject, pixelAt } from './fixtures'
import { createTestDirs, launchApp, probeMedia, type TestDirs } from './helpers'

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

function exported(ext: string): string[] {
  return readdirSync(join(projectDir, 'exports')).filter(
    (f) => f.endsWith(ext) && !f.startsWith('.'),
  )
}

test('chỉnh sửa: tự động zoom, cắt bớt, đổi nền rồi xuất MP4 và GIF đúng', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)

  // Hai click gần nhau → một đoạn zoom tự động.
  await page.getByTestId('tab-zoom').click()
  await expect(page.getByTestId('zoom-count')).toHaveText('1 đoạn zoom')
  await expect(page.getByTestId('timeline-zoom')).toHaveCount(1)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  // Tách ở giây 1 và 2 rồi xóa đoạn giữa: còn 3 giây.
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3)
  await page.getByTestId('timeline-clip').nth(1).click()
  await page.getByTestId('delete').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:03.0')

  // Hoàn tác rồi làm lại.
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3)
  await page.getByTestId('redo').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)

  // Nền trơn màu sáng (#f5f5f4).
  await page.getByTestId('tab-frame').click()
  await page.getByTestId('bg-preset-6').click()

  // Xuất MP4 720p.
  await page.getByTestId('tab-export').click()
  await page.getByTestId('resolution-720').click()
  await expect(page.getByTestId('export-size')).toHaveText('1280 × 720')
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })

  const [mp4] = exported('.mp4')
  expect(mp4).toBeTruthy()
  const file = join(projectDir, 'exports', mp4!)
  const info = probeMedia(file)
  expect({ width: info.width, height: info.height }).toEqual({ width: 1280, height: 720 })
  expect(info.hasAudio).toBe(true)
  expect(info.durationMs).toBeGreaterThan(2800)
  expect(info.durationMs).toBeLessThan(3300)
  // Góc khung là màu nền đã chọn; giữa khung là video (không phải màu nền).
  const corner = pixelAt(file, 4, 4)
  const background = [0xf5, 0xf5, 0xf4]
  corner.forEach((value, i) => expect(Math.abs(value - background[i]!)).toBeLessThan(10))
  expect(pixelAt(file, 640, 360)).not.toEqual(corner)

  // Bản chỉnh sửa được lưu lại.
  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.clips).toHaveLength(2)
  expect(saved.frame.background.color).toBe('#f5f5f4')

  // Xuất GIF.
  await page.getByTestId('format-gif').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toContainText('.gif', { timeout: 150_000 })
  const [gif] = exported('.gif')
  expect(
    readFileSync(join(projectDir, 'exports', gif!))
      .subarray(0, 6)
      .toString('ascii'),
  ).toBe('GIF89a')

  expect(errors).toEqual([])
  await app.close()
})

test('mở lại app: bản chỉnh sửa vẫn còn', async () => {
  let { app, page } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  // Chờ tự lưu.
  await expect
    .poll(() => {
      try {
        return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8')).clips.length
      } catch {
        return 0
      }
    })
    .toBe(2)
  await app.close()
  ;({ app, page } = await launchApp(dirs.userData))
  await openEditor(page)
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  await app.close()
})
