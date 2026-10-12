import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer } from 'node:net'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { chromium, expect, test, type Page } from '@playwright/test'
import { pixelAt } from './fixtures'
import { createTestDirs, launchApp, probeMedia, type TestDirs } from './helpers'
import { startMockAi } from './mock-ai'

test.describe.configure({ timeout: 180_000 })

let dirs: TestDirs
test.beforeEach(() => {
  dirs = createTestDirs()
})
test.afterEach(() => dirs.cleanup())

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

/** ffmpeg đóng vai máy chủ RTMP (giống YouTube ingest) và lưu luồng nhận được thành FLV. */
async function startRtmpServer(
  output: string,
): Promise<{ url: string; done: Promise<void>; proc: ChildProcess }> {
  const port = await freePort()
  const url = `rtmp://127.0.0.1:${port}/live/e2ekey`
  const proc = spawn(ffmpegPath as unknown as string, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-listen',
    '1',
    '-timeout',
    '60',
    '-i',
    url,
    '-c',
    'copy',
    '-y',
    output,
  ])
  const done = new Promise<void>((resolve) => proc.on('close', () => resolve()))
  await new Promise((r) => setTimeout(r, 800))
  return { url, done, proc }
}

/** Màu nền studio (#111827) và ô trống chưa có hình (#1f2937). */
function isBackground(px: number[]): boolean {
  return [
    [17, 24, 39],
    [31, 41, 55],
  ].some((bg) => bg.every((v, i) => Math.abs(v - px[i]!) < 4))
}

async function openLive(page: Page) {
  await page.getByTestId('nav-live').click()
  await expect(page.getByTestId('live-program')).toBeVisible()
}

/** Màu điểm ảnh trên canvas chương trình. */
function canvasPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.getByTestId('live-program').evaluate(
    (el, [px, py]) => {
      const canvas = el as unknown as {
        getContext(type: '2d'): {
          getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
        }
      }
      return Array.from(canvas.getContext('2d').getImageData(px!, py!, 1, 1).data).slice(0, 3)
    },
    [x, y],
  )
}

test('phát trực tiếp tới máy chủ RTMP + ghi trong máy → tạo dự án', async () => {
  const received = join(dirs.userData, 'received.flv')
  const rtmp = await startRtmpServer(received)
  const { app, page, errors } = await launchApp(dirs.userData)
  try {
    await openLive(page)

    // Webcam giả được tự chọn và hiện trên khung hình (không còn là màu nền).
    await expect(page.getByTestId('host-camera')).not.toHaveValue('')
    await expect
      .poll(async () => isBackground(await canvasPixel(page, 640, 360)), { timeout: 15_000 })
      .toBe(false)

    // Thêm kênh RTMP tùy chỉnh.
    await page.getByTestId('dest-platform').selectOption('custom')
    await page.getByTestId('dest-name').fill('Máy chủ thử')
    await page.getByTestId('dest-server').fill(rtmp.url.replace('/e2ekey', ''))
    await page.getByTestId('dest-key').fill('e2ekey')
    await page.getByTestId('dest-add').click()
    await expect(page.getByTestId('destination')).toContainText('Đã lưu stream key')
    // Stream key không được lưu dạng đọc được trong file cấu hình.
    expect(readFileSync(join(dirs.userData, 'live.json'), 'utf8')).not.toContain('e2ekey')

    await page.getByTestId('banner-text').fill('Lumora E2E')
    await page.getByTestId('banner-toggle').click()

    await page.getByTestId('live-go').click()
    const destination = page.locator('[data-testid^="dest-state-"]')
    await expect(destination).toHaveText('Đang phát', { timeout: 30_000 })
    await expect(page.getByTestId('live-clock')).toHaveText(/00:0[5-9]|00:[1-5]\d/, {
      timeout: 30_000,
    })
    await page.getByTestId('live-stop').click()
    await expect(page.getByTestId('live-ended')).toContainText('Buổi phát đã kết thúc', {
      timeout: 30_000,
    })
    await rtmp.done

    // Luồng máy chủ nhận được: H.264 720p + AAC, dài ~5 giây trở lên.
    const info = probeMedia(received)
    expect({ width: info.width, height: info.height }).toEqual({ width: 1280, height: 720 })
    expect(info.hasAudio).toBe(true)
    expect(info.durationMs).toBeGreaterThan(4000)
    // Banner tím ở đáy khung, webcam ở giữa.
    const banner = pixelAt(received, 640, 705, 3)
    expect(banner[2]).toBeGreaterThan(banner[1] + 60)
    expect(isBackground(pixelAt(received, 640, 360, 3))).toBe(false)

    // Bản ghi trong máy thành dự án mở được.
    const folders = readdirSync(dirs.projects).filter((f) => f.startsWith('Live '))
    expect(folders).toHaveLength(1)
    const projectDir = join(dirs.projects, folders[0]!)
    expect(statSync(join(projectDir, 'live.mkv')).size).toBeGreaterThan(50_000)
    expect(existsSync(join(projectDir, 'thumbnail.jpg'))).toBe(true)
    const local = probeMedia(join(projectDir, 'live.mkv'))
    expect(local.durationMs).toBeGreaterThan(4000)
    await page.getByTestId('live-open-project').click()
    await expect(page.getByTestId('project-name')).toHaveText(folders[0]!.replace(/\.lumora$/, ''))

    expect(errors).toEqual([])
  } finally {
    rtmp.proc.kill()
    await app.close()
  }
})

