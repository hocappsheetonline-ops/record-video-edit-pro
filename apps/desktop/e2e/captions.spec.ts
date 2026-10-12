import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'
import { startMockAi } from './mock-ai'

test.describe.configure({ timeout: 180_000 })

let dirs: TestDirs
let projectDir: string
let mock: Awaited<ReturnType<typeof startMockAi>>
test.beforeEach(async () => {
  dirs = createTestDirs()
  projectDir = createFixtureProject(dirs.projects)
  mock = await startMockAi()
})
test.afterEach(async () => {
  await mock.close()
  dirs.cleanup()
})

async function saveKey(page: Page, key: 'elevenlabs' | 'anthropic', label: string, value: string) {
  const card = page.getByTestId(`key-card-${key}`)
  await card.getByLabel(label).fill(value)
  await card.getByRole('button', { name: 'Kiểm tra' }).click()
  await expect(page.getByTestId(`key-feedback-${key}`)).toHaveText('Key hợp lệ')
  await card.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByTestId(`key-status-${key}`)).toContainText('Đã lưu')
}

/** Số điểm ảnh gần màu `rgb` trong vùng (x, y, w, h) của khung hình tại giây t. */
function countColor(
  file: string,
  t: number,
  crop: [number, number, number, number],
  rgb: number[],
) {
  const [x, y, w, h] = crop
  const raw = execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(t),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    `crop=${w}:${h}:${x}:${y},format=rgb24`,
    '-f',
    'rawvideo',
    '-',
  ])
  let n = 0
  for (let i = 0; i + 2 < raw.length; i += 3)
    if (rgb.every((v, k) => Math.abs(raw[i + k]! - v) < 40)) n++
  return n
}

const saved = () => {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  } catch {
    return {}
  }
}

test('mẫu phụ đề TikTok, song ngữ, tách dòng, hàng Phụ đề trên timeline; video xuất có khối màu nhấn đúng lúc', async () => {
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ELEVENLABS_BASE_URL: mock.url, LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })
  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'elevenlabs', 'ElevenLabs', 'el_test_key_0123456789abcdef')
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()

  await page.getByTestId('lib-captions').click()
  await page.getByTestId('captions-generate').click()
  await expect(page.getByTestId('caption-line')).toHaveCount(2)
  await expect(page.getByTestId('timeline-caption')).toHaveCount(2)

  // Mẫu TikTok, màu nhấn cam, ở giữa khung, 2 từ một lúc.
  await page.getByTestId('caption-template-tiktok').click()
  await page.getByTestId('caption-highlight').fill('#ff8800')
  await page.getByTestId('caption-pos-middle').click()
  await page.getByTestId('caption-words-2').click()
  await expect.poll(() => saved().captions?.look?.highlightColor).toBe('#ff8800')
  expect(saved().captions.look).toMatchObject({
    template: 'tiktok',
    maxWords: 2,
    y: 0.5,
    uppercase: true,
  })

  // Song ngữ: Claude dịch sang tiếng Anh, dòng dịch hiện dưới.
  await page.getByTestId('captions-target').selectOption('en')
  await page.getByTestId('captions-bilingual').click()
  await expect(page.getByTestId('caption-translation')).toHaveCount(2)
  await expect(page.getByTestId('caption-translation').first()).toHaveValue(
    '[EN] Xin chào ừm các bạn.',
  )
  await expect.poll(() => saved().captions?.bilingual).toBe(true)
  // Nội dung gốc giữ nguyên.
  await expect(page.getByTestId('caption-line').first()).toHaveValue('Xin chào ừm các bạn.')

  // Tách dòng thứ hai rồi gộp lại.
  await page.getByTestId('caption-split').nth(1).click()
  await expect(page.getByTestId('caption-line')).toHaveCount(3)
  await expect(page.getByTestId('timeline-caption')).toHaveCount(3)
  await expect(page.getByTestId('caption-line').nth(1)).toHaveValue('Hôm nay')
  await page.getByTestId('caption-merge').nth(1).click()
  await expect(page.getByTestId('caption-line')).toHaveCount(2)
  await expect(page.getByTestId('caption-line').nth(1)).toHaveValue('Hôm nay mình demo.')

  // Kéo mép phải khối phụ đề đầu tiên trên timeline: dòng kéo dài ra.
  const before = saved().captions.lines[0].end
  const handle = (await page.getByTestId('timeline-caption-end').first().boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 50, handle.y + handle.height / 2, { steps: 4 })
  await page.mouse.move(handle.x + 100, handle.y + handle.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => saved().captions.lines[0].end).toBeGreaterThan(before + 100)
  expect(saved().captions.lines[0].end).toBeLessThanOrEqual(saved().captions.lines[1].start)

  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const mp4 = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.mp4'))!
  const file = join(projectDir, 'exports', mp4)
  const band: [number, number, number, number] = [100, 250, 1080, 220]
  const orange = [255, 136, 0]
  // 0.6s: đang nói "chào" → khối cam sau từ; 2.5s: không có lời → không có khối cam.
  expect(countColor(file, 0.6, band, orange)).toBeGreaterThan(300)
  expect(countColor(file, 2.5, band, orange)).toBeLessThan(20)
  // Dòng dịch: chữ trắng viền đen nằm dưới dòng chính → vùng giữa có nhiều điểm trắng.
  expect(countColor(file, 0.6, band, [255, 255, 255])).toBeGreaterThan(200)

  expect(errors).toEqual([])
  await app.close()
})
