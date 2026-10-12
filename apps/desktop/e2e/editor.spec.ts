import { execFileSync, spawnSync } from 'node:child_process'
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

/** Mở / đóng hộp thoại Xuất video (nút Xuất ở góc trên bên phải). */
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

test('chỉnh sửa: tự động zoom, cắt bớt, đổi nền rồi xuất MP4 và GIF đúng', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)

  // Hai click gần nhau → một đoạn zoom tự động.
  await page.getByTestId('tab-zoom').click()
  await expect(page.getByTestId('zoom-count')).toHaveText('1 đoạn zoom')
  await expect(page.getByTestId('timeline-zoom')).toHaveCount(1)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:04.0')

  // Tách ở giây 1 và 2 rồi xóa đoạn giữa: còn 3 giây.
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3)
  await page.getByTestId('timeline-clip').nth(1).click()
  await page.getByTestId('delete').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:03.0')

  // Hoàn tác rồi làm lại.
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3)
  await page.getByTestId('redo').click()
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)

  // Nền trơn màu sáng (#f5f5f4).
  await page.getByTestId('tab-frame').click()
  await page.getByTestId('bg-preset-6').click()

  // Xuất MP4 720p.
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await expect(page.getByTestId('export-size')).toHaveText('1280 × 720')
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })

  const [mp4] = exported('.mp4')
  expect(mp4).toBeTruthy()
  const file = join(projectDir, 'exports', mp4!)
  const info = probeMedia(file)
  expect({ width: info.width, height: info.height }).toEqual({ width: 1280, height: 720 })
  expect(info.hasAudio).toBe(true)
  expect(info.durationMs).toBeGreaterThan(2800)
  expect(info.durationMs).toBeLessThan(3300)
  // Góc khung là màu nền đã chọn; giữa khung là video (không phải màu nền).
  const corner = pixelAt(file, 4, 4)
  const background = [0xf5, 0xf5, 0xf4]
  corner.forEach((value, i) => expect(Math.abs(value - background[i]!)).toBeLessThan(10))
  expect(pixelAt(file, 640, 360)).not.toEqual(corner)

  // Bản chỉnh sửa được lưu lại.
  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.clips).toHaveLength(2)
  expect(saved.frame.background.color).toBe('#f5f5f4')

  // Xuất GIF.
  await page.getByTestId('format-gif').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toContainText('.gif', { timeout: 150_000 })
  const [gif] = exported('.gif')
  expect(
    readFileSync(join(projectDir, 'exports', gif!))
      .subarray(0, 6)
      .toString('ascii'),
  ).toBe('GIF89a')

  expect(errors).toEqual([])
  await app.close()
})

test('mở lại app: bản chỉnh sửa vẫn còn', async () => {
  let { app, page } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  // Chờ tự lưu.
  await expect
    .poll(() => {
      try {
        return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8')).clips.length
      } catch {
        return 0
      }
    })
    .toBe(2)
  await app.close()
  ;({ app, page } = await launchApp(dirs.userData))
  await openEditor(page)
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  await app.close()
})

/** Chụp khung xem trước (canvas có video khác nguồn nên không đọc pixel trực tiếp được). */
async function previewPixel(page: Page, x: number, y: number): Promise<number[]> {
  const file = join(projectDir, `.preview-${Date.now()}.png`)
  await page.getByTestId('editor-canvas').screenshot({ path: file })
  return pixelAt(file, x, y, 0)
}

const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 12)

test('xem trước đổi ngay khi chỉnh (không cần bấm Play); chế độ dọc 9:16 tự cắt và xuất đúng', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const timecode = await page.getByTestId('timecode').textContent()

  // Đổi nền khi đang dừng: góc khung (phần lề) đổi màu ngay.
  await page.getByTestId('tab-frame').click()
  await page.getByTestId('bg-preset-6').click()
  await expect
    .poll(() => previewPixel(page, 4, 4).then((p) => near(p, [0xf5, 0xf5, 0xf4])))
    .toBe(true)
  await page.getByTestId('bg-preset-0').click()
  await expect
    .poll(() => previewPixel(page, 4, 4).then((p) => near(p, [0xf5, 0xf5, 0xf4])))
    .toBe(false)
  // Vẫn đang dừng ở đúng chỗ cũ.
  await expect(page.getByTestId('timecode')).toHaveText(timecode!)

  // Chế độ dọc: khung 9:16, video phủ kín (góc không còn là nền), lấp đầy được bật sẵn.
  await page.getByTestId('bg-preset-6').click()
  await page.getByTestId('preset-vertical').click()
  await expect
    .poll(() =>
      page
        .getByTestId('editor-canvas')
        .evaluate((c) => [
          (c as unknown as { width: number }).width,
          (c as unknown as { height: number }).height,
        ]),
    )
    .toEqual([720, 1280])
  await expect(page.getByTestId('frame-fill')).toBeChecked()
  await expect
    .poll(() => previewPixel(page, 4, 300).then((p) => near(p, [0xf5, 0xf5, 0xf4])))
    .toBe(false)

  // Webcam dạng dải ở dưới.
  await page.getByTestId('tab-camera').click()
  await page.getByTestId('cam-layout-stack').click()
  await page.getByTestId('cam-stack-bottom').click()

  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await expect(page.getByTestId('export-size')).toHaveText('720 × 1280')
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })

  const [mp4] = exported('.mp4')
  const file = join(projectDir, 'exports', mp4!)
  const info = probeMedia(file)
  expect({ width: info.width, height: info.height }).toEqual({ width: 720, height: 1280 })
  // Kiểu cũ (video 16:9 nằm giữa khung dọc) thì phía trên và dưới là nền. Giờ phía trên là
  // video màn hình (cắt dọc), phía dưới là dải webcam — không còn chỗ nào lộ nền.
  for (const [x, y] of [
    [360, 100],
    [360, 400],
    [360, 900],
    [360, 1180],
  ] as const) {
    const p = pixelAt(file, x, y)
    expect(near(p, [0xf5, 0xf5, 0xf4]), `${x},${y}: ${p}`).toBe(false)
  }

  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.frame).toMatchObject({ aspect: '9:16', fill: true })
  expect(saved.camera).toMatchObject({ layout: 'stack', position: 'bottom-left' })
  expect(errors).toEqual([])
  await app.close()
})