test('khách mời vào qua link, lên sóng, hai bên thấy hình nhau', async () => {
  const { app, page, errors } = await launchApp(dirs.userData)
  const executablePath = existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  try {
    await openLive(page)
    await page.getByTestId('live-tab-guests').click()
    await page.getByTestId('open-room').click()
    const invite = (await page.getByTestId('invite-link-local').textContent())!
    expect(invite).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/join\/[a-f0-9]+$/)

    const guest = await browser.newPage()
    await guest.goto(invite)
    await guest.locator('#name').fill('Khách E2E')
    await expect(guest.locator('#join')).toBeEnabled({ timeout: 15_000 })
    await guest.locator('#join').click()

    // Host thấy khách trong hậu trường với hình webcam thật.
    const card = page.getByTestId('guest')
    await expect(card).toContainText('Khách E2E')
    await expect(card).toContainText('Sẵn sàng', { timeout: 20_000 })
    const guestId = (await card
      .locator('[data-testid^="guest-stage-"]')
      .getAttribute('data-testid'))!.replace('guest-stage-', '')
    await expect
      .poll(
        () =>
          page
            .getByTestId(`guest-video-${guestId}`)
            .evaluate((v) => (v as unknown as { videoWidth: number }).videoWidth),
        {
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0)

    // Khách nhận được hình chương trình 16:9 từ studio (WebRTC có thể tự hạ độ phân giải).
    await expect
      .poll(
        async () => {
          const [w, h] = await guest.locator('#program').evaluate((el) => {
            const v = el as unknown as { videoWidth: number; videoHeight: number }
            return [v.videoWidth, v.videoHeight]
          })
          return w >= 320 && Math.abs(w / h - 16 / 9) < 0.02
        },
        { timeout: 20_000 },
      )
      .toBe(true)

    // Đưa lên sóng: khách được báo, bố cục lưới có hai người (nửa phải là khách).
    await page.getByTestId(`guest-stage-${guestId}`).click()
    await expect(guest.locator('body')).toHaveAttribute('data-state', 'on-stage')
    await expect(card).toContainText('Đang trên sóng')
    await expect
      .poll(async () => isBackground(await canvasPixel(page, 960, 360)), { timeout: 15_000 })
      .toBe(false)

    // Mời ra: khách bị ngắt, host không còn khách.
    await card.getByRole('button', { name: 'Mời ra' }).click()
    await expect(page.getByTestId('guest')).toHaveCount(0)
    await expect(guest.locator('#status')).toContainText('Host đã mời bạn rời phòng', {
      timeout: 10_000,
    })

    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await app.close()
  }
})

