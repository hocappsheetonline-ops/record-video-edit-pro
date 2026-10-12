import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject, pixelAt } from './fixtures'
import { createTestDirs, launchApp, probeMedia, type TestDirs } from './helpers'
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

test('AI: nhập key, tạo phụ đề, cắt từ thừa, tạo chương, lưu SRT, xuất video có phụ đề', async () => {
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ELEVENLABS_BASE_URL: mock.url, LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })

  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'elevenlabs', 'ElevenLabs', 'el_test_key_0123456789abcdef')
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')

  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()

  // Phụ đề.
  await page.getByTestId('lib-captions').click()
  await page.getByTestId('captions-generate').click()
  await expect(page.getByTestId('caption-line')).toHaveCount(2)
  await expect(page.getByTestId('caption-line').first()).toHaveValue('Xin chào ừm các bạn.')
  const stt = mock.requests.find((r) => r.path === '/v1/speech-to-text')!
  expect(stt.headers['xi-api-key']).toBe('el_test_key_0123456789abcdef')
  const form = stt.body.toString('latin1')
  expect(form).toContain('scribe_v2')
  expect(form).toMatch(/name="file"; filename="\.speech\.mp3"/)
  expect(stt.body.length).toBeGreaterThan(5000) // có âm thanh thật

  // AI cắt từ thừa.
  await page.getByTestId('lib-ai').click()
  await page.getByTestId('ai-suggest').click()
  await expect(page.getByTestId('ai-suggestion')).toHaveCount(1)
  await expect(page.getByTestId('ai-suggestion')).toContainText('ừm')
  await page.getByTestId('ai-apply').click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:03.6')
  const claude = mock.requests.find((r) => r.path === '/v1/messages')!
  expect(claude.headers['x-api-key']).toBe('sk-ant-test-key-0123456789abcdef')
  expect(String(claude.headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01')
  expect(JSON.parse(claude.body.toString('utf8'))).toMatchObject({
    model: 'claude-opus-5-5',
    fallbacks: 'default',
  })

  // Tiêu đề và chương (chương "Demo" ở giây 3 nguồn → 2.6 giây trên video đã cắt).
  await page.getByTestId('ai-summarize').click()
  await expect(page.getByTestId('ai-summary')).toContainText('Demo Lumora')
  await expect(page.getByTestId('ai-chapters')).toHaveText('0:00 Chào hỏi\n0:02 Demo')

  // Lưu SRT (theo thời gian video đã cắt).
  await page.getByTestId('lib-captions').click()
  await page.getByTestId('captions-srt').click()
  await expect(page.getByTestId('captions-saved')).toBeVisible()
  const srtName = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.srt'))!
  const srt = readFileSync(join(projectDir, 'exports', srtName), 'utf8')
  expect(srt).toContain('1\n00:00:00,100 --> 00:00:01,500\nXin chào các bạn.')
  expect(srt).toContain('2\n00:00:02,600 --> 00:00:03,550\nHôm nay mình demo.')

  // Xuất video có in phụ đề ở phía trên, trên nền sáng.
  await page.getByTestId('caption-pos-top').click()
  await page.getByTestId('tab-frame').click()
  await page.getByTestId('bg-preset-6').click()
  await page.getByTestId('padding').fill('0.2')
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const mp4 = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.mp4'))!
  const file = join(projectDir, 'exports', mp4)
  expect(probeMedia(file).durationMs).toBeLessThan(3800)
  // Ô phụ đề tối nằm trên nền sáng: điểm dưới chữ trong ô phụ đề phải tối; ngoài ô vẫn sáng.
  const inBox = pixelAt(file, 640, 110, 0.5)
  const outside = pixelAt(file, 640, 135, 0.5)
  expect(Math.max(...inBox)).toBeLessThan(120)
  expect(Math.min(...outside)).toBeGreaterThan(220)

  expect(errors).toEqual([])
  await app.close()
})