test('timeline hiện dạng sóng âm thanh của bản quay trong clip video', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const wave = page.getByTestId('clip-waveform')
  await expect(wave).toHaveCount(1, { timeout: 30_000 })
  // Bản mẫu có micro (sine 440 Hz) suốt 4 giây: mọi cột đều có độ cao đáng kể.
  const heights = await wave
    .locator('path')
    .evaluate((p) =>
      [...(p.getAttribute('d') ?? '').matchAll(/v([\d.]+)/g)].map((m) => Number(m[1])),
    )
  expect(heights.length).toBeGreaterThan(50)
  expect(heights.filter((h) => h > 35).length / heights.length).toBeGreaterThan(0.8)
  expect(JSON.parse(readFileSync(join(projectDir, 'waveform.json'), 'utf8')).bucketMs).toBe(20)
  // Dải ảnh thu nhỏ kiểu CapCut ở trên, sóng âm ở dưới.
  await expect(page.getByTestId('filmstrip-tile').first()).toBeVisible({ timeout: 30_000 })
  // Số ô vừa đủ phủ chiều rộng clip (phụ thuộc kích thước cửa sổ của máy chạy test).
  const clipBox = (await page.getByTestId('clip-filmstrip').boundingBox())!
  const tileBox = (await page.getByTestId('filmstrip-tile').first().boundingBox())!
  // Đủ ô phủ kín chiều rộng clip (cho phép lệch 1 ô do làm tròn điểm ảnh).
  const tiles = await page.getByTestId('filmstrip-tile').count()
  expect(tiles).toBeGreaterThanOrEqual(Math.floor(clipBox.width / tileBox.width))
  expect(tiles).toBeLessThanOrEqual(Math.ceil(clipBox.width / tileBox.width) + 1)
  expect(tileBox.width).toBeGreaterThan(40)
  expect(await page.getByTestId('filmstrip-tile').first().getAttribute('style')).toContain(
    'filmstrip-0.jpg',
  )
  expect(existsSync(join(projectDir, 'filmstrip-0.jpg'))).toBe(true)
  // Ảnh thu nhỏ thật sự hiện ra: chụp clip, phần trên có màu của video mẫu (không phải nền trơn).
  const shot = join(projectDir, '.timeline.png')
  await page.getByTestId('timeline-clip').screenshot({ path: shot })
  const colors = [20, 120, 220, 320, 420].map((x) => pixelAt(shot, x, 20, 0).join(','))
  expect(new Set(colors).size).toBeGreaterThan(2)
  expect(errors).toEqual([])
  await app.close()
})

test('làm đẹp mặt webcam: video xuất ra sáng và mịn hơn bản không làm đẹp', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  // Webcam to ở góc trên trái để dễ đo.
  await page.getByTestId('tab-camera').click()
  await page.getByTestId('cam-layout-stack').click()
  await page.getByTestId('cam-stack-top').click()
  await openExport(page)
  await page.getByTestId('resolution-720').click()

  async function exportOnce(): Promise<string> {
    const before = new Set(exported('.mp4'))
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
    await expect.poll(() => exported('.mp4').filter((f) => !before.has(f)).length).toBe(1)
    return join(
      projectDir,
      'exports',
      exported('.mp4').find((f) => !before.has(f))!,
    )
  }
  const plain = await exportOnce()
  await closeExport(page)
  await page.getByTestId('tab-camera').click()
  await page.getByTestId('beauty-auto').click()
  await openExport(page)
  // Tên file có giây nên chờ qua giây mới để không trùng tên.
  await page.waitForTimeout(1100)
  const pretty = await exportOnce()

  // Trung bình độ sáng một hàng điểm ảnh trong dải webcam (nửa trên khung 1280×720 là dải 40%).
  const row = [100, 300, 500, 700, 900, 1100].map((x) => [x, 150] as const)
  const luma = (file: string) =>
    row.reduce((sum, [x, y]) => {
      const [r, g, b] = pixelAt(file, x, y)
      return sum + 0.299 * r + 0.587 * g + 0.114 * b
    }, 0) / row.length
  expect(luma(pretty)).toBeGreaterThan(luma(plain) + 6)

  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.camera.beauty.smooth).toBeGreaterThan(0)
  expect(errors).toEqual([])
  await app.close()
})

