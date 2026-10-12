import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'

test.describe.configure({ timeout: 240_000 })

let dirs: TestDirs
let projectDir: string
test.beforeEach(() => {
  dirs = createTestDirs()
  projectDir = createFixtureProject(dirs.projects)
})
test.afterEach(() => dirs.cleanup())

const ffmpeg = ffmpegPath as unknown as string

function loudness(file: string, from: number, len: number) {
  const { stderr } = spawnSync(
    ffmpeg,
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

async function openEditor(page: Page) {
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('editor')).toBeVisible()
}

async function exportOnce(page: Page): Promise<string> {
  const exported = () =>
    existsSync(join(projectDir, 'exports'))
      ? readdirSync(join(projectDir, 'exports')).filter(
          (f) => f.endsWith('.mp4') && !f.startsWith('.'),
        )
      : []
  const before = new Set(exported())
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.waitForTimeout(1100)
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  await expect.poll(() => exported().filter((f) => !before.has(f)).length).toBe(1)
  const file = join(
    projectDir,
    'exports',
    exported().find((f) => !before.has(f))!,
  )
  await page.getByTestId('export-close').click()
  return file
}

test('lọc tạp âm AI cho micro: xem trước dùng bản đã lọc, video xuất bớt tạp âm rõ rệt mà giữ giọng', async () => {
  // Micro "ồn": 0–2s chỉ có tạp âm trắng, 2–4s giọng (âm hài 180 Hz nhấp nhô) + tạp âm.
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    "aevalsrc='if(gt(t\\,2)\\,0.4*(sin(2*PI*180*t)+0.6*sin(2*PI*360*t)+0.4*sin(2*PI*540*t))*(0.6+0.4*sin(2*PI*4*t))\\,0)':s=48000:d=4",
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=d=4:c=white:a=0.08:r=48000',
    '-filter_complex',
    '[0][1]amix=inputs=2:normalize=0',
    '-c:a',
    'libopus',
    join(projectDir, 'seg0-mic.webm'),
  ])
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const plain = await exportOnce(page)

  await page.getByTestId('tab-audio').click()
  await page.getByTestId('mic-fx-noise-medium').click()
  await expect(page.getByTestId('mic-fx-status')).toHaveText('Đã áp dụng', { timeout: 60_000 })
  expect(readdirSync(projectDir).filter((f) => f.startsWith('fx-'))).toEqual(['fx-seg0-mic-n2.m4a'])
  // Xem trước phát bản đã lọc.
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-audio',
    /fx-seg0-mic-n2\.m4a/,
  )
  const cleaned = await exportOnce(page)

  const noisePlain = loudness(plain, 0.3, 1.4)
  const noiseClean = loudness(cleaned, 0.3, 1.4)
  expect(noiseClean).toBeLessThan(noisePlain - 15)
  expect(Math.abs(loudness(cleaned, 2.3, 1.4) - loudness(plain, 2.3, 1.4))).toBeLessThan(5)
  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.audio.micFx).toMatchObject({ noise: 'medium' })
  expect(errors).toEqual([])
  await app.close()
})

test('lồng tiếng: ghi micro (thiết bị giả) khi video phát, bản ghi nằm đúng chỗ và có trong video xuất', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  // Tắt micro của bản quay để chỉ còn tiếng lồng.
  await page.getByTestId('tab-audio').click()
  await page.getByTestId('audio-mic').fill('0')
  await page.getByTestId('editor-canvas').click({ position: { x: 10, y: 10 } })
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('lib-audio').click()
  await page.getByTestId('audio-section-voice').click()
  await expect(page.getByTestId('voice-mic')).not.toHaveValue('')
  await page.getByTestId('voice-countdown-toggle').click()
  await page.getByTestId('voice-record').click()
  await expect(page.getByTestId('voice-stop')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByTestId('voice-stop').click()
  await expect(page.getByTestId('timeline-audio')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByTestId('timeline-audio')).toHaveAttribute('data-kind', 'voice')
  await expect(page.getByTestId('timeline-audio')).toContainText('Lồng tiếng 1')
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  await expect.poll(() => saved().audioClips?.[0]?.kind).toBe('voice')
  const clip = saved().audioClips[0]
  expect(clip.start).toBe(1000)
  expect(clip.duration).toBeGreaterThan(1000)
  expect(clip.file).toMatch(/^asset-voice-[0-9a-f]{12}\.m4a$/)

  const file = await exportOnce(page)
  expect(loudness(file, 0.1, 0.7)).toBeLessThan(-50)
  expect(loudness(file, 1.2, 0.8)).toBeGreaterThan(-50)
  expect(errors).toEqual([])
  await app.close()
})
