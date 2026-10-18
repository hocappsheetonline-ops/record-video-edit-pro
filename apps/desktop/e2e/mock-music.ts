import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

/** Bài nhạc giả: MP3 3 giây, âm 220 Hz. */
function musicMp3(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'lumora-music-'))
  try {
    const file = join(dir, 'track.mp3')
    execFileSync(ffmpegPath as unknown as string, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:duration=3',
      '-c:a',
      'libmp3lame',
      file,
    ])
    return readFileSync(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export const JAMENDO_KEY = 'mockjam1'

/**
 * Máy chủ giả Jamendo API v3.0: `/v3.0/tracks/` trả JSON đúng cấu trúc thật (headers + results,
 * HTTP 200 kể cả khi client_id sai, như Jamendo), `/download/:id.mp3` trả file MP3 thật. Có một
 * bài NC (cấm thương mại) và một bài không cho tải để test lọc giấy phép.
 */
export async function startMockMusic(): Promise<{
  url: string
  requests: { path: string; query: URLSearchParams }[]
  close(): Promise<void>
}> {
  const requests: { path: string; query: URLSearchParams }[] = []
  const mp3 = musicMp3()
  let base = ''
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push({ path: url.pathname, query: url.searchParams })
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (url.pathname.startsWith('/download/')) {
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': mp3.length })
      return res.end(mp3)
    }
    if (url.pathname === '/v3.0/tracks/') {
      if (url.searchParams.get('client_id') !== JAMENDO_KEY)
        return json(200, {
          headers: {
            status: 'failed',
            code: 2,
            error_message: 'Your credential is not authorized.',
          },
          results: [],
        })
      const tags = url.searchParams.get('fuzzytags') ?? ''
      const track = (id: number, name: string, license: string, allowed = true) => ({
        id,
        name,
        duration: 180,
        artist_name: 'Mock Artist',
        audio: `${base}/download/${id}.mp3`,
        audiodownload: `${base}/download/${id}.mp3`,
        audiodownload_allowed: allowed,
        shareurl: `https://www.jamendo.com/track/${id}`,
        license_ccurl: license,
        musicinfo: { tags: { genres: ['pop'], vartags: tags.split('+').filter(Boolean) } },
      })
      return json(200, {
        headers: { status: 'success', code: 0, results_count: 3 },
        results: [
          track(1001, 'Sunny Mood', 'http://creativecommons.org/licenses/by-nc-sa/3.0/'),
          track(1002, 'Bright Day', 'http://creativecommons.org/licenses/by/3.0/'),
          track(1003, 'No Download', 'http://creativecommons.org/licenses/by/3.0/', false),
          track(1004, 'Second Choice', 'http://creativecommons.org/licenses/by-sa/3.0/'),
        ],
      })
    }
    json(404, { error: 'not found' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('mock music server')
  base = `http://127.0.0.1:${address.port}`
  return {
    url: base,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
