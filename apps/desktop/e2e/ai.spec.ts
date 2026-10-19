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

  // AI cắt từ thừa (bảng duyệt từng đoạn cắt nằm trong "Công cụ khác", thu gọn mặc định).
  await page.getByTestId('lib-ai').click()
  await page.getByTestId('ai-advanced-toggle').click()
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

  // Tìm và thay thế: "bạn" → "nhà" ngay trong từ (vẫn tô sáng từng từ được).
  await page.getByTestId('caption-find').fill('bạn')
  await expect(page.getByTestId('caption-match-count')).toHaveText('1 dòng khớp')
  await page.getByTestId('caption-replace').fill('nhà')
  await page.getByTestId('caption-replace-all').click()
  await expect(page.getByTestId('caption-line').first()).toHaveValue('Xin chào ừm các nhà.')
  await expect(page.getByTestId('caption-match-count')).toHaveText('Đã thay trong 1 dòng.')

  // Claude sửa phụ đề (máy chủ giả bỏ "ừm").
  await page.getByTestId('caption-ai-fix').click()
  await expect(page.getByTestId('caption-ai-result')).toHaveText('Claude đã sửa 1 dòng.')
  await expect(page.getByTestId('caption-line').first()).toHaveValue('Xin chào các nhà.')
  const edit = mock.requests.filter((r) => r.path === '/v1/messages').at(-1)!
  expect(String(JSON.parse(edit.body.toString('utf8')).system)).toContain('Vietnamese')

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

  // Tất cả đoạn zoom về một mức cố định, rồi nhờ Claude lập lại (máy chủ giả trả một đoạn 3×).
  await page.getByTestId('export-close').click()
  await page.getByTestId('tab-zoom').click()
  await expect(page.getByTestId('zoom-count')).toHaveText('1 đoạn zoom')
  await page.getByTestId('zoom-all-scale').fill('2.5')
  await page.getByTestId('zoom-all-apply').click()
  await expect(page.getByTestId('timeline-zoom').first()).toHaveText('2.5×')
  await page.getByTestId('lib-ai').click()
  await page.getByTestId('ai-advanced-toggle').click()
  await page.getByTestId('ai-zoom-preset-tidy').click()
  await page.getByTestId('ai-zoom-plan').click()
  await expect(page.getByTestId('ai-zoom-proposal')).toContainText('Claude đề xuất 1 đoạn zoom')
  await page.getByTestId('ai-zoom-apply').click()
  await expect(page.getByTestId('timeline-zoom').first()).toHaveText('3.0×')
  const plan = mock.requests.filter((r) => r.path === '/v1/messages').at(-1)!
  const planBody = JSON.parse(plan.body.toString('utf8'))
  expect(String(planBody.system)).toContain('zoom-in regions')
  expect(String(planBody.messages[0].content)).toContain('Mouse clicks (seconds)')

  expect(errors).toEqual([])
  await app.close()
})

test('Đạo diễn AI: một câu → nhiều lệnh (chữ, nhãn dán, mốc, zoom, mic, lề, màu, cắt); một bước hoàn tác', async () => {
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })

  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')
  await expect(page.getByTestId('timeline-zoom')).toHaveCount(1)

  await page.getByTestId('lib-ai').click()
  await expect(page.getByTestId('director-engine')).toHaveAttribute('data-engine', 'claude')
  await page.getByTestId('assistant-input').fill('làm hết cho mình')
  await page.getByTestId('assistant-run').click()

  // Báo cáo từng lệnh: 8 xong, "bỏ nhạc" bỏ qua vì chưa có nhạc.
  const commands = page.getByTestId('assistant-command')
  await expect(commands).toHaveCount(9)
  await expect(page.locator('[data-testid="assistant-command"][data-status="done"]')).toHaveCount(8)
  await expect(
    page.locator('[data-testid="assistant-command"][data-kind="clear"][data-status="skipped"]'),
  ).toHaveCount(1)
  await expect(page.getByTestId('director-message').last()).toContainText('Thêm chữ, nhãn dán')

  // Kết quả trên timeline: 2 lớp, 1 mốc, zoom 3×, video ngắn đi 1 giây.
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(2)
  await expect(page.getByTestId('timeline-marker')).toHaveCount(1)
  await expect(page.getByTestId('timeline-zoom').first()).toHaveText('3.0×')
  await expect(page.getByTestId('timecode')).toContainText('/ 0:03.0')

  // Lệnh đi qua Claude với lời nhắc đạo diễn có mô tả các lệnh mở rộng.
  const direct = mock.requests.filter((r) => r.path === '/v1/messages').at(-1)!
  const body = JSON.parse(direct.body.toString('utf8'))
  const systemText = body.system.map((b: { text: string }) => b.text).join('\n')
  expect(systemText).toContain('AI director')
  expect(systemText).toContain('zoomLevel {scale}')
  expect(body.output_config.format.schema.properties.commands.items.properties.kind.enum).toContain(
    'sticker',
  )

  // Tất cả là một bước hoàn tác.
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(0)
  await expect(page.getByTestId('timeline-marker')).toHaveCount(0)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  expect(errors).toEqual([])
  await app.close()
})

test('Đạo diễn AI 1.9.0: dựng chuyên nghiệp (hiệu ứng, tua nhanh, chuyển cảnh, thẻ kết) + sổ tay dựng trong lời nhắc', async () => {
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ANTHROPIC_BASE_URL: mock.url },
  })

  await page.getByTestId('nav-settings').click()
  await saveKey(page, 'anthropic', 'Claude (Anthropic)', 'sk-ant-test-key-0123456789abcdef')
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  await page.getByTestId('lib-ai').click()
  // Nút gợi ý phong cách điền sẵn câu yêu cầu.
  await page.getByTestId('assistant-example-youtube').click()
  await expect(page.getByTestId('assistant-input')).toHaveValue(/YouTube/)
  await page.getByTestId('assistant-input').fill('dựng chuyên nghiệp cho mình')
  await page.getByTestId('assistant-run').click()

  const commands = page.getByTestId('assistant-command')
  await expect(commands).toHaveCount(5)
  await expect(page.locator('[data-testid="assistant-command"][data-status="done"]')).toHaveCount(5)
  await expect(page.getByTestId('director-message').last()).toContainText('chuẩn YouTube')

  // Hiệu ứng, thẻ kết trên timeline; đoạn 2-4 s tua 2× nên video còn 3 s; thẻ kết bám cuối.
  await expect(page.getByTestId('timeline-effect')).toHaveCount(1)
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:03.0')

  // Lời nhắc đạo diễn có sổ tay dựng chuyên nghiệp, thời điểm bấm chuột và bản dựng hiện tại.
  const direct = mock.requests.filter((r) => r.path === '/v1/messages').at(-1)!
  const body = JSON.parse(direct.body.toString('utf8'))
  const system = body.system.map((b: { text: string }) => b.text).join('\n')
  expect(system).toContain('Professional editing playbook')
  expect(system).toContain('recipe {style}')
  expect(system).toContain('Mouse click times')
  expect(system).toMatch(/Current edit: duration 4 s/)
  expect(body.output_config.format.schema.properties.commands.items.properties.kind.enum).toContain(
    'outro',
  )

  // Một bước hoàn tác.
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('timeline-effect')).toHaveCount(0)
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(0)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  expect(errors).toEqual([])
  await app.close()
})
