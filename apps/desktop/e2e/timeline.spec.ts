import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject, pixelAt } from './fixtures'
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

test('nhập video ngoài làm clip chính, kéo thẻ hiệu ứng vào timeline, tách tiếng clip; video xuất có cảnh nhập ở cuối', async () => {
  // Video ngoài: 2 giây màu đỏ có tiếng 880 Hz.
  const red = join(dirs.userData, 'red.mov')
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=640x360:r=30:d=2',
    '-f',
    'lavfi',
    '-i',
    'sine=f=880:d=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    red,
  ])
  const { app, page, errors } = await launchApp(dirs.userData)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, red)
  await openEditor(page)
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  await page.getByTestId('lib-media').click()
  await page.getByTestId('import-video').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2, { timeout: 60_000 })
  await expect(page.getByTestId('timecode')).toContainText('/ 0:06.0')
  const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'))
  expect(project.segments.at(-1)).toMatchObject({ kind: 'imported' })
  expect(project.segments.at(-1).tracks.system.file).toMatch(/^import\d+-system\.m4a$/)
  // Dải phim tạo lại có cả đoạn mới.
  await expect(
    page.getByTestId('timeline-clip').nth(1).getByTestId('filmstrip-tile').first(),
  ).toBeVisible({ timeout: 30_000 })

  // Kéo thẻ "Rung lắc" thả vào hàng Hiệu ứng ở khoảng 3 giây.
  await page.getByTestId('lib-effects').click()
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!
  const clipRow = (await page.getByTestId('timeline-clip').first().boundingBox())!
  await page.getByTestId('effect-add-shake').dragTo(page.getByTestId('timeline-ruler'), {
    targetPosition: { x: (ruler.width * 3) / 6, y: ruler.height / 2 },
  })
  await expect(page.getByTestId('timeline-effect')).toHaveCount(1)
  await expect.poll(() => saved().effects?.[0]?.start ?? -1).toBeGreaterThan(2700)
  expect(saved().effects[0].start).toBeLessThan(3300)
  expect(clipRow.height).toBeGreaterThan(0)

  // Tách tiếng clip đầu (menu chuột phải).
  await page.getByTestId('timeline-clip').first().click({ button: 'right' })
  await page.getByTestId('menu-detach-clip').click()
  await expect.poll(() => saved().clips?.[0]?.audio?.muted).toBe(true)
  expect(saved().audioClips.length).toBeGreaterThan(0)

  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const mp4 = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.mp4'))!
  const file = join(projectDir, 'exports', mp4)
  // Giây 5 (trong đoạn nhập): giữa khung là màu đỏ của video ngoài; giây 1 thì không.
  const [r5, g5, b5] = pixelAt(file, 640, 360, 5)
  expect(r5).toBeGreaterThan(180)
  expect(g5 + b5).toBeLessThan(120)
  const [r1, g1, b1] = pixelAt(file, 640, 360, 1)
  expect(r1 > 180 && g1 + b1 < 120).toBe(false)
  // Có tiếng 880 Hz của video nhập ở giây 5.
  const { stderr } = spawnSync(
    ffmpegPath as unknown as string,
    ['-hide_banner', '-ss', '4.5', '-t', '1', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  expect(Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -100)).toBeGreaterThan(-40)

  expect(errors).toEqual([])
  await app.close()
})
