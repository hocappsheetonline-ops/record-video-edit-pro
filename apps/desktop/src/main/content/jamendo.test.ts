import { readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JAMENDO_KEY, startMockMusic } from '../../../e2e/mock-music'
import { runFfmpeg } from '../ffmpeg/runner'
import { validateJamendoKey } from '../key-validation'
import { MusicLibrary } from '../projects/music'
import { moodTags, rankByDuration, searchJamendo, type MusicCandidate } from './jamendo'
import { MusicFinder } from './music-finder'

let mock: Awaited<ReturnType<typeof startMockMusic>>
beforeAll(async () => {
  mock = await startMockMusic()
  process.env.LUMORA_JAMENDO_BASE_URL = mock.url
})
afterAll(async () => {
  delete process.env.LUMORA_JAMENDO_BASE_URL
  await mock.close()
})

let work: string
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'lumora-jamendo-'))
})
afterEach(() => rm(work, { recursive: true, force: true }))

describe('Jamendo', () => {
  it('moodTags: từ tâm trạng thành thẻ Jamendo, tối đa 4, không trùng', () => {
    expect(moodTags('upbeat corporate')).toEqual(['happy', 'corporate', 'upbeat'])
    expect(moodTags('calm lofi beats')).toEqual(['relaxing', 'lounge', 'calm', 'lofi'])
    expect(moodTags('')).toEqual([])
  })

  it('tìm bài: gửi đúng tham số (thẻ, nhịp, không lời, cấm NC), lọc bài NC / không cho tải, ghi nguồn', async () => {
    const items = await searchJamendo(JAMENDO_KEY, {
      mood: 'upbeat corporate',
      tempo: 'fast',
      durationMs: 60_000,
    })
    const q = mock.requests.at(-1)!.query
    expect(q.get('fuzzytags')).toBe('happy+corporate+upbeat')
    expect(q.get('speed')).toBe('high+veryhigh')
    expect(q.get('vocalinstrumental')).toBe('instrumental')
    expect(q.get('ccnc')).toBe('false')
    expect(q.get('include')).toBe('musicinfo+licenses')
    // Bài NC và bài không cho tải bị loại; còn 2 bài CC BY / BY-SA.
    expect(items.map((i) => i.name)).toEqual(['Bright Day', 'Second Choice'])
    expect(items[0]).toMatchObject({
      id: '1002',
      artist: 'Mock Artist',
      durationMs: 180_000,
      license: 'CC BY 3.0',
      credit:
        '"Bright Day" by Mock Artist — CC BY 3.0 (Jamendo, https://www.jamendo.com/track/1002)',
    })
    expect(items[1]!.license).toBe('CC BY-SA 3.0')
  })

  it('client_id sai: Jamendo trả 200 kèm status failed → key_invalid; kiểm tra key đọc JSON', async () => {
    await expect(
      searchJamendo('wrong', { mood: 'x', tempo: 'medium', durationMs: 0 }),
    ).rejects.toThrow('key_invalid')
    expect(await validateJamendoKey('wrong')).toEqual({ ok: false, reason: 'invalid' })
    expect(await validateJamendoKey(JAMENDO_KEY)).toEqual({ ok: true })
  })

  it('rankByDuration: bài ngắn hơn 80% video (tối đa 2 phút) xuống dưới', () => {
    const c = (id: string, s: number) => ({ id, durationMs: s * 1000 }) as MusicCandidate
    expect(rankByDuration([c('a', 30), c('b', 100), c('c', 50)], 120_000).map((x) => x.id)).toEqual(
      ['b', 'a', 'c'],
    )
    expect(rankByDuration([c('a', 30), c('b', 100)], 0).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('MusicFinder', () => {
  function finder(keys: Record<string, string | undefined> = { jamendo: JAMENDO_KEY }) {
    const library = new MusicLibrary(join(work, 'music'), runFfmpeg)
    const found = new MusicFinder({
      getKey: async (name) => keys[name],
      library,
      tmpDir: join(work, 'cache'),
    })
    return { found, library }
  }

  it('tải bài hợp nhất vào kho nhạc (tên + ghi nguồn + mã), lần sau dùng lại không tải; đổi bài cho dự án kế', async () => {
    const { found, library } = finder()
    const track = await found.find({ mood: 'upbeat', tempo: 'fast', durationMs: 60_000 })
    expect(track).toMatchObject({
      name: 'Bright Day – Mock Artist',
      source: 'jamendo',
      origin: { source: 'jamendo', id: '1002' },
    })
    expect(track.credit).toContain('CC BY 3.0')
    expect(track.durationMs).toBeGreaterThan(2500)
    expect(readdirSync(join(work, 'cache'))).toEqual([])
    expect((await library.list()).map((t) => t.file)).toEqual([track.file])
    // Video tiếp theo cùng tâm trạng: ưu tiên bài chưa dùng (không gọi API lại nhờ cache).
    const before = mock.requests.length
    const next = await found.find({ mood: 'upbeat', tempo: 'fast', durationMs: 60_000 })
    expect(next.origin?.id).toBe('1004')
    expect(mock.requests.filter((r) => r.path === '/v3.0/tracks/').length).toBe(
      mock.requests.slice(0, before).filter((r) => r.path === '/v3.0/tracks/').length,
    )
    expect(await library.list()).toHaveLength(2)
    // Hết bài mới: quay lại bài đầu đã có trong kho, không tải lại.
    const again = await found.find({ mood: 'upbeat', tempo: 'fast', durationMs: 60_000 })
    expect(again.file).toBe(track.file)
    expect(await library.list()).toHaveLength(2)
  }, 60_000)

  it('chưa nhập key thì báo key_missing', async () => {
    await expect(
      finder({}).found.find({ mood: 'x', tempo: 'medium', durationMs: 0 }),
    ).rejects.toThrow('key_missing')
  })
})
