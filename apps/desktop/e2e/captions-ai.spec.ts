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

test('Phụ đề kiểu Captions: emoji AI, tô từ khóa, mẫu comic, lồng tiếng AI qua Đạo diễn; video xuất có màu từ khóa', async () => {
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

  // Emoji AI: Claude chọn một emoji cho mỗi dòng, hiện cạnh dòng và lưu vào dự án.
  await page.getByTestId('captions-emoji').click()
  await expect(page.getByTestId('captions-decor-result')).toContainText('2 dòng')
  await expect(page.getByTestId('caption-emoji')).toHaveText(['👋', '🎬'])
  await expect
    .poll(() => saved().captions?.lines?.map((l: { emoji?: string }) => l.emoji))
    .toEqual(['👋', '🎬'])

  // Từ khóa AI: chỉ giữ từ có trong dòng ("rác" bị bỏ), hiện dạng thẻ màu từ khóa.
  await page.getByTestId('captions-keywords').click()
  await expect(page.getByTestId('captions-decor-result')).toContainText('từ khóa ở 2 dòng')
  await expect(page.getByTestId('caption-keyword')).toHaveText(['Xin', 'Hôm'])

  // Mẫu "comic" mới: phông Bangers, chữ hoa; rồi đổi màu từ khóa sang xanh lá.
  await page.getByTestId('caption-template-comic').click()
  await page.getByTestId('caption-pos-middle').click()
  await expect.poll(() => saved().captions?.look?.template).toBe('comic')
  expect(saved().captions.look).toMatchObject({ font: 'bangers', y: 0.5, uppercase: true })
  await page.getByTestId('caption-keyword-color').fill('#00ff00')
  await expect.poll(() => saved().captions?.look?.keywordColor).toBe('#00ff00')
  // Đổi mẫu không làm mất từ khóa / emoji.
  expect(saved().captions.lines[0]).toMatchObject({ emoji: '👋', keywords: ['Xin'] })

  // Bỏ emoji bằng một nút; từ khóa vẫn còn.
  await page.getByTestId('captions-emoji-clear').click()
  await expect(page.getByTestId('caption-emoji')).toHaveCount(0)
  await expect(page.getByTestId('caption-keyword')).toHaveCount(2)

  // Lồng tiếng AI qua Đạo diễn: Claude trả lệnh dub → dịch, đọc từng dòng bằng giọng "Bao",
  // tắt micro gốc, phụ đề chuyển sang tiếng Anh. Mỗi dòng một request TTS (câu ngắn, không đọc lại).
  await page.getByTestId('lib-ai').click()
  await page.getByTestId('assistant-input').fill('lồng tiếng sang tiếng Anh')
  await page.getByTestId('assistant-run').click()
  await expect(
    page.locator('[data-testid="assistant-command"][data-kind="dub"][data-status="done"]'),
  ).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByTestId('assistant-command')).toContainText('Lồng tiếng AI')
  await expect(page.getByTestId('timeline-audio')).toHaveCount(2)
  await expect(page.getByTestId('timeline-audio').first()).toHaveAttribute('data-kind', 'voice')
  const tts = mock.requests.filter((r) => r.path.startsWith('/v1/text-to-speech/'))
  expect(tts).toHaveLength(2)
  expect(tts.every((r) => r.path.endsWith('/voice-bao'))).toBe(true)
  expect(JSON.parse(tts[0]!.body.toString('utf8')).text).toBe('[EN] Xin chào ừm các bạn.')
  await expect.poll(() => saved().audio?.mic).toBe(0)
  expect(saved().captions.language).toBe('en')
  expect(saved().captions.lines[0].text).toBe('[EN] Xin chào ừm các bạn.')
  expect(saved().audioClips.map((c: { kind: string; start: number }) => [c.kind, c.start])).toEqual(
    [
      ['voice', 100],
      ['voice', 3000],
    ],
  )
  // Lời nhắc đạo diễn mô tả các lệnh mới.
  const direct = mock.requests
    .filter((r) => r.path === '/v1/messages')
    .map((r) => JSON.parse(r.body.toString('utf8')))
    .filter((b) => Array.isArray(b.system) && JSON.stringify(b.system).includes('AI director'))
    .at(-1)!
  const body = direct
  const systemText = body.system.map((b: { text: string }) => b.text).join('\n')
  expect(systemText).toContain('dub {language, keepOriginal, voiceName}')
  expect(systemText).toContain('captionsKeywords')
  expect(body.output_config.format.schema.properties.commands.items.properties.kind.enum).toContain(
    'captionsEmoji',
  )

  // Một bước hoàn tác trả lại mic và phụ đề tiếng Việt; làm lại để xuất.
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('timeline-audio')).toHaveCount(0)
  await expect.poll(() => saved().captions?.language).toBe('vi')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('timeline-audio')).toHaveCount(2)

  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const mp4 = readdirSync(join(projectDir, 'exports')).find((f) => f.endsWith('.mp4'))!
  const file = join(projectDir, 'exports', mp4)
  // 0,85 s: nhóm "[EN] XIN CHÀO" ở giữa khung (mẫu comic chia 3 từ): "XIN" là từ khóa → xanh lá,
  // "CHÀO" đang nói → màu nhấn đỏ, "[EN]" → màu chữ vàng. Vùng cắt chỉ bao quanh dòng chữ để
  // không lẫn với các dải màu của video mẫu.
  const band: [number, number, number, number] = [520, 320, 240, 80]
  expect(countColor(file, 0.85, band, [0, 255, 0])).toBeGreaterThan(150)
  expect(countColor(file, 0.85, band, [244, 63, 94])).toBeGreaterThan(300)
  expect(countColor(file, 0.85, band, [253, 224, 71])).toBeGreaterThan(200)
  // Video xuất có tiếng lồng (hai đoạn 0,8 s) dù mic tắt.
  const volume = execFileSync(
    ffmpegPath as unknown as string,
    ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  ).toString()
  expect(Number(/mean_volume: (-?[\d.]+) dB/.exec(volume)![1])).toBeGreaterThan(-60)

  expect(errors).toEqual([])
  await app.close()
})