test('nhạc nền + hiệu ứng âm thanh: thêm từ máy, xuất video có nhạc đúng chỗ', async () => {
  const song = join(dirs.userData, 'Nhạc thử.mp3')
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:duration=1',
    song,
  ])
  const { app, page, errors } = await launchApp(dirs.userData)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, song)
  await openEditor(page)
  await page.getByTestId('tab-audio').click()
  // Tắt micro để chỉ còn nhạc nền trong video xuất.
  await page.getByTestId('audio-mic').fill('0')

  // Nhạc bắt đầu ở giây 1 (bài dài 1 giây nhưng tự lặp tới hết video).
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('lib-audio').click()
  await page.getByTestId('audio-section-music').click()
  await page.getByTestId('add-music').click()
  await expect(page.getByTestId('timeline-audio')).toHaveCount(1)
  await expect(page.getByTestId('timeline-audio')).toContainText('Nhạc thử')
  await page.getByTestId('audio-section-sfx').click()
  await page.getByTestId('sfx-ding').click()
  await expect(page.getByTestId('timeline-audio')).toHaveCount(2)
  // Dạng sóng của nhạc hiện trên timeline.
  await expect(page.getByTestId('timeline-audio').first().locator('svg[data-bars]')).toBeVisible()

  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const file = join(projectDir, 'exports', exported('.mp4')[0]!)
  expect(probeMedia(file).hasAudio).toBe(true)

  const loudness = (from: number, len: number) => {
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
  expect(loudness(0.1, 0.7)).toBeLessThan(-50)
  // Sau 1 giây của bài (1s → 2s) vẫn có tiếng nhờ lặp lại.
  expect(loudness(2.2, 0.6)).toBeGreaterThan(-35)

  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.audioClips.map((c: { kind: string }) => c.kind)).toEqual(['music', 'sfx'])
  expect(
    readdirSync(projectDir).filter((f) => f.startsWith('asset-') && !f.endsWith('.peaks.json')),
  ).toHaveLength(2)
  expect(errors).toEqual([])
  await app.close()
})

test('chuyển tiếp: mờ qua đen làm khung ở chỗ nối tối đen; glitch xuất ra không lỗi', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  // Tách ở giây 2 → có một chỗ nối.
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('s')
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2)
  await page.getByTestId('transition-marker').dispatchEvent('pointerdown')
  await page.getByTestId('transition-fadeBlack').click()
  await expect(page.getByTestId('transition-marker')).toHaveAttribute('data-active', 'true')

  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const plain = join(projectDir, 'exports', exported('.mp4')[0]!)
  /** Độ sáng trung bình (Y, 0..255) của cả khung hình tại giây `t`. */
  const luma = (file: string, t: number) => {
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
  // Đúng chỗ nối (giây 2) gần như đen; xa chỗ nối thì bình thường.
  expect(luma(plain, 2.0)).toBeLessThan(20)
  expect(luma(plain, 0.5)).toBeGreaterThan(60)
  expect(luma(plain, 3.5)).toBeGreaterThan(60)

  // Các kiểu còn lại (zoom, nhòe, lướt, glitch vẽ lại khung bằng ảnh chụp tạm): xuất được, đủ dài,
  // và khung ở chỗ nối khác hẳn kiểu mờ qua đen.
  for (const kind of ['fadeWhite', 'flash', 'zoom', 'blur', 'slide', 'glitch']) {
    await closeExport(page)
    await page.getByTestId('transition-marker').dispatchEvent('pointerdown')
    await page.getByTestId(`transition-${kind}`).click()
    await openExport(page)
    await page.waitForTimeout(1100)
    const before = new Set(exported('.mp4'))
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-result'), kind).toBeVisible({ timeout: 150_000 })
    await expect.poll(() => exported('.mp4').filter((f) => !before.has(f)).length).toBe(1)
    const file = join(
      projectDir,
      'exports',
      exported('.mp4').find((f) => !before.has(f))!,
    )
    expect(probeMedia(file).durationMs, kind).toBeGreaterThan(3800)
    expect(luma(file, 2.0), kind).toBeGreaterThan(40)
  }

  const saved = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(saved.transitions).toEqual([
    { afterClip: saved.clips[0].id, kind: 'glitch', durationMs: 600 },
  ])
  expect(errors).toEqual([])
  await app.close()
})

