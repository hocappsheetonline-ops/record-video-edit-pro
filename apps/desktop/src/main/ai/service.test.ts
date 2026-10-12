import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '@lumora/core'
import { runFfmpeg } from '../ffmpeg/runner'
import type { FetchLike } from '../key-validation'
import { AiService, MissingKeyError } from './service'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-ai-'))
  const r = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=300:duration=3',
    '-c:a',
    'libopus',
    join(dir, 'seg0-mic.webm'),
  ])
  if (r.code !== 0) throw new Error(r.stderr)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const project: Project = {
  version: 1,
  id: 'p',
  name: 'Demo',
  createdAt: '2026-01-01T00:00:00.000Z',
  source: { kind: 'display', name: 'A', captureRect: null, scaleFactor: 1 },
  engine: 'ffmpeg',
  encoder: null,
  fps: 30,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 0,
      endedAt: 3000,
      tracks: { mic: { file: 'seg0-mic.webm', startedAt: 0 } },
    },
  ],
  hasEvents: false,
  inputMode: null,
  durationMs: 3000,
}

const STT = {
  language_code: 'vi',
  words: [
    { text: 'Xin', start: 0.0, end: 0.3, type: 'word' },
    { text: ' ', start: 0.3, end: 0.35, type: 'spacing' },
    { text: 'chào', start: 0.35, end: 0.7, type: 'word' },
    { text: 'ừm', start: 0.8, end: 1.0, type: 'word' },
    { text: 'chào', start: 1.1, end: 1.4, type: 'word' },
    { text: 'các', start: 1.5, end: 1.7, type: 'word' },
    { text: 'bạn.', start: 2.95, end: 3.0, type: 'word' },
  ],
}

