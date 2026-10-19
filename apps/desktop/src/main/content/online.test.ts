import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startMockContent } from '../../../e2e/mock-content'
import { runFfmpeg } from '../ffmpeg/runner'
import { MemeLibrary } from '../projects/images'
import { OnlineService } from './online'
import { searchPixabay } from './pixabay'

let dir: string
let mock: Awaited<ReturnType<typeof startMockContent>>

async function ffmpeg(args: string[]) {
  const r = await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...args])
  if (r.code !== 0) throw new Error(r.stderr)
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-online-'))
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=25:duration=1.5',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=500:duration=1.5',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    join(dir, 'meme.mp4'),
  ])
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=100x100:rate=5:duration=0.6',
    join(dir, 's.gif'),
  ])
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=80x45', '-frames:v', '1', join(dir, 't.jpg')])
  mock = await startMockContent({
    video: join(dir, 'meme.mp4'),
    gif: join(dir, 's.gif'),
    thumb: join(dir, 't.jpg'),
  })
  process.env.LUMORA_PIXABAY_BASE_URL = mock.url
}, 60_000)
afterAll(async () => {
  delete process.env.LUMORA_PIXABAY_BASE_URL
  await mock.close()
  await rm(dir, { recursive: true, force: true })
})

let work: string
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'lumora-online-work-'))
})
afterEach(() => rm(work, { recursive: true, force: true }))

const PIXABAY = 'mock-pixabay-key-0123456789'

describe('Pixabay', () => {
  it('video và ảnh: chuẩn hóa, phân trang theo số trang', async () => {
    const videos = await searchPixabay(PIXABAY, { q: 'cat', kind: 'video' })
    expect(videos.items[0]).toMatchObject({
      id: '100',
      source: 'pixabay',
      kind: 'video',
      title: 'cat 1',
      durationMs: 2000,
    })
    expect(videos.next).toBe('2')
    expect(mock.requests.at(-1)!.path).toBe('/api/videos/')
    const page2 = await searchPixabay(PIXABAY, { q: 'cat', kind: 'video', next: '2' })
    expect(page2.items[0]!.id).toBe('200')
    expect(page2.next).toBeNull()
    const images = await searchPixabay(PIXABAY, { q: 'dog', kind: 'image' })
    expect(images.items[0]).toMatchObject({ kind: 'image', width: 200, title: 'dog 1' })
    expect(images.attribution).toBe('Ảnh từ Pixabay')
  })

  it('key sai báo key_invalid', async () => {
    await expect(searchPixabay('wrong-key', { q: 'x', kind: 'video' })).rejects.toThrow(
      'key_invalid',
    )
  })
})

describe('OnlineService', () => {
  function service(keys: Record<string, string | undefined> = { pixabay: PIXABAY }) {
    const library = new MemeLibrary(join(work, 'memes'), runFfmpeg)
    const online = new OnlineService({
      getKey: async (name) => keys[name],
      library,
      tmpDir: join(work, 'cache'),
    })
    return { online, library }
  }

  it('tìm kiếm được nhớ 10 phút; chưa nhập key thì báo key_missing', async () => {
    const { online } = service()
    const before = mock.requests.length
    await online.search('pixabayVideo', 'Cat ', null)
    await online.search('pixabayVideo', 'cat', null)
    expect(mock.requests.length).toBe(before + 1)
    await expect(service({}).online.search('pixabayVideo', 'x', null)).rejects.toThrow(
      'key_missing',
    )
  })

  it('tải video Pixabay vào thư viện (chuẩn hóa MP4, có tiếng, nhớ nguồn), không tải lại lần hai', async () => {
    const { online, library } = service()
    const { items } = await online.search('pixabayVideo', 'bruh', null)
    const item = await online.download('pixabay', items[0]!.id)
    expect(item).toMatchObject({
      kind: 'video',
      name: 'bruh 1',
      hasAudio: true,
      origin: { source: 'pixabay', id: '100' },
    })
    expect(item.file).toMatch(/^meme-[0-9a-f]{12}\.mp4$/)
    // File tạm đã được dọn.
    expect(readdirSync(join(work, 'cache'))).toEqual([])
    const before = mock.requests.length
    const again = await online.download('pixabay', items[0]!.id)
    expect(again.file).toBe(item.file)
    expect(mock.requests.length).toBe(before)
    expect(await library.list()).toHaveLength(1)
  }, 60_000)

  it('ảnh Pixabay tải về dạng ảnh', async () => {
    const { online } = service()
    const images = await online.search('pixabayImage', 'dog', null)
    const image = await online.download('pixabay', images.items[0]!.id)
    expect(image).toMatchObject({ kind: 'image', origin: { source: 'pixabay', id: '100' } })
    expect(image.file).toMatch(/\.gif$/)
  }, 60_000)

  it('chỉ tải mục vừa có trong kết quả tìm kiếm', async () => {
    const { online } = service()
    await expect(online.download('pixabay', 'never-seen')).rejects.toThrow('online_unknown')
    expect(existsSync(join(work, 'memes'))).toBe(false)
  })
})
