import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

/** Giọng đọc giả: MP3 0.8 giây, âm 330 Hz (tạo một lần khi khởi động máy chủ). */
function speechMp3(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'lumora-tts-'))
  try {
    const file = join(dir, 'speech.mp3')
    execFileSync(ffmpegPath as unknown as string, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=330:duration=0.8',
      '-c:a',
      'libmp3lame',
      file,
    ])
    return readFileSync(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export const MOCK_VOICES = [
  { voice_id: 'voice-anna', name: 'Anna', labels: { gender: 'female' } },
  { voice_id: 'voice-bao', name: 'Bao', labels: { gender: 'male' } },
]

export interface RecordedRequest {
  method: string
  path: string
  headers: IncomingMessage['headers']
  body: Buffer
}

/** Lời nói giả trong 4 giây của dự án mẫu. */
export const MOCK_WORDS = [
  ['Xin', 0.1, 0.4],
  ['chào', 0.45, 0.8],
  ['ừm', 0.9, 1.2],
  ['các', 1.3, 1.5],
  ['bạn.', 1.55, 1.9],
  ['Hôm', 3.0, 3.2],
  ['nay', 3.25, 3.5],
  ['mình', 3.55, 3.7],
  ['demo.', 3.75, 3.95],
] as const

function anthropicMessage(json: unknown) {
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(json) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

/**
 * Máy chủ HTTP giả lập ElevenLabs và Anthropic để test toàn bộ luồng AI mà không cần key thật
 * hay mạng internet. Ghi lại mọi request để test kiểm tra app gửi đúng.
 */
export async function startMockAi(): Promise<{
  url: string
  requests: RecordedRequest[]
  close(): Promise<void>
}> {
  const requests: RecordedRequest[] = []
  const mp3 = speechMp3()
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const path = (req.url ?? '').split('?')[0]!
      requests.push({ method: req.method ?? '', path, headers: req.headers, body })
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(data))
      }
      if (path === '/v1/user') return json(200, { subscription: {} })
      if (path === '/v1/models')
        return json(200, { data: [], has_more: false, first_id: null, last_id: null })
      if (path === '/v1/voices') return json(200, { voices: MOCK_VOICES })
      if (path.startsWith('/v1/text-to-speech/')) {
        if (!req.headers['xi-api-key']) return json(401, { detail: { message: 'missing key' } })
        res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': mp3.length })
        return res.end(mp3)
      }
      if (path === '/v1/speech-to-text') {
        if (!req.headers['xi-api-key']) return json(401, { detail: { message: 'missing key' } })
        return json(200, {
          language_code: 'vi',
          text: MOCK_WORDS.map((w) => w[0]).join(' '),
          words: MOCK_WORDS.flatMap(([text, start, end]) => [
            { text, start, end, type: 'word' },
            { text: ' ', start: end, end: end + 0.02, type: 'spacing' },
          ]),
        })
      }
      if (path === '/v1/messages') {
        const request = JSON.parse(body.toString('utf8'))
        const system = String(request.system)
        if (system.includes('cleaning up')) {
          return json(
            200,
            anthropicMessage({ cuts: [{ from: 2, to: 2, kind: 'filler', reason: 'Từ đệm' }] }),
          )
        }
        if (system.includes('metadata')) {
          return json(
            200,
            anthropicMessage({
              titles: ['Demo Lumora', 'Lumora nhanh', 'Quay màn hình'],
              description: 'Video demo.',
              hashtags: ['#lumora', '#demo'],
              chapters: [
                { start_seconds: 0, title: 'Chào hỏi' },
                { start_seconds: 3, title: 'Demo' },
              ],
            }),
          )
        }
        if (system.includes('You edit the subtitle lines')) {
          const input = JSON.parse(request.messages[0].content).lines as {
            id: string
            text: string
          }[]
          return json(
            200,
            anthropicMessage({
              lines: input.map((l) => ({ id: l.id, text: l.text.replace(/ ừm/g, '') })),
            }),
          )
        }
        if (system.includes('zoom-in regions')) {
          return json(
            200,
            anthropicMessage({
              zooms: [
                {
                  id: '',
                  start_seconds: 0.5,
                  end_seconds: 3.5,
                  scale: 3,
                  mode: 'follow',
                  x: 0.5,
                  y: 0.5,
                },
              ],
            }),
          )
        }
        const input = JSON.parse(request.messages[0].content).lines as {
          id: string
          text: string
        }[]
        return json(
          200,
          anthropicMessage({ lines: input.map((l) => ({ id: l.id, text: `[EN] ${l.text}` })) }),
        )
      }
      json(404, { error: 'not found' })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