function message(json: unknown) {
  return new Response(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(json) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** Máy chủ giả: trả lời như ElevenLabs và Anthropic, đồng thời ghi lại request để kiểm tra. */
function fakeApis() {
  const calls: { url: string; headers: Headers; body: unknown }[] = []
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const headers = new Headers(init?.headers)
    if (url.endsWith('/v1/speech-to-text')) {
      const form = init!.body as FormData
      calls.push({
        url,
        headers,
        body: Object.fromEntries(
          [...form.entries()].map(([k, v]) => [
            k,
            typeof v === 'string' ? v : `file:${(v as File).size}`,
          ]),
        ),
      })
      return new Response(JSON.stringify(STT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/v1/messages')) {
      const body = JSON.parse(String(init!.body))
      calls.push({ url, headers, body })
      const system = String(body.system)
      if (system.includes('cleaning up'))
        return message({ cuts: [{ from: 1, to: 2, kind: 'repeat', reason: 'Nói lặp' }] })
      if (system.includes('editing assistant'))
        return message({
          commands: [
            { kind: 'cutSilences' },
            { kind: 'speed', factor: 1.5 },
            { kind: 'filter', preset: 'bogus' },
            { kind: 'aspect', aspect: '9:16' },
          ],
        })
      if (system.includes('metadata')) {
        return message({
          titles: ['A', 'B', 'C'],
          description: 'Mô tả',
          hashtags: ['#lumora'],
          chapters: [{ start_seconds: 0, title: 'Mở đầu' }],
        })
      }
      return message({ lines: [{ id: 'l0', text: 'Hello everyone.' }] })
    }
    return new Response('not found', { status: 404 })
  }
  return { calls, fetchImpl }
}

function service(
  fetchImpl: FetchLike,
  keys: Record<string, string> = { elevenlabs: 'el-key-123', anthropic: 'sk-ant-test' },
) {
  return new AiService({ getKey: async (k) => keys[k], run: runFfmpeg, fetchImpl })
}

describe('AiService', () => {
  it('nhận dạng giọng nói: gửi đúng tham số, lưu transcript, không để lại file tạm', async () => {
    const { calls, fetchImpl } = fakeApis()
    const transcript = await service(fetchImpl).transcribe(project, dir, 'vi')
    expect(transcript.words.map((w) => w.text)).toEqual([
      'Xin',
      'chào',
      'ừm',
      'chào',
      'các',
      'bạn.',
    ])
    expect(transcript.words[1]).toEqual({ text: 'chào', start: 350, end: 700 })
    const call = calls[0]!
    expect(call.headers.get('xi-api-key')).toBe('el-key-123')
    expect(call.body).toMatchObject({
      model_id: 'scribe_v2',
      timestamps_granularity: 'word',
      language_code: 'vi',
    })
    expect((call.body as Record<string, string>).file).toMatch(/^file:\d+/)
    const saved = JSON.parse(await readFile(join(dir, 'transcript.json'), 'utf8'))
    expect(saved.words).toHaveLength(6)
    expect((await readdir(dir)).filter((f) => f.startsWith('.'))).toEqual([])
  }, 30_000)

  it('báo thiếu key', async () => {
    const { fetchImpl } = fakeApis()
    await expect(service(fetchImpl, {}).transcribe(project, dir)).rejects.toBeInstanceOf(
      MissingKeyError,
    )
  })

  it('gợi ý cắt: kết hợp Claude (nói lặp), từ đệm và khoảng lặng; gọi Claude đúng cách', async () => {
    const { calls, fetchImpl } = fakeApis()
    const ai = service(fetchImpl)
    await ai.transcribe(project, dir)
    const suggestions = await ai.suggestCuts(dir)
    expect(suggestions.map((s) => [s.kind, s.start, s.end])).toEqual([
      ['repeat', 350, 1100],
      ['silence', 1875, 2775],
    ])
    expect(suggestions[0]!.text).toBe('chào ừm')
    const claude = calls.find((c) => c.url.includes('/v1/messages'))!
    expect(claude.url).toContain('beta=true')
    expect(claude.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(claude.headers.get('x-api-key')).toBe('sk-ant-test')
    expect(claude.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema' } },
    })
    expect(JSON.stringify(claude.body)).toContain('[2]ừm')
  }, 30_000)

  it('tóm tắt: tiêu đề, mô tả, chương (ms) và lưu ai.json', async () => {
    const { fetchImpl } = fakeApis()
    const ai = service(fetchImpl)
    await ai.transcribe(project, dir)
    const summary = await ai.summarize(dir)
    expect(summary).toEqual({
      titles: ['A', 'B', 'C'],
      description: 'Mô tả',
      hashtags: ['#lumora'],
      chapters: [{ start: 0, title: 'Mở đầu' }],
    })
    expect(JSON.parse(await readFile(join(dir, 'ai.json'), 'utf8')).titles).toHaveLength(3)
  }, 30_000)

  it('dịch: giữ id, dòng thiếu thì giữ nguyên', async () => {
    const { fetchImpl } = fakeApis()
    const lines = await service(fetchImpl).translate(
      [
        { id: 'l0', text: 'Xin chào.' },
        { id: 'l1', text: 'Lumora' },
      ],
      'en',
    )
    expect(lines).toEqual([
      { id: 'l0', text: 'Hello everyone.' },
      { id: 'l1', text: 'Lumora' },
    ])
  })

  it('chưa có transcript thì báo lỗi', async () => {
    const { fetchImpl } = fakeApis()
    await expect(service(fetchImpl).suggestCuts(dir)).rejects.toThrow('no_transcript')
  })

  it('báo lỗi rõ ràng khi ElevenLabs từ chối', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ detail: { message: 'Invalid API key' } }), { status: 401 })
    await expect(service(fetchImpl).transcribe(project, dir)).rejects.toThrow(
      'ElevenLabs 401: Invalid API key',
    )
  }, 30_000)
})

