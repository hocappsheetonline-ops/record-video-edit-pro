import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject, pixelAt } from './fixtures'
import { createTestDirs, launchApp, probeMedia, type TestDirs } from './helpers'

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
async function openExport(page: Page) {
  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-dialog')).toBeVisible()
}
async function closeExport(page: Page) {
  await page.getByTestId('export-close').click()
  await expect(page.getByTestId('export-dialog')).toBeHidden()
}
function exported(ext: string): string[] {
  if (!existsSync(join(projectDir, 'exports'))) return []
  return readdirSync(join(projectDir, 'exports')).filter(
    (f) => f.endsWith(ext) && !f.startsWith('.'),
  )
}
/** Độ sáng trung bình (Y, 0..255) của cả khung hình tại giây `t`. */
function luma(file: string, t: number) {
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
  return Number(/lavfi\.signalstats\.YAVG=([\d.]+)/.exec(stderr)?.[1] ?? -1)
}
async function exportNew(page: Page): Promise<string> {
  await openExport(page)
  await page.waitForTimeout(1100)
  const before = new Set(exported('.mp4'))
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  await expect.poll(() => exported('.mp4').filter((f) => !before.has(f)).length).toBe(1)
  await closeExport(page)
  return join(
    projectDir,
    'exports',
    exported('.mp4').find((f) => !before.has(f))!,
  )
}

test('thư viện hiệu ứng: 27 kiểu chia nhóm; dải điện ảnh làm mép trên đen, đảo màu đổi hẳn khung khi xuất', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.getByTestId('lib-effects').click()
  for (const group of ['motion', 'glitch', 'color', 'light', 'particles'])
    await expect(page.getByTestId(`effect-group-${group}`)).toBeVisible()
  await expect(page.locator('[data-testid^="effect-add-"]')).toHaveCount(27)

  // Giây 0–1: dải điện ảnh (độ mạnh 100%); giây 1–2: đảo màu.
  await page.getByTestId('effect-add-letterbox').click()
  await expect(page.getByTestId('effect-selected')).toBeVisible()
  await page.getByTestId('effect-intensity').fill('1')
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('effect-add-invert').click()
  await expect(page.getByTestId('timeline-effect')).toHaveCount(2)
  const editFile = join(projectDir, 'edit.json')
  const saved = () => (existsSync(editFile) ? JSON.parse(readFileSync(editFile, 'utf8')) : {})
  await expect
    .poll(() => saved().effects?.map((e: { kind: string }) => e.kind))
    .toEqual(['letterbox', 'invert'])
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await closeExport(page)
  const styled = await exportNew(page)
  expect(probeMedia(styled).durationMs).toBeGreaterThan(3800)
  // Dải điện ảnh: điểm sát mép trên đen hẳn ở giây 0.5; giây 3.5 không còn hiệu ứng nào → sáng.
  const top = pixelAt(styled, 640, 4, 0.5)
  expect(top[0] + top[1] + top[2]).toBeLessThan(30)
  const topLater = pixelAt(styled, 640, 4, 3.5)
  expect(topLater[0] + topLater[1] + topLater[2]).toBeGreaterThan(60)
  // Đảo màu (1–2 giây, chồng với dải 1–2 giây): độ sáng khác hẳn khung không hiệu ứng.
  expect(Math.abs(luma(styled, 1.5) - luma(styled, 3.5))).toBeGreaterThan(15)
  expect(errors).toEqual([])
  await app.close()
})

test('thư viện chuyển cảnh: 21 kiểu chia nhóm; kéo rèm làm khung ở chỗ nối đen; xoay / lia máy / vòng tròn xuất được', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  // Tách ở giây 2 → có một chỗ nối.
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)

  await page.getByTestId('lib-transitions').click()
  for (const group of ['basic', 'motion', 'shape', 'stylized'])
    await expect(page.getByTestId(`transition-group-${group}`)).toBeVisible()
  await expect(page.locator('[data-testid^="lib-transition-"]')).toHaveCount(22) // 21 + nút "tất cả"
  await page.getByTestId('lib-transition-wipe').click()
  await expect(page.getByTestId('transition-marker')).toHaveAttribute('data-active', 'true')
  // Panel phải hiện đúng kiểu đang chọn với đủ 21 ô.
  await expect(page.getByTestId('transition-wipe')).toHaveAttribute('aria-pressed', 'true')
  for (const kind of ['iris', 'whip', 'spin', 'flip', 'squeeze'])
    await expect(
      page.getByTestId('transition-panel').getByTestId(`transition-${kind}`),
    ).toBeVisible()
  await page.getByTestId('lib-transition-wipe').click()
  await expect(page.getByTestId('transition-marker')).toHaveAttribute('data-active', 'true')
  // Panel phải hiện đúng kiểu đang chọn với đủ 21 ô.
  await expect(page.getByTestId('transition-wipe')).toHaveAttribute('aria-pressed', 'true')
  for (const kind of ['iris', 'whip', 'spin', 'flip', 'squeeze'])
    await expect(
      page.getByTestId('transition-panel').getByTestId(`transition-${kind}`),
    ).toBeVisible()

  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await closeExport(page)
  const wiped = await exportNew(page)
  expect(luma(wiped, 2.0)).toBeLessThan(20)
  expect(luma(wiped, 0.5)).toBeGreaterThan(60)

  for (const kind of ['spin', 'whip', 'iris', 'flip', 'pixelate']) {
    await page.getByTestId(`lib-transition-${kind}`).click()
    const file = await exportNew(page)
    expect(probeMedia(file).durationMs, kind).toBeGreaterThan(3800)
    expect(luma(file, 3.5), kind).toBeGreaterThan(60)
  }
  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.transitions).toEqual([
    { afterClip: saved.clips[0].id, kind: 'pixelate', durationMs: 600 },
  ])
  expect(errors).toEqual([])
  await app.close()
})

