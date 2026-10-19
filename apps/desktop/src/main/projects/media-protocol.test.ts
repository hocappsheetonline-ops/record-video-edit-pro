import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleMediaRequest, parseRange, resolveMediaPath } from './media-protocol'

describe('parseRange', () => {
  it('đọc các dạng Range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=500-5000', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('không có hoặc sai cú pháp thì đọc cả file', () => {
    expect(parseRange(null, 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
  })

  it('báo lỗi khi vượt kích thước', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('invalid')
    expect(parseRange('bytes=5-2', 1000)).toBe('invalid')
  })
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-media-'))
  await mkdir(join(dir, 'a b.lumora'))
  await writeFile(join(dir, 'a b.lumora', 'seg0-screen.mkv'), '0123456789')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const url = (folder: string, file: string) =>
  `lumora-media://projects/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`

describe('resolveMediaPath', () => {
  it('trả về file trong thư mục dự án', () => {
    expect(resolveMediaPath(url('a b.lumora', 'seg0-screen.mkv'), dir)).toBe(
      join(dir, 'a b.lumora', 'seg0-screen.mkv'),
    )
  })

  it('chặn truy cập ra ngoài', () => {
    expect(resolveMediaPath(url('..', 'x'), dir)).toBeNull()
    expect(resolveMediaPath(url('a b.lumora', '../../secret'), dir)).toBeNull()
    expect(resolveMediaPath('lumora-media://other/a.lumora/x.mkv', dir)).toBeNull()
    expect(resolveMediaPath('lumora-media://projects/a.lumora/x/y.mkv', dir)).toBeNull()
  })

  describe('thư viện chung (library/<tên>/<file>)', () => {
    const libraries = () => ({ memes: join(dir, 'memes'), music: join(dir, 'music') })

    it('trả về file trong thư mục thư viện', () => {
      expect(
        resolveMediaPath('lumora-media://library/music/music-abc123.mp3', dir, {}, libraries()),
      ).toBe(join(dir, 'music', 'music-abc123.mp3'))
      expect(
        resolveMediaPath('lumora-media://library/memes/meme-1.gif', dir, {}, libraries()),
      ).toBe(join(dir, 'memes', 'meme-1.gif'))
    })

    it('không nhận thư viện lạ', () => {
      expect(
        resolveMediaPath('lumora-media://library/sounds/x.mp3', dir, {}, libraries()),
      ).toBeNull()
      expect(
        resolveMediaPath('lumora-media://library/toString/x.mp3', dir, {}, libraries()),
      ).toBeNull()
    })

    it('chặn truy cập ra ngoài thư viện', () => {
      expect(resolveMediaPath('lumora-media://library/music/..', dir, {}, libraries())).toBeNull()
      expect(
        resolveMediaPath('lumora-media://library/music/%2E%2E%2Fsecret', dir, {}, libraries()),
      ).toBeNull()
      expect(
        resolveMediaPath('lumora-media://library/music/a/b.mp3', dir, {}, libraries()),
      ).toBeNull()
      expect(
        resolveMediaPath('lumora-media://library/music/.hidden', dir, {}, libraries()),
      ).toBeNull()
      expect(resolveMediaPath('lumora-media://library/music', dir, {}, libraries())).toBeNull()
    })

    it('không có danh sách thư viện thì từ chối', () => {
      expect(resolveMediaPath('lumora-media://library/music/x.mp3', dir)).toBeNull()
      expect(resolveMediaPath('lumora-media://library/music/x.mp3', dir, {})).toBeNull()
    })
  })
})

describe('handleMediaRequest', () => {
  it('trả cả file khi không có Range', async () => {
    const res = await handleMediaRequest(new Request(url('a b.lumora', 'seg0-screen.mkv')), dir)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/webm')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
  })

  it('trả một phần file khi có Range (để tua)', async () => {
    const res = await handleMediaRequest(
      new Request(url('a b.lumora', 'seg0-screen.mkv'), { headers: { Range: 'bytes=2-5' } }),
      dir,
    )
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await res.text()).toBe('2345')
  })

  it('trả 416 khi Range vượt file, 404 khi không có file', async () => {
    const bad = await handleMediaRequest(
      new Request(url('a b.lumora', 'seg0-screen.mkv'), { headers: { Range: 'bytes=50-' } }),
      dir,
    )
    expect(bad.status).toBe(416)
    const missing = await handleMediaRequest(new Request(url('a b.lumora', 'nope.mkv')), dir)
    expect(missing.status).toBe(404)
  })

  it('cho phép fetch từ giao diện (CORS) và trả lời preflight', async () => {
    const res = await handleMediaRequest(new Request(url('a b.lumora', 'seg0-screen.mkv')), dir)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-expose-headers')).toContain('Content-Range')
    const preflight = await handleMediaRequest(
      new Request(url('a b.lumora', 'x'), { method: 'OPTIONS' }),
      dir,
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Range')
  })

  it('phát file nhạc từ thư viện chung với đúng Content-Type', async () => {
    const musicDir = join(dir, 'music')
    await mkdir(musicDir)
    await writeFile(join(musicDir, 'music-abc123.mp3'), 'ID3mp3data')
    const res = await handleMediaRequest(
      new Request('lumora-media://library/music/music-abc123.mp3'),
      dir,
      {},
      { music: musicDir },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('ID3mp3data')
    // Không truyền thư viện thì URL này không phục vụ.
    const denied = await handleMediaRequest(
      new Request('lumora-media://library/music/music-abc123.mp3'),
      dir,
    )
    expect(denied.status).toBe(404)
  })

  it('HEAD chỉ trả header', async () => {
    const res = await handleMediaRequest(
      new Request(url('a b.lumora', 'seg0-screen.mkv'), { method: 'HEAD' }),
      dir,
    )
    expect(res.headers.get('content-length')).toBe('10')
    expect(await res.text()).toBe('')
  })
})