describe('giọng đọc AI (meme sound)', () => {
  let mock: Awaited<ReturnType<typeof import('../../../e2e/mock-ai').startMockAi>>
  beforeEach(async () => {
    const { startMockAi } = await import('../../../e2e/mock-ai')
    mock = await startMockAi()
    process.env.LUMORA_ELEVENLABS_BASE_URL = mock.url
  })
  afterEach(async () => {
    delete process.env.LUMORA_ELEVENLABS_BASE_URL
    await mock.close()
  })

  it('đọc câu thành file trong dự án, lưu đệm dùng chung; đọc lại không gọi API', async () => {
    const sounds = join(dir, 'sounds')
    const ai = new AiService({ getKey: async () => 'el-key', run: runFfmpeg, soundsDir: sounds })
    expect(await ai.voices()).toEqual([
      { id: 'voice-anna', name: 'Anna' },
      { id: 'voice-bao', name: 'Bao' },
    ])
    const asset = await ai.speak(dir, '  Ối dồi ôi  ', 'voice-anna')
    expect(asset.file).toMatch(/^asset-tts-[0-9a-f]{16}\.mp3$/)
    expect(asset.name).toBe('Ối dồi ôi')
    expect(asset.durationMs).toBeGreaterThan(600)
    const tts = mock.requests.filter((r) => r.path.startsWith('/v1/text-to-speech/'))
    expect(tts).toHaveLength(1)
    expect(tts[0]!.path).toBe('/v1/text-to-speech/voice-anna')
    expect(JSON.parse(tts[0]!.body.toString('utf8'))).toEqual({
      text: 'Ối dồi ôi',
      model_id: 'eleven_multilingual_v2',
    })
    expect(await readdir(sounds)).toHaveLength(1)

    // Dự án khác, cùng câu: lấy từ bộ nhớ đệm.
    const other = await mkdtemp(join(tmpdir(), 'lumora-ai-other-'))
    const again = await ai.speak(other, 'Ối dồi ôi', 'voice-anna')
    expect(again.file).toBe(asset.file)
    expect(mock.requests.filter((r) => r.path.startsWith('/v1/text-to-speech/'))).toHaveLength(1)
    await rm(other, { recursive: true, force: true })
  })

  it('tốc độ / độ ổn định: gửi kèm cài đặt giọng (đã kẹp), lưu thành file riêng', async () => {
    const ai = new AiService({ getKey: async () => 'el-key', run: runFfmpeg })
    const plain = await ai.speak(dir, 'Xin chào', 'voice-anna')
    const fast = await ai.speak(dir, 'Xin chào', 'voice-anna', { speed: 3, stability: 0.2 })
    expect(fast.file).not.toBe(plain.file)
    const tts = mock.requests.filter((r) => r.path.startsWith('/v1/text-to-speech/'))
    expect(tts).toHaveLength(2)
    expect(JSON.parse(tts[1]!.body.toString('utf8')).voice_settings).toEqual({
      stability: 0.2,
      similarity_boost: 0.75,
      speed: 1.2,
    })
    // Tùy chọn mặc định: cùng file với lần đọc thường.
    expect((await ai.speak(dir, 'Xin chào', 'voice-anna', { speed: 1 })).file).toBe(plain.file)
  })

  it('câu rỗng, giọng lạ, thiếu key: báo lỗi', async () => {
    const ai = new AiService({ getKey: async () => 'el-key', run: runFfmpeg })
    await expect(ai.speak(dir, '   ', 'voice-anna')).rejects.toThrow('speech_empty')
    await expect(ai.speak(dir, 'hi', '../x')).rejects.toThrow('voice_invalid')
    const noKey = new AiService({ getKey: async () => undefined, run: runFfmpeg })
    await expect(noKey.speak(dir, 'hi', 'voice-anna')).rejects.toBeInstanceOf(MissingKeyError)
  })
})

describe('AiService.plan (trợ lý AI)', () => {
  it('gửi yêu cầu cho Claude kèm ngữ cảnh, lọc lệnh sai; yêu cầu rỗng không gọi mạng', async () => {
    const { calls, fetchImpl } = fakeApis()
    const ai = service(fetchImpl)
    const ctx = { language: 'vi', durationMs: 60_000, hasTranscript: true }
    expect(await ai.plan('   ', ctx)).toEqual([])
    expect(calls).toHaveLength(0)
    expect(await ai.plan('cắt im lặng, nhanh 1.5x, dọc', ctx)).toEqual([
      { kind: 'cutSilences' },
      { kind: 'speed', factor: 1.5 },
      { kind: 'aspect', aspect: '9:16' },
    ])
    const body = calls[0]!.body as { system: string; messages: { content: string }[] }
    expect(body.system).toContain('duration 60 s')
    expect(body.messages[0]!.content).toBe('cắt im lặng, nhanh 1.5x, dọc')
    await expect(service(fetchImpl, {}).plan('x', ctx)).rejects.toThrow()
  })
})