test('hiệu ứng hình: đủ 10 kiểu xuất được; đen trắng làm mất màu, viền tối làm góc tối đi', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const plain = join(projectDir, 'exports', exported('.mp4')[0]!)

  // Giây 0–1: đen trắng; 1–2: viền tối; 2–3: rung + VHS + glitch + pháo giấy; 3–4: mờ + lóe + nhún + cổ điển.
  await closeExport(page)
  await page.getByTestId('lib-effects').click()
  const groups = [
    ['bw'],
    ['vignette'],
    ['shake', 'vhs', 'glitch', 'confetti'],
    ['blur', 'flash', 'pulse', 'vintage'],
  ]
  for (const [second, kinds] of groups.entries()) {
    if (second > 0) {
      await page.getByTestId('editor-canvas').click()
      await page.keyboard.press('ArrowRight')
    }
    for (const kind of kinds) await page.getByTestId(`effect-add-${kind}`).click()
  }
  await expect(page.getByTestId('timeline-effect')).toHaveCount(10)
  // Đen trắng và viền tối mạnh nhất, mỗi cái chỉ 1 giây.
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  await expect.poll(() => saved().effects?.length).toBe(10)

  await openExport(page)
  await page.waitForTimeout(1100)
  const before = new Set(exported('.mp4'))
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  await expect.poll(() => exported('.mp4').filter((f) => !before.has(f)).length).toBe(1)
  const styled = join(
    projectDir,
    'exports',
    exported('.mp4').find((f) => !before.has(f))!,
  )
  expect(probeMedia(styled).durationMs).toBeGreaterThan(3800)

  const stats = (file: string, t: number) => {
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
    const get = (key: string) =>
      Number(new RegExp(`signalstats\\.${key}=([\\d.]+)`).exec(stderr)?.[1] ?? -1)
    return { sat: get('SATAVG'), y: get('YAVG') }
  }
  // Đen trắng (độ mạnh 70%): màu giảm mạnh.
  expect(stats(styled, 0.5).sat).toBeLessThan(stats(plain, 0.5).sat * 0.5)
  // Viền tối: góc tối hơn bản gốc.
  const corner = (file: string) => {
    const [r, g, b] = pixelAt(file, 20, 20, 1.5)
    return r + g + b
  }
  expect(corner(styled)).toBeLessThan(corner(plain))
  // Các hiệu ứng còn lại làm khung khác bản gốc.
  for (const t of [2.5, 3.5]) {
    const a = stats(plain, t)
    const b = stats(styled, t)
    expect(Math.abs(a.y - b.y) + Math.abs(a.sat - b.sat), `t=${t}`).toBeGreaterThan(2)
  }
  expect(errors).toEqual([])
  await app.close()
})

test('chữ meme + GIF meme từ thư viện: kéo đặt vị trí trên khung xem trước, xuất ra đúng chỗ, GIF chuyển động', async () => {
  const gif = join(dirs.userData, 'dance.gif')
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    // Mỗi khung một màu khác hẳn (đỏ → xanh), 5 khung/giây.
    "nullsrc=s=200x200:r=5:d=2,geq=r='mod(N*80\\,256)':g=40:b='255-mod(N*80\\,256)'",
    gif,
  ])
  const { app, page, errors } = await launchApp(dirs.userData)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, gif)
  await openEditor(page)
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const plain = join(projectDir, 'exports', exported('.mp4')[0]!)

  await closeExport(page)
  await page.getByTestId('lib-media').click()
  await page.getByTestId('meme-import').click()
  await expect(page.getByTestId('meme-item')).toHaveCount(1)
  await page.getByTestId('meme-item').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await page.getByTestId('anim-in-none').click()

  // Kéo ảnh từ giữa khung tới vị trí (80%, 70%).
  const box = (await page.getByTestId('editor-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, { steps: 5 })
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 5 })
  await page.mouse.up()
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  await expect.poll(() => saved().overlays?.[0]?.x ?? 0).toBeGreaterThan(0.75)
  expect(saved().overlays[0].y).toBeGreaterThan(0.65)

  // Chữ meme ở trên cùng, không hiệu ứng để dễ đo.
  await page.getByTestId('lib-text').click()
  await page.getByTestId('text-add-meme').click()
  await page.getByTestId('overlay-edit-text').fill('HẾT CỨU')
  await page.getByTestId('anim-in-none').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(2)
  await expect.poll(() => saved().overlays?.length).toBe(2)

  await openExport(page)
  await page.waitForTimeout(1100)
  const before = new Set(exported('.mp4'))
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  await expect.poll(() => exported('.mp4').filter((f) => !before.has(f)).length).toBe(1)
  const styled = join(
    projectDir,
    'exports',
    exported('.mp4').find((f) => !before.has(f))!,
  )

  /** Độ sáng trung bình của một vùng (crop w:h:x:y) tại giây t. */
  const area = (file: string, t: number, crop: string) => {
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
        `crop=${crop},signalstats,metadata=print`,
        '-f',
        'null',
        '-',
      ],
      { encoding: 'utf8' },
    )
    // Cộng độ sáng (Y) và hai kênh màu (U, V) để phân biệt cả vùng cùng độ sáng nhưng khác màu.
    return ['YAVG', 'UAVG', 'VAVG'].map((k) =>
      Number(new RegExp(`signalstats\\.${k}=([\\d.]+)`).exec(stderr)?.[1] ?? -1),
    )
  }
  const diff = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0)
  // Chữ ở trên giữa khung: vùng đó khác hẳn bản gốc.
  const textArea = '300:50:490:83'
  expect(diff(area(styled, 1, textArea), area(plain, 1, textArea))).toBeGreaterThan(10)
  // Ảnh GIF đã được kéo tới (80%, 70%): vùng đó khác bản gốc…
  const gifArea = '150:150:950:430'
  expect(diff(area(styled, 1, gifArea), area(plain, 1, gifArea))).toBeGreaterThan(10)
  // …và tự đổi khung theo thời gian (GIF động), còn vùng giữa khung nơi ảnh từng ở thì như bản gốc.
  const frames = [0.3, 0.7, 1.1, 1.5].map((t) => area(styled, t, '120:120:960:440'))
  expect(Math.max(...frames.slice(1).map((f) => diff(f, frames[0]!)))).toBeGreaterThan(1)
  const center = '100:100:590:310'
  expect(diff(area(styled, 1, center), area(plain, 1, center))).toBeLessThan(4)

  expect(errors).toEqual([])
  await app.close()
})

