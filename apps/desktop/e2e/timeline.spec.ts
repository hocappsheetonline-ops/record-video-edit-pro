import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
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

const saved = () => {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  } catch {
    return {}
  }
}

function saturation(file: string, t: number): number {
  const { stderr } = spawnSync(
    ffmpegPath as unknown as string,
    [
      '-hide_banner',
      '-ss',
      String(t),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      'signalstats,metadata=print',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return Number(/signalstats\.SATAVG=([\d.]+)/.exec(stderr)?.[1] ?? -1)
}

test('timeline: chép / dán, khung chọn nhiều, menu chuột phải, marker + chương, ẩn hàng hiệu ứng khi xuất', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)

  // Chữ ở 0s, chép rồi dán tại 2s.
  await page.getByTestId('lib-text').click()
  await page.getByTestId('text-add-title').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await page.getByTestId('timeline-overlay').click()
  await page.keyboard.press('Control+c')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Control+v')
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(2)
  await expect
    .poll(() => saved().overlays?.map((o: { start: number }) => o.start))
    .toEqual([0, 2000])

  // Kéo khung chọn trên chỗ trống hàng Lớp phủ, bao cả hai khối.
  await page.keyboard.press('Escape')
  // Hai khối chồng giờ nên nằm hai hàng con: bắt đầu kéo ở chỗ trống sau khối đầu.
  const first = (await page.getByTestId('timeline-overlay').first().boundingBox())!
  const second = (await page.getByTestId('timeline-overlay').nth(1).boundingBox())!
  await page.mouse.move(first.x + first.width + 15, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(first.x + 10, second.y + second.height / 2, { steps: 8 })
  await expect(page.getByTestId('marquee')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('[data-testid="timeline-overlay"][data-selected="true"]')).toHaveCount(
    2,
  )

  // Menu chuột phải → xóa cả nhóm, Ctrl+Z trả lại.
  await page.getByTestId('timeline-overlay').first().click({ button: 'right' })
  await page.getByTestId('menu-delete').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(2)

  // Marker ở 1s và 3s, đặt tên, lưu chương.
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('m')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('m')
  await expect(page.getByTestId('timeline-marker')).toHaveCount(2)
  await page.getByTestId('timeline-marker').first().dblclick()
  await page.getByTestId('marker-rename').fill('Giới thiệu')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved().markers?.[0]?.label).toBe('Giới thiệu')
  await page.keyboard.press('Escape')
  await page.getByTestId('tab-markers').click()
  await page.getByTestId('marker-label').nth(1).fill('Demo')
  await page.getByTestId('chapters-save').click()
  await expect(page.getByTestId('chapters-saved')).toBeVisible()
  const txt = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.chapters.txt'))!
  expect(readFileSync(join(projectDir, 'exports', txt), 'utf8')).toBe(
    '0:00 Mở đầu\n0:01 Giới thiệu\n0:03 Demo',
  )

  // Hiệu ứng đen trắng cả video, rồi ẩn hàng Hiệu ứng: video xuất vẫn có màu.
  await page.keyboard.press('Home')
  await page.getByTestId('lib-effects').click()
  await page.getByTestId('effect-add-bw').click()
  await expect(page.getByTestId('timeline-effect')).toHaveCount(1)
  await page.getByTestId('track-effects-hidden').click()
  await expect.poll(() => saved().tracks?.effects?.hidden).toBe(true)
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const mp4 = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.mp4'))!
  expect(saturation(join(projectDir, 'exports', mp4), 0.5)).toBeGreaterThan(30)

  expect(errors).toEqual([])
  await app.close()
})
