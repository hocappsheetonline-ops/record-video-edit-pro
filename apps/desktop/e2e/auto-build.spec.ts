import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'
import { startMockAi } from './mock-ai'
import { JAMENDO_KEY, startMockMusic } from './mock-music'

test.describe.configure({ timeout: 180_000 })

let dirs: TestDirs
let mock: Awaited<ReturnType<typeof startMockAi>>
let music: Awaited<ReturnType<typeof startMockMusic>>

test.beforeEach(async () => {
  dirs = createTestDirs()
  mock = await startMockAi()
  music = await startMockMusic()
})
test.afterEach(async () => {
  await mock.close()
  await music.close()
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

test('Tự dựng một nút: một lần gọi Claude (lời nhắc tĩnh được cache), tự tìm nhạc Jamendo, phụ đề, hook, thẻ kết; một bước hoàn tác', async () => {
  createFixtureProject(dirs.projects)
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: {
      LUMORA_ELEVENLABS_BASE_URL: mock.url,
      LUMORA_ANTHROPIC_BASE_URL: mock.url,
      LUMORA_JAMENDO_BASE_URL: music.url,
    },
  })

  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'elevenlabs', 'ElevenLabs', 'el_test_key_0123456789abcdef')
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')
  await saveKey(page, 'jamendo', 'Jamendo (nhạc nền)', JAMENDO_KEY)
  // Kiểm tra key Jamendo đi qua máy chủ giả.
  expect(music.requests.some((r) => r.path === '/v3.0/tracks/')).toBe(true)

  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  await page.getByTestId('lib-ai').click()
  await page.getByTestId('auto-build-format').selectOption('youtube')
  await expect(page.getByTestId('auto-build-music')).toBeChecked()
  await page.getByTestId('auto-build-run').click()

  const result = page.getByTestId('auto-build-result')
  await expect(result).toBeVisible({ timeout: 120_000 })
  const done = page.locator('[data-testid="auto-build-report"] [data-status="done"]')
  await expect(done.filter({ hasText: 'Tự tìm nhạc nền' })).toHaveCount(1)
  await expect(done.filter({ hasText: /^Phụ đề$/ })).toHaveCount(1)
  await expect(done.filter({ hasText: 'Thẻ kết' })).toHaveCount(1)
  await expect(page.getByTestId('auto-build-credits')).toContainText('Bright Day')
  await expect(page.getByTestId('auto-build-credits')).toContainText('CC BY 3.0')
  await expect(page.getByTestId('auto-build-issues')).toHaveCount(0)
  await expect(page.getByTestId('director-message').last()).toContainText('Dựng YouTube hoàn chỉnh')

  // Trên timeline: nhạc nền (tải từ Jamendo), hook + thẻ kết, phụ đề bật.
  await expect(page.getByTestId('timeline-audio')).toHaveCount(1)
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(2)
  await expect(page.getByTestId('timeline-caption').first()).toBeVisible()

  // Đúng một lần gọi đạo diễn: câu yêu cầu cố định "AUTO BUILD…", lời nhắc hệ thống hai khối,
  // khối tĩnh (tập lệnh + sổ tay) có cache_control, khối động chứa lời thoại.
  const director = mock.requests
    .filter((r) => r.path === '/v1/messages')
    .map((r) => JSON.parse(r.body.toString('utf8')))
    .filter((b) => Array.isArray(b.system) && String(b.system[0].text).includes('AI director'))
  expect(director).toHaveLength(1)
  const body = director[0]!
  expect(String(body.messages[0].content)).toMatch(/^AUTO BUILD\. Format: youtube\./)
  expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' })
  expect(body.system[0].text).toContain('findMusic {mood, tempo, volume}')
  expect(body.system[0].text).toContain('12. AUTO BUILD')
  expect(body.system[1].cache_control).toBeUndefined()
  expect(body.system[1].text).toContain('Xin chào')
  // Jamendo được hỏi với thẻ theo tâm trạng, không lời, cấm NC; file MP3 đã tải.
  const search = music.requests.filter((r) => r.path === '/v3.0/tracks/').at(-1)!
  expect(search.query.get('fuzzytags')).toContain('corporate')
  expect(search.query.get('ccnc')).toBe('false')
  expect(music.requests.some((r) => r.path === '/download/1002.mp3')).toBe(true)

  // Một bước hoàn tác cho cả bản dựng.
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('timeline-audio')).toHaveCount(0)
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(0)

  expect(errors).toEqual([])
  await app.close()
})

test('Đạo diễn AI: "chia ra làm 2 video short" → AI chọn đoạn hay, mỗi đoạn thành dự án dọc có hook', async () => {
  createFixtureProject(dirs.projects, 20)
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ELEVENLABS_BASE_URL: mock.url, LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })

  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'elevenlabs', 'ElevenLabs', 'el_test_key_0123456789abcdef')
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')
  await page.getByTestId('nav-projects').click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:20.0')

  await page.getByTestId('lib-ai').click()
  await page.getByTestId('assistant-input').fill('chia video này ra làm 2 video short')
  await page.getByTestId('assistant-run').click()
  const shorts = page.locator('[data-testid="assistant-command"][data-kind="shorts"]')
  await expect(shorts).toHaveAttribute('data-status', 'done', { timeout: 120_000 })

  // Máy chủ giả trả 2 đoạn: một đoạn 0,5 s bị loại, đoạn 1-19 s thành một dự án short.
  const highlight = mock.requests
    .filter((r) => r.path === '/v1/messages')
    .map((r) => JSON.parse(r.body.toString('utf8')))
    .find((b) => String(b.system).includes('best moments'))!
  expect(String(highlight.system)).toContain('up to 2 self-contained segments')
  expect(highlight.output_config.effort).toBe('low')

  await page.getByTestId('nav-projects').click()
  await expect(page.getByTestId('project-card')).toHaveCount(2)
  await expect(page.getByTestId('project-card').filter({ hasText: 'short 1: Mẹo 1' })).toHaveCount(
    1,
  )

  expect(errors).toEqual([])
  await app.close()
})