/** Độ sáng + màu trung bình (Y, U, V) của vùng crop=w:h:x:y tại giây t. */
function areaStats(file: string, t: number, crop: string): number[] {
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
      `crop=${crop},signalstats,metadata=print`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return ['YAVG', 'UAVG', 'VAVG'].map((k) =>
    Number(new RegExp(`signalstats\\.${k}=([\\d.]+)`).exec(stderr)?.[1] ?? -1),
  )
}
const statsDiff = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0)

test('webcam: kéo tự do trên khung xem trước, kéo góc đổi cỡ, xuất ra đúng vị trí mới', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const before = join(projectDir, 'exports', exported('.mp4')[0]!)
  await closeExport(page)

  // Bong bóng mặc định ở góc dưới phải (khung xem trước 1280×720, cỡ 22%).
  const box = (await page.getByTestId('editor-canvas').boundingBox())!
  const sx = box.width / 1280
  const from = { x: box.x + 1175.6 * sx, y: box.y + 615.6 * sx }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3, { steps: 6 })
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, { steps: 6 })
  await page.mouse.up()
  // Bấm vào webcam là chọn webcam: hiện khung chọn và mở phần Webcam bên phải.
  await expect(page.getByTestId('selection-box')).toHaveAttribute('data-target', 'camera')
  await expect(page.getByTestId('tab-camera')).toHaveAttribute('aria-selected', 'true')
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  await expect.poll(() => saved().camera.x).toBeLessThan(0.33)
  expect(saved().camera.x).toBeGreaterThan(0.19)
  expect(saved().camera.y).toBeGreaterThan(0.29)
  expect(saved().camera.y).toBeLessThan(0.43)

  // Kéo góc dưới phải của khung chọn ra ngoài: webcam to hơn, tâm giữ nguyên.
  const handle = (await page.getByTestId('handle-se').boundingBox())!
  await page.mouse.move(handle.x + 4, handle.y + 4)
  await page.mouse.down()
  await page.mouse.move(handle.x + 40, handle.y + 40, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => saved().camera.size).toBeGreaterThan(0.28)

  await openExport(page)
  await page.waitForTimeout(1100)
  const old = new Set(exported('.mp4'))
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  await expect.poll(() => exported('.mp4').filter((f) => !old.has(f)).length).toBe(1)
  const after = join(
    projectDir,
    'exports',
    exported('.mp4').find((f) => !old.has(f))!,
  )

  // Chỗ cũ (dưới phải) giờ là video màn hình; chỗ mới (khoảng 30%, 40%) giờ là webcam.
  const oldSpot = '80:80:1135:575'
  const newSpot = '80:80:344:248'
  expect(statsDiff(areaStats(after, 1, oldSpot), areaStats(before, 1, oldSpot))).toBeGreaterThan(8)
  expect(statsDiff(areaStats(after, 1, newSpot), areaStats(before, 1, newSpot))).toBeGreaterThan(8)
  expect(errors).toEqual([])
  await app.close()
})

test('video meme phông xanh: nhập vào thư viện, thêm vào timeline, xóa phông, có tiếng khi xuất', async () => {
  // Video meme 2 giây: phông xanh lá, ô đỏ ở giữa, có tiếng 880 Hz.
  const meme = join(dirs.userData, 'Bruh meme.mp4')
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x00ff00:s=320x180:r=30:d=2,drawbox=x=110:y=40:w=100:h=100:color=red:t=fill',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=2',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-shortest',
    meme,
  ])
  const { app, page, errors } = await launchApp(dirs.userData)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, meme)
  await openEditor(page)
  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const plain = join(projectDir, 'exports', exported('.mp4')[0]!)
  await closeExport(page)

  // Tắt micro để đo riêng tiếng của meme.
  await page.getByTestId('tab-audio').click()
  await page.getByTestId('audio-mic').fill('0')

  // Mục Meme mở sẵn: nhập video (được chuẩn hóa sang MP4) vào thư viện.
  await page.getByTestId('meme-import').click()
  await expect(page.getByTestId('meme-item')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByTestId('meme-item')).toHaveAttribute('data-kind', 'video')
  await expect(page.getByTestId('meme-item')).toContainText('Bruh meme')

  // Thêm tại giây 1, xóa phông xanh, phủ kín khung.
  await page.getByTestId('editor-canvas').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('meme-item').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveAttribute('data-kind', 'video')
  await page.getByTestId('key-00ff00').click()
  await page.getByTestId('overlay-fill').click()
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  await expect.poll(() => saved().overlays?.[0]?.keyColor).toBe('#00ff00')
  expect(saved().overlays[0]).toMatchObject({
    kind: 'video',
    start: 1000,
    hasAudio: true,
    size: 1,
  })
  expect(saved().overlays[0].end).toBeGreaterThan(2900)
  expect(saved().overlays[0].end).toBeLessThan(3100)
  // File meme được chép vào dự án (chia sẻ dự án vẫn có).
  expect(existsSync(join(projectDir, saved().overlays[0].file))).toBe(true)

  // Xem trước: khung đang dừng ở giây 1 hiện ô đỏ giữa khung.
  const shown = (await page.getByTestId('editor-canvas').boundingBox())!
  await expect
    .poll(() =>
      previewPixel(page, Math.round(shown.width / 2), Math.round(shown.height / 2)).then(
        ([r, g, b]) => r! > 150 && g! < 100 && b! < 100,
      ),
    )
    .toBe(true)

  await openExport(page)
  await page.waitForTimeout(1100)
  const old = new Set(exported('.mp4'))
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  await expect.poll(() => exported('.mp4').filter((f) => !old.has(f)).length).toBe(1)
  const file = join(
    projectDir,
    'exports',
    exported('.mp4').find((f) => !old.has(f))!,
  )

  // Giữa khung (ô đỏ của meme) đỏ rực trong lúc meme hiện.
  const [r, g, b] = pixelAt(file, 640, 360, 1.5)
  expect(r).toBeGreaterThan(150)
  expect(g).toBeLessThan(100)
  expect(b).toBeLessThan(100)
  // Phông xanh đã bị xóa: góc trên trái là video màn hình gốc, không phải màu xanh lá.
  const cornerArea = '200:120:40:40'
  expect(
    statsDiff(areaStats(file, 1.5, cornerArea), areaStats(plain, 1.5, cornerArea)),
  ).toBeLessThan(12)
  const [cr, cg, cb] = pixelAt(file, 100, 100, 1.5)
  expect(cg! - Math.max(cr!, cb!)).toBeLessThan(120)
  // Trước và sau khi meme hiện, khung như bản gốc.
  const center = '100:100:590:310'
  expect(statsDiff(areaStats(file, 0.5, center), areaStats(plain, 0.5, center))).toBeLessThan(4)
  expect(statsDiff(areaStats(file, 3.5, center), areaStats(plain, 3.5, center))).toBeLessThan(4)

  // Tiếng meme: có trong lúc meme hiện, im lặng trước đó (micro đã tắt).
  const loudness = (from: number, len: number) => {
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
  expect(loudness(0.1, 0.7)).toBeLessThan(-50)
  expect(loudness(1.3, 1)).toBeGreaterThan(-35)
  expect(loudness(3.3, 0.6)).toBeLessThan(-50)
  expect(errors).toEqual([])
  await app.close()
})

