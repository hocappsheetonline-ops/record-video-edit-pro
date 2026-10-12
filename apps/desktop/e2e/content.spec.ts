import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'
import { startMockAi } from './mock-ai'
import { startMockContent } from './mock-content'

test.describe.configure({ timeout: 240_000 })

let dirs: TestDirs
let projectDir: string
let ai: Awaited<ReturnType<typeof startMockAi>>
let content: Awaited<ReturnType<typeof startMockContent>>

function ffmpeg(args: string[]) {
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...args,
  ])
}

test.beforeEach(async () => {
  dirs = createTestDirs()
  projectDir = createFixtureProject(dirs.projects)
  // Video meme "trên mạng": nền đỏ đặc, có tiếng 1 kHz — dễ nhận ra trong video xuất.
  const video = join(dirs.userData, 'remote.mp4')
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=320x180:r=30:d=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=2',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-shortest',
    video,
  ])
  const gif = join(dirs.userData, 'remote.gif')
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=120x120:r=5:d=0.6', gif])
  const thumb = join(dirs.userData, 'remote.jpg')
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=160x90', '-frames:v', '1', thumb])
  content = await startMockContent({ video, gif, thumb })
  ai = await startMockAi()
})
test.afterEach(async () => {
  await content.close()
  await ai.close()
  dirs.cleanup()
})

async function saveKey(page: Page, key: string, label: string, value: string) {
  const card = page.getByTestId(`key-card-${key}`)
  await card.getByLabel(label).fill(value)
  await card.getByRole('button', { name: 'Kiểm tra' }).click()
  await expect(page.getByTestId(`key-feedback-${key}`)).toHaveText('Key hợp lệ')
  await card.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByTestId(`key-status-${key}`)).toContainText('Đã lưu')
}

function loudness(file: string, from: number, len: number) {
  const { stderr } = spawnSync(
    ffmpegPath as unknown as string,
    [
      '-hide_banner',
      '-ss',
      String(from),
      '-t',
      String(len),
      '-i',
      file,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -100)
}

test('kho meme online + giọng đọc AI: nhập key, tìm, tải meme GIPHY và video Pixabay, đọc câu meme, xuất có hình và tiếng', async () => {
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: {
      LUMORA_GIPHY_BASE_URL: content.url,
      LUMORA_PIXABAY_BASE_URL: content.url,
      LUMORA_ELEVENLABS_BASE_URL: ai.url,
    },
  })

  // Key sai bị báo ngay khi kiểm tra; key đúng thì lưu được.
  await page.getByTestId('nav-settings').click()
  const giphyCard = page.getByTestId('key-card-giphy')
  await giphyCard.getByLabel('GIPHY').fill('wrongGiphyKey0123456789abcdefghi')
  await giphyCard.getByRole('button', { name: 'Kiểm tra' }).click()
  await expect(page.getByTestId('key-feedback-giphy')).not.toHaveText('Key hợp lệ')
  await saveKey(page, 'giphy', 'GIPHY', 'mockGiphyKey0123456789abcdefghij')
  await saveKey(page, 'pixabay', 'Pixabay', 'mock-pixabay-key-0123456789')
  await saveKey(page, 'elevenlabs', 'ElevenLabs', 'el_test_key_0123456789abcdef')
  await expect(page.getByTestId('cache-card')).toBeVisible()

  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('editor')).toBeVisible()

  // Meme GIPHY: danh sách thịnh hành hiện ngay, ảnh thu nhỏ tải được (CSP cho phép), tìm từ khóa.
  await page.getByTestId('media-source-giphy').click()
  await expect(page.getByTestId('online-item')).toHaveCount(3)
  await expect(page.getByTestId('online-attribution')).toHaveText('Powered by GIPHY')
  await expect
    .poll(() =>
      page
        .getByTestId('online-item')
        .first()
        .locator('img')
        .evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth),
    )
    .toBeGreaterThan(0)
  await page.getByTestId('online-search').fill('bruh')
  await page.getByTestId('online-search').press('Enter')
  await expect(page.getByTestId('online-item').first()).toHaveAttribute('aria-label', 'bruh 1')
  await page.getByTestId('online-more').click()
  await expect(page.getByTestId('online-item')).toHaveCount(6)

  // Tải meme tại giây 1 → lớp video có tiếng, phủ kín khung.
  await page.getByTestId('editor-canvas').click({ position: { x: 10, y: 10 } })
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('online-item').first().click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByTestId('online-item').first()).toHaveAttribute('data-state', 'done')
  await page.getByTestId('overlay-fill').click()
  // Đã vào thư viện của tôi (dùng offline).
  await page.getByTestId('media-source-mine').click()
  await expect(page.getByTestId('meme-item')).toHaveCount(1)
  await expect(page.getByTestId('meme-item')).toContainText('bruh 1')

  // Video Pixabay: tải được (vào thư viện), chưa thêm vào video.
  await page.getByTestId('media-source-pixabayVideo').click()
  await expect(page.getByTestId('online-attribution')).toHaveText('Video từ Pixabay')
  await expect(page.getByTestId('online-item')).toHaveCount(2)

  // Âm thanh meme: tắt micro, đọc "Bruh" bằng giọng AI tại giây 3.
  await page.getByTestId('props-back').click()
  await page.getByTestId('tab-audio').click()
  await page.getByTestId('audio-mic').fill('0')
  await page.getByTestId('editor-canvas').click({ position: { x: 10, y: 10 } })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('lib-audio').click()
  await page.getByTestId('audio-section-meme').click()
  await expect(page.getByTestId('speech-voice')).toHaveValue('voice-anna')
  await page.getByTestId('speech-line-0').click()
  await expect(page.getByTestId('timeline-audio')).toHaveCount(1)
  await expect(page.getByTestId('timeline-audio')).toContainText('Bruh')
  expect(ai.requests.some((r) => r.path === '/v1/text-to-speech/voice-anna')).toBe(true)

  // Xuất: giây 1–3 có hình đỏ của meme và tiếng 1 kHz; giây 3 có giọng đọc; trước đó im lặng.
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const mp4 = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.mp4'))!
  const file = join(projectDir, 'exports', mp4)
  const out = execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    '1.5',
    '-i',
    file,
    '-vf',
    'format=rgb24,crop=1:1:640:360',
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-',
  ])
  expect(out[0]).toBeGreaterThan(180)
  expect(out[1]).toBeLessThan(80)
  expect(loudness(file, 0.1, 0.6)).toBeLessThan(-50)
  expect(loudness(file, 1.3, 0.5)).toBeGreaterThan(-35)
  expect(loudness(file, 3.1, 0.5)).toBeGreaterThan(-40)

  // Meme được chép vào dự án (chia sẻ dự án vẫn đủ).
  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(existsSync(join(projectDir, saved.overlays[0].file))).toBe(true)
  expect(saved.audioClips[0].file).toMatch(/^asset-tts-[0-9a-f]{16}\.mp3$/)
  expect(errors).toEqual([])
  await app.close()
})