test('chuyển cảnh chỉ ở chỗ đổi cảnh: tách tại chỗ / cắt lặng cắt thẳng, không đen hình; "mọi chỗ nối" phải nói rõ', async () => {
  // Bản quay 10 s: tách ở 1 s (tại chỗ), bỏ đoạn 2–6 s (đổi cảnh: nguồn nhảy 4 s).
  dirs.cleanup()
  dirs = createTestDirs()
  projectDir = createFixtureProject(dirs.projects, 10)
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.getByTestId('editor-canvas').click()
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('s')
  }
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4)
  await page.getByTestId('timeline-clip').nth(2).click()
  await page.getByTestId('delete').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:06.0')
  await expect(page.getByTestId('transition-marker')).toHaveCount(2)

  // Thư viện: nút "chỗ đổi cảnh" (1) và "cả ... chỗ nối" (2); mặc định là chỗ đổi cảnh.
  await page.getByTestId('lib-transitions').click()
  await expect(page.getByTestId('lib-transition-scenes')).toContainText('1 chỗ đổi cảnh')
  await expect(page.getByTestId('lib-transition-all')).toContainText('cả 2 chỗ nối')
  await page.getByTestId('lib-transition-scenes').click()
  await expect(page.locator('[data-testid="transition-marker"][data-active="true"]')).toHaveCount(1)
  const savedTransitions = () => {
    const file = join(projectDir, 'edit.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).transitions : null
  }
  const clipIds = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8')).clips
  await expect.poll(savedTransitions).toHaveLength(1)
  let saved = { transitions: savedTransitions(), clips: clipIds() }
  expect(saved.transitions).toEqual([
    { afterClip: saved.clips[1].id, kind: 'fadeBlack', durationMs: 600 },
  ])
  await page.getByTestId('lib-transition-all').click()
  await expect(page.locator('[data-testid="transition-marker"][data-active="true"]')).toHaveCount(2)

  // Trợ lý (từ khóa, không cần AI): "thêm chuyển cảnh" → chỉ chỗ đổi cảnh; "mọi chỗ nối" → cả hai.
  await page.getByTestId('lib-ai').click()
  await expect(page.getByTestId('director-engine')).toHaveAttribute('data-engine', 'keywords')
  await page.getByTestId('assistant-input').fill('thêm chuyển cảnh zoom')
  await page.getByTestId('assistant-run').click()
  await expect(
    page.locator('[data-testid="assistant-command"][data-kind="transitions"][data-status="done"]'),
  ).toHaveCount(1)
  await expect(page.locator('[data-testid="transition-marker"][data-active="true"]')).toHaveCount(1)
  await expect.poll(() => savedTransitions()?.[0]?.kind).toBe('zoom')
  saved = { transitions: savedTransitions(), clips: clipIds() }
  expect(saved.transitions).toEqual([
    { afterClip: saved.clips[1].id, kind: 'zoom', durationMs: 600 },
  ])
  await page.getByTestId('assistant-input').fill('chuyển cảnh đen ở mọi chỗ nối')
  await page.getByTestId('assistant-run').click()
  await expect(page.locator('[data-testid="transition-marker"][data-active="true"]')).toHaveCount(2)
  await expect
    .poll(() => savedTransitions()?.map((t: { kind: string }) => t.kind))
    .toEqual(['fadeBlack', 'fadeBlack'])

  // Xuất với chuyển cảnh mặc định (chỉ chỗ đổi cảnh): chỗ tách tại chỗ (1 s) vẫn sáng, chỗ đổi cảnh (2 s) mờ qua đen.
  await page.getByTestId('assistant-input').fill('thêm chuyển cảnh đen')
  await page.getByTestId('assistant-run').click()
  await expect(page.locator('[data-testid="transition-marker"][data-active="true"]')).toHaveCount(1)
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await closeExport(page)
  const file = await exportNew(page)
  expect(probeMedia(file).durationMs).toBeGreaterThan(5800)
  expect(luma(file, 1.0)).toBeGreaterThan(60)
  expect(luma(file, 2.0)).toBeLessThan(20)
  expect(errors).toEqual([])
  await app.close()
})