test('bình luận YouTube hiện trong studio và đưa lên sóng được', async () => {
  const requests: string[] = []
  const youtube: Server = createHttpServer((req, res) => {
    requests.push(req.url ?? '')
    res.setHeader('content-type', 'application/json')
    if (req.url?.startsWith('/videos')) {
      res.end(JSON.stringify({ items: [{ liveStreamingDetails: { activeLiveChatId: 'chat-1' } }] }))
    } else if (req.url?.startsWith('/liveChat/messages')) {
      const first = !req.url.includes('pageToken')
      res.end(
        JSON.stringify({
          nextPageToken: 'p2',
          pollingIntervalMillis: 500,
          items: first
            ? [
                {
                  id: 'm1',
                  snippet: { displayMessage: 'Chào Lumora!', publishedAt: '2026-10-12T02:00:00Z' },
                  authorDetails: { displayName: 'Minh' },
                },
              ]
            : [],
        }),
      )
    } else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  await new Promise<void>((r) => youtube.listen(0, '127.0.0.1', () => r()))
  const port = (youtube.address() as { port: number }).port
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_YOUTUBE_API_BASE: `http://127.0.0.1:${port}` },
  })
  try {
    await openLive(page)
    await page.getByTestId('live-tab-comments').click()
    await page.getByTestId('yt-video').fill('video-123')
    await page.getByTestId('yt-video').blur()
    await page.getByTestId('yt-key').fill('AIza-e2e-key')
    await page.getByTestId('comments-toggle').click()

    const comment = page.getByTestId('comment')
    await expect(comment).toHaveCount(1)
    await expect(comment).toContainText('Minh')
    await expect(comment).toContainText('Chào Lumora!')
    expect(requests[0]).toContain('id=video-123')
    expect(requests[0]).toContain('key=AIza-e2e-key')
    // Đọc tiếp theo pageToken, không lặp bình luận cũ.
    await expect.poll(() => requests.some((r) => r.includes('pageToken=p2'))).toBe(true)
    await expect(comment).toHaveCount(1)

    // Đưa bình luận lên sóng: thẻ trắng xuất hiện ở góc dưới trái khung hình.
    await page.getByTestId('host-on-stage').uncheck()
    await expect.poll(async () => isBackground(await canvasPixel(page, 800, 625))).toBe(true)
    await comment.getByTestId('comment-feature').click()
    await expect
      .poll(async () => (await canvasPixel(page, 800, 625)).every((v) => v > 230))
      .toBe(true)

    await page.getByTestId('comments-toggle').click()
    await expect(page.getByTestId('comments-toggle')).toHaveText('Bắt đầu đọc bình luận')
    expect(errors).toEqual([])
  } finally {
    await app.close()
    await new Promise((r) => youtube.close(r))
  }
})

test('phụ đề trực tiếp: gửi âm thanh micro đi nhận dạng', async () => {
  const mock = await startMockAi()
  const { app, page, errors } = await launchApp(dirs.userData, {
    env: { LUMORA_ELEVENLABS_BASE_URL: mock.url },
  })
  try {
    await page.getByTestId('nav-settings').click()
    const card = page.getByTestId('key-card-elevenlabs')
    await card.getByLabel('ElevenLabs').fill('el_test_key_0123456789abcdef')
    await card.getByRole('button', { name: 'Lưu' }).click()
    await expect(page.getByTestId('key-status-elevenlabs')).toContainText('Đã lưu')

    await openLive(page)
    await expect(page.getByTestId('host-mic')).not.toHaveValue('')
    // Bỏ host khỏi sóng để khung chỉ còn nền, dễ nhận ra hộp phụ đề.
    await page.getByTestId('host-on-stage').uncheck()
    await expect.poll(async () => isBackground(await canvasPixel(page, 640, 60))).toBe(true)
    await page.getByTestId('live-tab-settings').click()
    await page.getByTestId('live-caption-language').selectOption('vi')
    await page.getByTestId('live-captions').check()

    await expect
      .poll(() => mock.requests.filter((r) => r.path === '/v1/speech-to-text').length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
    const stt = mock.requests.find((r) => r.path === '/v1/speech-to-text')!
    expect(stt.headers['xi-api-key']).toBe('el_test_key_0123456789abcdef')
    const form = stt.body.toString('latin1')
    expect(form).toContain('audio/webm')
    expect(form).toMatch(/name="language_code"\r\n\r\nvi/)
    expect(stt.body.length).toBeGreaterThan(5000)
    // Chữ nhận dạng được vẽ lên khung (hộp phụ đề đen ở phía trên giữa).
    await expect
      .poll(async () => isBackground(await canvasPixel(page, 640, 60)), { timeout: 10_000 })
      .toBe(false)

    await page.getByTestId('live-captions').uncheck()
    expect(errors).toEqual([])
  } finally {
    await app.close()
    await mock.close()
  }
})
