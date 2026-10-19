import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFixtureProject, pixelAt } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'

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

function exported(ext: string): string[] {
  if (!existsSync(join(projectDir, 'exports'))) return []
  return readdirSync(join(projectDir, 'exports')).filter(
    (f) => f.endsWith(ext) && !f.startsWith('.'),
  )
}

/** Hai điểm ảnh khác nhau rõ (tổng chênh lệch RGB). */
const diff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0)

test('che vùng riêng tư: khảm ô làm phẳng chi tiết trong vùng, ngoài vùng giữ nguyên; xuất giống xem trước', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)

  // Khung đầy để tọa độ khung = tọa độ video; nguồn testsrc2 có nhiều chi tiết màu.
  await page.getByTestId('lib-effects').click()
  await expect(page.getByTestId('blur-add-pixelate')).toBeVisible()
  await page.getByTestId('blur-add-pixelate').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await expect(page.getByTestId('props-title')).toHaveText('Vùng che')
  await expect(page.getByTestId('blur-props')).toBeVisible()
  await expect.poll(() => saved().overlays?.[0]?.kind).toBe('blur')
  expect(saved().overlays[0]).toMatchObject({ blurMode: 'pixelate', x: 0.5, y: 0.5 })

  // Đổi sang làm mờ rồi quay lại khảm ô, tăng độ mạnh tối đa: ô to, dễ đo.
  await page.getByTestId('blur-mode-blur').click()
  await expect.poll(() => saved().overlays?.[0]?.blurMode).toBe('blur')
  await page.getByTestId('blur-mode-pixelate').click()
  await page.getByTestId('blur-strength').fill('1')
  await page.getByTestId('overlay-size').fill('0.5')
  await expect.poll(() => saved().overlays?.[0]?.blurStrength).toBe(1)
  await expect.poll(() => saved().overlays?.[0]?.size).toBe(0.5)

  // Xuất 720p (vùng che 3 giây từ 0). Trong vùng, các điểm ảnh cách nhau vài px trong cùng một ô
  // khảm có cùng màu; cùng khoảng cách ở ngoài vùng (testsrc2 có dải màu / chữ) thì khác nhau.
  await page.getByTestId('export-open').click()
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const file = join(projectDir, 'exports', exported('.mp4')[0]!)
  // Vùng che cao 50 % khung (360 px), rộng 1.6 × → 576 px, tâm (640, 360): ô khảm ~40 px.
  const inside = [
    pixelAt(file, 630, 350, 1),
    pixelAt(file, 634, 354, 1),
    pixelAt(file, 638, 358, 1),
  ]
  expect(diff(inside[0]!, inside[1]!)).toBeLessThan(12)
  expect(diff(inside[1]!, inside[2]!)).toBeLessThan(12)
  // Ngoài vùng (dải dưới của testsrc2, nhiều chi tiết) không bị khảm: dọc một hàng, có cặp điểm
  // cách nhau 10 px khác màu rõ.
  const outside = Array.from({ length: 40 }, (_, i) => pixelAt(file, 700 + i * 10, 602, 1))
  const detail = outside.slice(1).some((p, i) => diff(p, outside[i]!) > 30)
  expect(detail).toBe(true)

  expect(errors).toEqual([])
  await app.close()
})

test('hiện phím tắt, tự giảm nhạc và chụp khung hình: lưu được cài đặt và tạo file PNG', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)

  // Con trỏ → Hiện phím tắt đã bấm.
  await page.getByTestId('tab-cursor').click()
  await page.getByTestId('cursor-show-keys').click()
  await expect.poll(() => saved().cursor?.showKeys).toBe(true)

  // Âm lượng → Tự giảm nhạc khi có lời, mức 50 %.
  await page.getByTestId('tab-audio').click()
  await page.getByTestId('audio-duck').click()
  await expect(page.getByTestId('audio-duck-level')).toBeVisible()
  await page.getByTestId('audio-duck-level').fill('0.5')
  await expect.poll(() => saved().audio?.duck).toEqual({ enabled: true, level: 0.5 })

  // Chụp khung hình: file PNG trong exports, có thông báo.
  await page.waitForTimeout(500)
  await page.getByTestId('snapshot').click()
  await expect(page.getByTestId('toast')).toContainText('Đã lưu ảnh khung hình')
  await expect.poll(() => exported('.png').length).toBe(1)
  const png = readFileSync(join(projectDir, 'exports', exported('.png')[0]!))
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(png.length).toBeGreaterThan(1000)

  expect(errors).toEqual([])
  await app.close()
})