describe('AI cục bộ (Ollama)', () => {
  function ollamaFetch(models: string[] = ['qwen2.5:7b', 'llama3.2']) {
    const calls: { url: string; body?: unknown }[] = []
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input)
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/api/tags'))
        return new Response(JSON.stringify({ models: models.map((name) => ({ name })) }), {
          status: 200,
        })
      if (url.endsWith('/api/chat')) {
        const body = JSON.parse(String(init!.body)) as {
          model: string
          messages: { content: string }[]
        }
        if (!models.includes(body.model))
          return new Response(
            JSON.stringify({ error: `model '${body.model}' not found, try pulling it first` }),
            { status: 404 },
          )
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({ commands: [{ kind: 'captions' }] }),
            },
          }),
          { status: 200 },
        )
      }
      return new Response('not found', { status: 404 })
    }
    return { calls, fetchImpl }
  }
  const local = (model = 'qwen2.5:7b', enabled = true) => ({
    enabled,
    baseUrl: 'http://127.0.0.1:11434',
    model,
  })

  it('bật AI cục bộ: trợ lý đi qua Ollama với schema, không cần key Claude', async () => {
    const { calls, fetchImpl } = ollamaFetch()
    const ai = new AiService({
      getKey: async () => undefined,
      getLocalAi: async () => local(),
      run: runFfmpeg,
      fetchImpl,
    })
    const ctx = { language: 'vi', durationMs: 1000, hasTranscript: false }
    expect(await ai.plan('thêm phụ đề', ctx)).toEqual([{ kind: 'captions' }])
    const body = calls[0]!.body as { model: string; format: unknown; messages: { role: string }[] }
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/chat')
    expect(body.model).toBe('qwen2.5:7b')
    expect(body.format).toMatchObject({ type: 'object' })
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(await ai.listLocalModels('http://127.0.0.1:11434')).toEqual(['llama3.2', 'qwen2.5:7b'])
  })

  it('model chưa tải hoặc Ollama không chạy: báo mã lỗi rõ; tắt AI cục bộ thì về Claude', async () => {
    const { fetchImpl } = ollamaFetch()
    const ctx = { language: 'vi', durationMs: 1000, hasTranscript: false }
    await expect(
      new AiService({
        getKey: async () => undefined,
        getLocalAi: async () => local('gemma'),
        run: runFfmpeg,
        fetchImpl,
      }).plan('x', ctx),
    ).rejects.toThrow('ollama_model')
    const offline: FetchLike = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(
      new AiService({
        getKey: async () => undefined,
        getLocalAi: async () => local(),
        run: runFfmpeg,
        fetchImpl: offline,
      }).plan('x', ctx),
    ).rejects.toThrow('ollama_offline')
    await expect(
      new AiService({
        getKey: async () => undefined,
        getLocalAi: async () => local('q', false),
        run: runFfmpeg,
        fetchImpl,
      }).plan('x', ctx),
    ).rejects.toThrow('missing_key:anthropic')
  })
})

describe('pullOllamaModel', () => {
  it('đọc tiến độ NDJSON từng dòng, báo lỗi model không có', async () => {
    const { pullOllamaModel } = await import('./ollama')
    const lines = [
      JSON.stringify({ status: 'pulling manifest' }),
      JSON.stringify({ status: 'pulling abc', total: 100, completed: 40 }),
      JSON.stringify({ status: 'pulling abc', total: 100, completed: 100 }),
      JSON.stringify({ status: 'success' }),
    ]
    const stream = new ReadableStream({
      start(controller) {
        const text = lines.join('\n')
        controller.enqueue(new TextEncoder().encode(text.slice(0, 30)))
        controller.enqueue(new TextEncoder().encode(text.slice(30)))
        controller.close()
      },
    })
    const fetchImpl: FetchLike = async (_input, init) => {
      expect(JSON.parse(String(init!.body))).toEqual({ name: 'llama3.2', stream: true })
      return new Response(stream, { status: 200 })
    }
    const seen: { status: string; completed: number; total: number }[] = []
    await pullOllamaModel('http://127.0.0.1:11434', 'llama3.2', (p) => seen.push(p), fetchImpl)
    expect(seen.map((p) => [p.status, p.completed, p.total])).toEqual([
      ['pulling manifest', 0, 0],
      ['pulling abc', 40, 100],
      ['pulling abc', 100, 100],
      ['success', 0, 0],
    ])
    const missing: FetchLike = async () =>
      new Response(JSON.stringify({ error: 'pull model manifest: file does not exist' }), {
        status: 200,
      })
    await expect(
      pullOllamaModel('http://127.0.0.1:11434', 'nope', () => {}, missing),
    ).rejects.toThrow('ollama_model')
    await expect(
      pullOllamaModel('http://127.0.0.1:11434', 'bad name!', () => {}, missing),
    ).rejects.toThrow('ollama_model')
  })
})
