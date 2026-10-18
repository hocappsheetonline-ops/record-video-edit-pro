import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

const savedClips = (): { sourceStart: number; sourceEnd: number }[] => {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8')).clips
  } catch {
    return []
  }
}
const ranges = () => savedClips().map((c) => [c.sourceStart, c.sourceEnd])

test('chỉnh sửa bằng văn bản: xóa chữ cắt video, từ đệm và khoảng lặng một nút, khôi phục; Đạo diễn AI cắt câu trích', async () => {
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ELEVENLABS_BASE_URL: mock.url, LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })
  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'elevenlabs', 'ElevenLabs', 'el_test_key_0123456789abcdef')
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  // Nhận dạng lời thoại: 9 từ, "ừm" là từ đệm, khoảng nghỉ 1,1 s giữa "bạn." và "Hôm".
  await page.getByTestId('lib-transcript').click()
  await page.getByTestId('transcript-generate').click()
  const words = page.getByTestId('transcript-word')
  await expect(words).toHaveCount(9)
  await expect(words.nth(2)).toHaveText('ừm')
  await expect(words.nth(2)).toHaveAttribute('data-filler', 'true')
  await expect(page.getByTestId('transcript-gap')).toHaveText('⋯ 1,1 s')
  await expect(page.getByTestId('transcript-stats')).toHaveText('9 từ · 1 từ đệm · 1 khoảng lặng')

  // Bấm "các", Shift+bấm "bạn.", Delete: cắt 1300 → 3000 ms, timeline còn 2,3 s.
  await words.nth(3).click()
  await words.nth(4).click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('transcript-cut-selection')).toContainText('(2)')
  await page.getByTestId('transcript-text').focus()
  await page.keyboard.press('Delete')
  await expect(words.nth(3)).toHaveAttribute('data-cut', 'true')
  await expect(words.nth(4)).toHaveAttribute('data-cut', 'true')
  await expect(page.getByTestId('timecode')).toContainText('/ 0:02.3')
  await expect.poll(ranges).toEqual([
    [0, 1300],
    [3000, 4000],
  ])
  // Khoảng lặng nằm trong phần đã cắt cũng gạch ngang.
  await expect(page.getByTestId('transcript-gap')).toHaveAttribute('data-cut', 'true')

  // Khôi phục cả hai từ bằng cách bấm chữ gạch ngang.
  await words.nth(3).click()
  await words.nth(4).click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')
  await expect.poll(ranges).toEqual([[0, 4000]])

  // Một nút: bỏ mọi từ đệm (ừm 900 → 1300), rút ngắn khoảng lặng (2075 → 2825).
  await page.getByTestId('transcript-remove-fillers').click()
  await expect(page.getByTestId('transcript-done')).toHaveText('Đã cắt 1 từ đệm khỏi video.')
  await expect(page.getByTestId('transcript-remove-fillers')).toBeDisabled()
  await page.getByTestId('transcript-cut-silences').click()
  await expect(page.getByTestId('transcript-done')).toHaveText('Đã rút ngắn 1 khoảng lặng.')
  await expect.poll(ranges).toEqual([
    [0, 900],
    [1300, 2075],
    [2825, 4000],
  ])
  await expect(page.getByTestId('timecode')).toContainText('/ 0:02.9')
  await expect(page.getByTestId('transcript-stats')).toHaveText('8 từ · 0 từ đệm · 0 khoảng lặng')

  // Bấm một từ còn lại đưa đầu phát tới đó: "Hôm" bắt đầu ở 3000 ms nguồn = 1850 ms trên video đã cắt.
  await words.nth(5).click()
  await expect(page.getByTestId('timecode')).toContainText('0:01.9 /')
  await expect(words.nth(5)).toHaveAttribute('data-current', 'true')

  // Đạo diễn AI: "cắt câu …" → lệnh cutText cắt đúng câu "Hôm nay mình demo." (3000 → 3950),
  // câu không có trong lời thoại thì bỏ qua.
  await page.getByTestId('lib-ai').click()
  await expect(page.getByTestId('director-engine')).toHaveAttribute('data-engine', 'claude')
  await page.getByTestId('assistant-input').fill('cắt câu hôm nay mình demo cho mình')
  await page.getByTestId('assistant-run').click()
  await expect(
    page.locator('[data-testid="assistant-command"][data-kind="cutText"][data-status="done"]'),
  ).toHaveCount(1)
  await expect(
    page.locator('[data-testid="assistant-command"][data-kind="cutText"][data-status="skipped"]'),
  ).toHaveCount(1)
  await expect.poll(ranges).toEqual([
    [0, 900],
    [1300, 2075],
    [2825, 3000],
  ])
  // Bảng lời thoại phản ánh phần đã cắt.
  await page.getByTestId('lib-transcript').click()
  await expect(page.getByTestId('transcript-stats')).toHaveText('4 từ · 0 từ đệm · 0 khoảng lặng')
  await expect(words.nth(8)).toHaveAttribute('data-cut', 'true')

  expect(errors).toEqual([])
  await app.close()
})