/** Độ bão hòa màu trung bình (SATAVG) của vùng crop=w:h:x:y tại giây t. */
function saturation(file: string, t: number, crop: string): number {
  const { stderr } = spawnSync(
    ffmpegPath as unknown as string,
    ['-hide_banner', '-ss', String(t), '-i', file, '-frames:v', '1'].concat([
      '-vf',
      `crop=${crop},signalstats,metadata=print`,
      '-f',
      'null',
      '-',
    ]),
    { encoding: 'utf8' },
  )
  return Number(/signalstats\.SATAVG=([\d.]+)/.exec(stderr)?.[1] ?? -1)
}

test('bộ lọc màu, lật clip và đóng băng khung hình: video xuất đúng như chỉnh', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const exportNew = async () => {
    await openExport(page)
    await page.getByTestId('resolution-720').click()
    await page.waitForTimeout(1100)
    const old = new Set(exported('.mp4'))
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
    await expect.poll(() => exported('.mp4').filter((f) => !old.has(f)).length).toBe(1)
    await closeExport(page)
    return join(
      projectDir,
      'exports',
      exported('.mp4').find((f) => !old.has(f))!,
    )
  }
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  const centre = '400:200:440:260'
  const plain = await exportNew()
  expect(saturation(plain, 1, centre)).toBeGreaterThan(15)

  // Bộ lọc Đen trắng cho cả video: phần video màn hình mất màu.
  await page.getByTestId('lib-filters').click()
  await page.getByTestId('filter-bw').click()
  await expect.poll(() => saved().look?.filter).toBe('bw')
  const bw = await exportNew()
  expect(saturation(bw, 1, centre)).toBeLessThan(3)

  // Bộ lọc Ấm: ngả đỏ (V tăng) và bớt xanh dương (U giảm) so với bản gốc (đo cả vùng video).
  await page.getByTestId('filter-warm').click()
  await expect.poll(() => saved().look?.filter).toBe('warm')
  const warm = await exportNew()
  const video = '1100:600:90:60'
  const [, uPlain, vPlain] = areaStats(plain, 1, video)
  const [, uWarm, vWarm] = areaStats(warm, 1, video)
  expect(vWarm).toBeGreaterThan(vPlain! + 1)
  expect(uWarm).toBeLessThan(uPlain! - 6)

  // Lật ngang clip: bên trái của video mới giống bên phải (soi gương) của bản gốc.
  await page.getByTestId('filter-none').click()
  await page.getByTestId('timeline-clip').first().click()
  await page.getByTestId('clip-flip-h').click()
  await expect.poll(() => saved().clips[0].transform?.flipH).toBe(true)
  const flipped = await exportNew()
  const left = '160:160:200:200'
  const mirrored = '160:160:920:200'
  expect(statsDiff(areaStats(flipped, 1, left), areaStats(plain, 1, mirrored))).toBeLessThan(8)
  expect(statsDiff(areaStats(flipped, 1, left), areaStats(plain, 1, left))).toBeGreaterThan(15)

  // Bỏ lật, đóng băng 2 giây tại giây 1: video dài thêm 2 giây và hình đứng yên trong lúc đó.
  await page.getByTestId('clip-flip-h').click()
  await expect.poll(() => saved().clips[0].transform).toBeUndefined()
  // Bấm clip trên timeline cũng dời đầu phát: về đầu video rồi tiến 1 giây.
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('timecode')).toContainText('0:01.0 /')
  await page.getByTestId('freeze').click()
  await expect(page.getByTestId('clip-freeze-badge')).toHaveCount(1)
  await expect(page.getByTestId('timecode')).toContainText('/ 0:06.0')
  await expect.poll(() => saved().clips.length).toBe(3)
  const frozen = await exportNew()
  expect(probeMedia(frozen).durationMs).toBeGreaterThan(5800)
  const moving = '1280:720:0:0'
  expect(statsDiff(areaStats(frozen, 1.3, moving), areaStats(frozen, 2.7, moving))).toBeLessThan(1)
  expect(statsDiff(areaStats(plain, 1.3, centre), areaStats(plain, 2.7, centre))).toBeGreaterThan(2)
  // Sau khi hết đứng yên, video chạy tiếp từ đúng chỗ (giây 3.5 của bản mới = giây 1.5 bản gốc).
  expect(statsDiff(areaStats(frozen, 3.5, centre), areaStats(plain, 1.5, centre))).toBeLessThan(4)

  expect(errors).toEqual([])
  await app.close()
})

