import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject, pixelAt } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'
import { startMockAi } from './mock-ai'

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

const near = (a: number[], b: number[], tol = 40) => a.every((v, i) => Math.abs(v - b[i]!) < tol)

test('chữ theo mẫu + hình vẽ sẵn: phông đi kèm nạp được, xem trước và video xuất đúng màu, đúng chỗ', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)

  // Chữ: mẫu Tiêu đề, nền đỏ đặc, chữ đỏ (cả khung chữ thành đỏ), không hoạt ảnh vào.
  await page.getByTestId('lib-text').click()
  await expect(page.getByTestId('text-add-sunset')).toBeVisible()
  await page.getByTestId('text-add-title').click()
  await page.getByTestId('anim-in-none').click()
  await page.getByTestId('overlay-font').selectOption('anton')
  await page.getByTestId('text-bg').fill('1')
  await page.getByTestId('text-bg-color').fill('#ff0000')
  await page.getByTestId('text-fill').fill('#ff0000')
  await expect.poll(() => saved().overlays?.[0]?.textStyle?.background?.color).toBe('#ff0000')
  expect(saved().overlays[0].textStyle).toMatchObject({
    font: 'anton',
    color: '#ff0000',
    background: { opacity: 1 },
  })
  // Phông đi kèm đã nạp vào trang (dùng được cho canvas).
  const fontsReady = await page.evaluate(() => {
    // Ngữ cảnh e2e không có kiểu DOM: khai báo phần cần dùng.
    const { fonts } = (
      globalThis as unknown as { document: { fonts: { check(f: string): boolean } } }
    ).document
    return fonts.check('40px "Anton"') && fonts.check('900 40px "Be Vietnam Pro"')
  })
  expect(fontsReady).toBe(true)

  // Hình: ngôi sao xanh lá ở giữa khung.
  await page.getByTestId('lib-stickers').click()
  await page.getByTestId('sticker-source-shapes').click()
  await page.getByTestId('shape-color-22c55e').click()
  await page.getByTestId('shape-star').click()
  await page.getByTestId('anim-in-none').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(2)
  await expect(page.getByTestId('props-title')).toHaveText('Ngôi sao')
  await expect.poll(() => saved().overlays?.[1]?.shape).toBe('star')
  expect(saved().overlays[1]).toMatchObject({ kind: 'shape', color: '#22c55e', x: 0.5, y: 0.5 })

  // Xem trước (đầu phát ở 0, lớp phủ hiện từ 0): giữa khung xanh lá, trên giữa đỏ.
  const shot = join(projectDir, '.preview.png')
  await page.waitForTimeout(500)
  await page.getByTestId('editor-canvas').screenshot({ path: shot })
  const box = (await page.getByTestId('editor-canvas').boundingBox())!
  const w = Math.round(box.width)
  const h = Math.round(box.height)
  expect(near(pixelAt(shot, Math.round(w / 2), Math.round(h / 2), 0), [34, 197, 94])).toBe(true)
  expect(near(pixelAt(shot, Math.round(w / 2), Math.round(h * 0.15), 0), [255, 0, 0])).toBe(true)

  // Xuất 720p: cùng màu ở cùng chỗ.
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const exports = readdirSync(join(projectDir, 'exports')).filter((f) => f.endsWith('.mp4'))
  const file = join(projectDir, 'exports', exports[0]!)
  expect(near(pixelAt(file, 640, 360, 1), [34, 197, 94])).toBe(true)
  expect(near(pixelAt(file, 640, 108, 1), [255, 0, 0])).toBe(true)
  // Ngoài ngôi sao (góc giữa hai cánh) không phải màu xanh lá.
  expect(near(pixelAt(file, 640, 108 + 150, 1), [34, 197, 94])).toBe(false)

  expect(errors).toEqual([])
  await app.close()
})

test('kịch bản giọng AI: mỗi dòng thành một đoạn lồng tiếng nối tiếp kèm phụ đề', async () => {
  const mock = await startMockAi()
  try {
    const { app, page, errors } = await launchApp(dirs.userData, {
      env: { LUMORA_ELEVENLABS_BASE_URL: mock.url },
    })
    await page.getByTestId('nav-settings').click()
    const card = page.getByTestId('key-card-elevenlabs')
    await card.getByLabel('ElevenLabs').fill('el_test_key_0123456789abcdef')
    await card.getByRole('button', { name: 'Kiểm tra' }).click()
    await expect(page.getByTestId('key-feedback-elevenlabs')).toHaveText('Key hợp lệ')
    await card.getByRole('button', { name: 'Lưu' }).click()
    await expect(page.getByTestId('key-status-elevenlabs')).toContainText('Đã lưu')

    await openEditor(page)
    await page.getByTestId('lib-audio').click()
    await page.getByTestId('audio-section-script').click()
    await expect(page.getByTestId('script-voice')).toHaveValue('voice-anna')
    await page.getByTestId('script-text').fill('Xin chào các bạn\nHôm nay làm video\n\nBắt đầu nhé')
    await expect(page.getByTestId('script-count')).toHaveText('3 / 40 câu')
    await page.getByTestId('script-generate').click()
    await expect(page.getByTestId('script-done')).toContainText('Đã thêm 3 đoạn', {
      timeout: 30_000,
    })
    await expect(page.getByTestId('timeline-audio')).toHaveCount(3)
    await expect(page.getByTestId('timeline-overlay')).toHaveCount(3)
    expect(mock.requests.filter((r) => r.path === '/v1/text-to-speech/voice-anna')).toHaveLength(3)

    await expect.poll(() => saved().audioClips?.length).toBe(3)
    const { audioClips, overlays } = saved()
    // Nối tiếp, không chồng nhau; phụ đề khớp từng đoạn.
    for (let i = 1; i < 3; i++)
      expect(audioClips[i].start).toBeGreaterThanOrEqual(
        audioClips[i - 1].start + audioClips[i - 1].duration,
      )
    expect(overlays.map((o: { text: string }) => o.text)).toEqual([
      'Xin chào các bạn',
      'Hôm nay làm video',
      'Bắt đầu nhé',
    ])
    expect(overlays[1].start).toBe(audioClips[1].start)
    expect(audioClips.every((c: { kind: string }) => c.kind === 'voice')).toBe(true)

    expect(errors).toEqual([])
    await app.close()
  } finally {
    await mock.close()
  }
})
