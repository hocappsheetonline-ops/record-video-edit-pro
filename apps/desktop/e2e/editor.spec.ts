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

/** Chụp khung xem trước (canvas có video khác nguồn nên không đọc pixel trực tiếp được). */
async function previewPixel(page: Page, x: number, y: number): Promise<number[]> {
  const file = join(projectDir, `.preview-${Date.now()}.png`)
  await page.getByTestId('editor-canvas').screenshot({ path: file })
  return pixelAt(file, x, y, 0)
}

const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 12)

test('xem trước đổi ngay khi chỉnh (không cần bấm Play); chế độ dọc 9:16 tự cắt và xuất đúng', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const timecode = await page.getByTestId('timecode').textContent()

  // Đổi nền khi đang dừng: góc khung (phần lề) đổi màu ngay.
  await page.getByTestId('tab-frame').click()
  await page.getByTestId('bg-preset-6').click()
  await expect
    .poll(() => previewPixel(page, 4, 4).then((p) => near(p, [0xf5, 0xf5, 0xf4])))
    .toBe(true)
  await page.getByTestId('bg-preset-0').click()
  await expect
    .poll(() => previewPixel(page, 4, 4).then((p) => near(p, [0xf5, 0xf5, 0xf4])))
    .toBe(false)
  // Vẫn đang dừng ở đúng chỗ cũ.
  await expect(page.getByTestId('timecode')).toHaveText(timecode!)

  // Chế độ dọc: khung 9:16, video phủ kín (góc không còn là nền), lấp đầy được bật sẵn.
  await page.getByTestId('bg-preset-6').click()
  await page.getByTestId('preset-vertical').click()
  await expect
    .poll(() =>
      page
        .getByTestId('editor-canvas')
        .evaluate((c) => [
          (c as unknown as { width: number }).width,
          (c as unknown as { height: number }).height,
        ]),
    )
    .toEqual([720, 1280])
  await expect(page.getByTestId('frame-fill')).toBeChecked()
  await expect
    .poll(() => previewPixel(page, 4, 300).then((p) => near(p, [0xf5, 0xf5, 0xf4])))
    .toBe(false)

  // Webcam dạng dải ở dưới.
  await page.getByTestId('tab-camera').click()
  await page.getByTestId('cam-layout-stack').click()
  await page.getByTestId('cam-stack-bottom').click()

  await page.getByTestId('tab-export').click()
  await page.getByTestId('resolution-720').click()
  await expect(page.getByTestId('export-size')).toHaveText('720 × 1280')
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })

  const [mp4] = exported('.mp4')
  const file = join(projectDir, 'exports', mp4!)
  const info = probeMedia(file)
  expect({ width: info.width, height: info.height }).toEqual({ width: 720, height: 1280 })
  // Kiểu cũ (video 16:9 nằm giữa khung dọc) thì phía trên và dưới là nền. Giờ phía trên là
  // video màn hình (cắt dọc), phía dưới là dải webcam — không còn chỗ nào lộ nền.
  for (const [x, y] of [
    [360, 100],
    [360, 400],
    [360, 900],
    [360, 1180],
  ] as const) {
    const p = pixelAt(file, x, y)
    expect(near(p, [0xf5, 0xf5, 0xf4]), `${x},${y}: ${p}`).toBe(false)
  }

  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.frame).toMatchObject({ aspect: '9:16', fill: true })
  expect(saved.camera).toMatchObject({ layout: 'stack', position: 'bottom-left' })
  expect(errors).toEqual([])
  await app.close()
})