test('lớp phủ: keyframe kéo trên khung xem trước, mặt nạ tròn, hòa trộn Screen — video xuất đúng', async () => {
  const red = join(dirs.userData, 'green.png')
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x00ff00:s=200x200:d=1',
    '-frames:v',
    '1',
    red,
  ])
  const { app, page, errors } = await launchApp(dirs.userData)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, red)
  await openEditor(page)
  const exportNew = async () => {
    await openExport(page)
    await page.getByTestId('resolution-720').click()
    await page.waitForTimeout(1100)
    const old = new Set(exported('.mp4'))
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
    await expect.poll(() => exported('.mp4').filter((f) => !old.has(f)).length).toBe(1)
    await closeExport(page)
    return join(
      projectDir,
      'exports',
      exported('.mp4').find((f) => !old.has(f))!,
    )
  }
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  const plain = await exportNew()

  await page.getByTestId('lib-media').click()
  await page.getByTestId('meme-import').click()
  await page.getByTestId('meme-item').click()
  await expect(page.getByTestId('timeline-overlay')).toHaveCount(1)
  await page.getByTestId('anim-in-none').click()

  const box = (await page.getByTestId('editor-canvas').boundingBox())!
  const drag = async (fromX: number, toX: number) => {
    await page.mouse.move(box.x + box.width * fromX, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * ((fromX + toX) / 2), box.y + box.height * 0.5, {
      steps: 5,
    })
    await page.mouse.move(box.x + box.width * toX, box.y + box.height * 0.5, { steps: 5 })
    await page.mouse.up()
  }
  // Keyframe ở 0s, kéo ảnh sang trái; sang 2s kéo sang phải → tự thêm keyframe thứ hai.
  await page.getByTestId('overlay-keyframe').click()
  await drag(0.5, 0.25)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('timecode')).toContainText('0:02.0 /')
  await drag(0.25, 0.75)
  await expect.poll(() => saved().overlays?.[0]?.keyframes?.length).toBe(2)
  await expect(page.getByTestId('keyframe-mark')).toHaveCount(2)
  const [k0, k1] = saved().overlays[0].keyframes
  expect(k0.x).toBeLessThan(0.3)
  expect(k1.x).toBeGreaterThan(0.7)

  const moving = await exportNew()
  // Giây 0.1: ảnh xanh lá ở chỗ keyframe đầu (lấy làm mẫu màu). Giây 1: ảnh ở giữa hai keyframe,
  // chỗ ban đầu không còn ảnh.
  const xAt = (x: number) => `40:40:${Math.round(x * 1280) - 20}:340`
  const middle = (k0.x + k1.x) / 2
  const green = areaStats(moving, 0.1, xAt(k0.x))
  expect(green[2]).toBeLessThan(60)
  expect(statsDiff(areaStats(moving, 1, xAt(middle)), green)).toBeLessThan(12)
  expect(statsDiff(areaStats(moving, 1, xAt(k0.x)), green)).toBeGreaterThan(40)

  // Bỏ keyframe (ảnh đứng ở vị trí hiện tại), mặt nạ tròn + hòa trộn Screen.
  await page.getByTestId('overlay-kf-clear').click()
  await page.getByTestId('mask-circle').click()
  await page.getByTestId('overlay-blend').selectOption('screen')
  await expect.poll(() => saved().overlays?.[0]?.blend).toBe('screen')
  expect(saved().overlays[0].mask.shape).toBe('circle')
  const masked = await exportNew()
  const cx = Math.round(saved().overlays[0].x * 1280)
  const half = Math.round((saved().overlays[0].size * 720) / 2)
  // Góc của ảnh nằm ngoài hình tròn: giống video gốc.
  const corner = `20:20:${cx - half + 4}:${360 - half + 4}`
  expect(statsDiff(areaStats(masked, 1, corner), areaStats(plain, 1, corner))).toBeLessThan(8)
  // Tâm: Screen (xanh lá trên nền tím) sáng hơn hẳn cả video gốc lẫn ảnh xanh vẽ thường.
  const centre = `30:30:${cx - 15}:345`
  const yPlain = areaStats(plain, 1, centre)[0]!
  const yMasked = areaStats(masked, 1, centre)[0]!
  expect(yMasked).toBeGreaterThan(yPlain + 30)
  expect(yMasked).toBeGreaterThan(green[0]! + 10)

  expect(errors).toEqual([])
  await app.close()
})

test('phát ngược, đường cong tốc độ và độ mờ clip: video xuất đúng', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  const exportNew = async () => {
    await openExport(page)
    await page.getByTestId('resolution-720').click()
    await page.waitForTimeout(1100)
    const old = new Set(exported('.mp4'))
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
    await expect.poll(() => exported('.mp4').filter((f) => !old.has(f)).length).toBe(1)
    await closeExport(page)
    return join(
      projectDir,
      'exports',
      exported('.mp4').find((f) => !old.has(f))!,
    )
  }
  const saved = () => JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  const video = '1100:600:90:60'
  const plain = await exportNew()

  // Phát ngược: khung đầu của bản xuất là khung cuối của bản gốc (có cả tiếng đảo ngược).
  await page.getByTestId('timeline-clip').first().click()
  await page.getByTestId('clip-reverse').click()
  await expect(page.getByTestId('clip-reverse-status')).toHaveText(/sẵn sàng/, { timeout: 60_000 })
  await expect.poll(() => saved().clips[0].reversed).toBe(true)
  expect(
    readdirSync(projectDir)
      .filter((f) => f.startsWith('rev-'))
      .sort(),
  ).toEqual(['rev-s0-0-4000-camera.mp4', 'rev-s0-0-4000-mic.m4a', 'rev-s0-0-4000-screen.mp4'])
  const reversed = await exportNew()
  expect(statsDiff(areaStats(reversed, 0.3, video), areaStats(plain, 3.7, video))).toBeLessThan(4)
  expect(statsDiff(areaStats(reversed, 0.3, video), areaStats(plain, 0.3, video))).toBeGreaterThan(
    4,
  )
  expect(probeMedia(reversed).durationMs).toBeGreaterThan(3800)

  // Bỏ phát ngược; đường cong "Lướt vào" (bắt đầu 6×) làm video ngắn lại; độ mờ 30% thấy nền.
  await page.getByTestId('clip-reverse').click()
  await page.getByTestId('clip-tab-speed').click()
  await page.getByTestId('speed-mode-curve').click()
  await page.getByTestId('curve-flashIn').click()
  await page.getByTestId('clip-tab-video').click()
  await page.getByTestId('clip-opacity-input').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('30')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved().clips[0].opacity).toBe(0.3)
  expect(saved().clips[0].speedCurve.preset).toBe('flashIn')
  expect(saved().clips[0].reversed).toBeUndefined()
  const curved = await exportNew()
  const length = probeMedia(curved).durationMs ?? 0
  expect(length).toBeLessThan(3000)
  expect(length).toBeGreaterThan(1500)
  // Độ mờ 30%: video màn hình nhạt đi, nền (gradient mịn) lộ ra → độ chênh sáng tối giảm mạnh.
  // Cuối clip đường cong chạy 1× nên khung cuối ứng với khung cuối bản gốc.
  const spread = (file: string, t: number) => {
    const { stderr } = spawnSync(
      ffmpegPath as unknown as string,
      ['-hide_banner', '-ss', String(t), '-i', file, '-frames:v', '1'].concat([
        '-vf',
        `crop=${video},signalstats,metadata=print`,
        '-f',
        'null',
        '-',
      ]),
      { encoding: 'utf8' },
    )
    const get = (k: string) => Number(new RegExp(`signalstats\\.${k}=([\\d.]+)`).exec(stderr)?.[1])
    return get('YHIGH') - get('YLOW')
  }
  expect(spread(curved, length / 1000 - 0.15)).toBeLessThan(spread(plain, 3.85) * 0.5)

  expect(errors).toEqual([])
  await app.close()
})

test('AI xóa phông webcam: nạp được AI trong app, phông màu thay phần không phải người khi xuất', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  await openEditor(page)
  await page.getByTestId('tab-camera').click()
  await page.getByTestId('cam-bg-mode-color').click()
  await page.getByTestId('cam-bg-color-input').fill('#ff0000')
  // AI chạy thật (MediaPipe qua lumora-media://ai) trong khung xem trước.
  await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'ready', {
    timeout: 60_000,
  })
  const saved = () => {
    try {
      return JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
    } catch {
      return { camera: {} }
    }
  }
  await expect.poll(() => saved().camera.background?.color).toBe('#ff0000')
  expect(saved().camera.background.mode).toBe('color')

  await openExport(page)
  await page.getByTestId('resolution-720').click()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 150_000 })
  const file = join(projectDir, 'exports', exported('.mp4')[0]!)
  // Webcam mẫu không có người: cả bong bóng thành màu phông (đỏ: V rất cao).
  const r = Math.round((saved().camera.size * 720) / 2)
  const cx = Math.round(1280 - 0.04 * 720 - r)
  const cy = Math.round(720 - 0.04 * 720 - r)
  const [, , v] = areaStats(file, 1, `30:30:${cx - 15}:${cy - 15}`)
  expect(v).toBeGreaterThan(200)

  expect(errors).toEqual([])
  await app.close()
})
