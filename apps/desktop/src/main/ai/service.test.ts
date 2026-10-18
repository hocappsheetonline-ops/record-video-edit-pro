import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@lumora/core'
import { runFfmpeg } from '../ffmpeg/runner'
import type { FetchLike } from '../key-validation'
import { AiService, MissingKeyError, type LocalSpeechLike } from './service'

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
      // Lời nhắc hệ thống có thể là chuỗi hoặc các khối (phần tĩnh được cache).
      const system = Array.isArray(body.system)
        ? body.system.map((b: { text: string }) => b.text).join('\n\n')
        : String(body.system)
      if (system.includes('best moments'))
        return message({
          segments: [
            { start_seconds: 0.1, end_seconds: 1, hook: 'Quá ngắn', title: 'bỏ' },
            { start_seconds: 0, end_seconds: 20, hook: 'Mẹo hay', title: 'Mẹo 1' },
          ],
        })
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
      if (system.includes('AI director'))
        return message({
          summary: 'Cắt khoảng lặng và thêm phụ đề',
          questions: [],
          commands: [{ kind: 'cutSilences' }, { kind: 'captions' }, { kind: 'bogus' }],
        })
      if (system.includes('metadata')) {
        return message({
          titles: ['A', 'B', 'C'],
          description: 'Mô tả',
          hashtags: ['#lumora'],
          chapters: [{ start_seconds: 0, title: 'Mở đầu' }],
        })
      }
      if (system.includes('You edit the subtitle lines')) {
        const input = JSON.parse(String(body.messages[0].content)) as {
          instruction: string
          lines: { id: string; text: string }[]
        }
        return message({
          lines: input.lines.map((l) => ({ id: l.id, text: `${input.instruction}: ${l.text}` })),
        })
      }
      if (system.includes('zoom-in regions')) {
        return message({
          zooms: [
            {
              id: 'a',
              start_seconds: 0,
              end_seconds: 2,
              scale: 2.5,
              mode: 'follow',
              x: 0.5,
              y: 0.5,
            },
            { id: '', start_seconds: 2.5, end_seconds: 9, scale: 7, mode: 'fixed', x: 0.2, y: 0.9 },
          ],
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

  it('sửa phụ đề bằng Claude: gửi yêu cầu (rỗng = sửa chính tả), giữ id và thứ tự', async () => {
    const { calls, fetchImpl } = fakeApis()
    const ai = service(fetchImpl)
    const lines = [
      { id: 'l0', text: 'xin chào' },
      { id: 'l1', text: 'lumora' },
    ]
    expect(await ai.editCaptions(lines, 'Viết hoa', 'vi')).toEqual([
      { id: 'l0', text: 'Viết hoa: xin chào' },
      { id: 'l1', text: 'Viết hoa: lumora' },
    ])
    const fixed = await ai.editCaptions(lines, '   ', 'vi')
    expect(fixed[0]!.text).toMatch(/^Fix spelling/)
    expect(String(calls[0]!.body && (calls[0]!.body as { system: string }).system)).toContain(
      'Vietnamese',
    )
    expect(await ai.editCaptions([], 'x', 'vi')).toEqual([])
  })

  it('chỉnh zoom bằng Claude: gửi zoom hiện có, click và lời nói; kết quả được kẹp và giữ id', async () => {
    const { calls, fetchImpl } = fakeApis()
    const ai = service(fetchImpl)
    await ai.transcribe(project, dir)
    const existing = [
      { id: 'a', start: 100, end: 1500, scale: 2, mode: 'follow' as const, x: 0.5, y: 0.5 },
    ]
    const zooms = await ai.planZooms(dir, {
      instruction: 'zoom theo lời nói',
      zooms: existing,
      durationMs: 3000,
      clicks: [400, 1200],
    })
    expect(zooms).toEqual([
      { id: 'a', start: 0, end: 2000, scale: 2.5, mode: 'follow', x: 0.5, y: 0.5 },
      { id: expect.any(String), start: 2500, end: 3000, scale: 4, mode: 'fixed', x: 0.2, y: 0.9 },
    ])
    expect(zooms[1]!.id).not.toBe('a')
    const claude = calls.filter((c) => c.url.includes('/v1/messages')).at(-1)!
    const user = String((claude.body as { messages: { content: string }[] }).messages[0]!.content)
    expect(user).toContain('Instruction: zoom theo lời nói')
    expect(user).toContain('"id":"a","start_seconds":0.1,"end_seconds":1.5')
    expect(user).toContain('Mouse clicks (seconds): [0.4,1.2]')
    expect(user).toContain('[0:00] Xin chào')
    await expect(
      ai.planZooms(dir, { instruction: ' ', zooms: [], durationMs: 1, clicks: [] }),
    ).rejects.toThrow('instruction_empty')
  }, 30_000)

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

describe('AiService.direct (đạo diễn AI)', () => {
  const context = {
    language: 'vi',
    durationMs: 90_000,
    hasTranscript: true,
    hasCursor: false,
    musicTracks: ['Lofi Chill Beats', 'Epic Trailer'],
    projects: ['Demo tuần trước'],
    memory: 'Quy tắc người dùng:\n- luôn dùng phụ đề tiktok',
    history: [
      { role: 'user' as const, text: 'thêm nhạc lofi', at: 1 },
      { role: 'ai' as const, text: 'Đã thêm nhạc Lofi Chill Beats.', at: 2 },
    ],
  }

  it('yêu cầu rỗng: kế hoạch trống, không gọi mạng', async () => {
    const { calls, fetchImpl } = fakeApis()
    expect(await service(fetchImpl).direct('   ', context)).toEqual({
      summary: '',
      questions: [],
      commands: [],
    })
    expect(calls).toHaveLength(0)
  })

  it('gửi ngữ cảnh (thói quen, kho nhạc, hội thoại) trong lời nhắc hệ thống; lọc lệnh sai', async () => {
    const { calls, fetchImpl } = fakeApis()
    const plan = await service(fetchImpl).direct('dọn video rồi thêm phụ đề', context)
    expect(plan).toEqual({
      summary: 'Cắt khoảng lặng và thêm phụ đề',
      questions: [],
      commands: [{ kind: 'cutSilences' }, { kind: 'captions' }],
    })
    expect(calls).toHaveLength(1)
    const body = calls[0]!.body as {
      system: { type: string; text: string; cache_control?: { type: string } }[]
      messages: { content: string }[]
      output_config: { effort: string; format: { schema: { required: string[] } } }
    }
    expect(body.messages[0]!.content).toBe('dọn video rồi thêm phụ đề')
    // Hai khối: phần tĩnh (vai trò, lệnh, sổ tay) có cache_control; phần động là ngữ cảnh video.
    expect(body.system).toHaveLength(2)
    expect(body.system[0]!.cache_control).toEqual({ type: 'ephemeral' })
    expect(body.system[0]!.text).toContain('AI director')
    expect(body.system[1]!.cache_control).toBeUndefined()
    const dynamic = body.system[1]!.text
    expect(dynamic).toContain('duration 90 s')
    expect(dynamic).toContain('luôn dùng phụ đề tiktok')
    expect(dynamic).toContain('Lofi Chill Beats')
    expect(dynamic).toContain('Director: Đã thêm nhạc Lofi Chill Beats.')
    expect(body.output_config.effort).toBe('medium')
    expect(body.output_config.format.schema.required).toEqual(['summary', 'questions', 'commands'])
  })

  it('cắt gọn ngữ cảnh quá dài: 50 tên bài, 8 lượt hội thoại, bộ nhớ 2000 ký tự', async () => {
    const { calls, fetchImpl } = fakeApis()
    await service(fetchImpl).direct('x', {
      ...context,
      musicTracks: Array.from({ length: 60 }, (_, i) => `Track ${i} ${'y'.repeat(100)}`),
      memory: 'm'.repeat(3000),
      history: Array.from({ length: 12 }, (_, i) => ({
        role: 'user' as const,
        text: `turn ${i} ${'z'.repeat(600)}`,
        at: i,
      })),
    })
    const system = (calls[0]!.body as { system: { text: string }[] }).system[1]!.text
    expect(system).toContain('Track 49')
    expect(system).not.toContain('Track 50')
    expect(system).not.toContain('y'.repeat(81))
    expect(system).toContain('m'.repeat(2000))
    expect(system).not.toContain('m'.repeat(2001))
    expect(system).toContain('turn 4 ')
    expect(system).not.toContain('turn 3 ')
    expect(system).not.toContain('z'.repeat(500))
    await expect(service(fetchImpl, {}).direct('x', context)).rejects.toThrow()
  })
})

describe('AiService.highlights (chọn đoạn hay để tách shorts)', () => {
  it('gửi lời thoại có mốc, effort thấp; bỏ đoạn quá ngắn; chưa có lời thoại thì báo no_transcript', async () => {
    const { calls, fetchImpl } = fakeApis()
    const ai = service(fetchImpl)
    await expect(ai.highlights(dir, 3)).rejects.toThrow('no_transcript')
    await ai.transcribe(project, dir)
    const segments = await ai.highlights(dir, 3)
    expect(segments).toEqual([{ start: 0, end: 20_000, hook: 'Mẹo hay', title: 'Mẹo 1' }])
    const body = calls.at(-1)!.body as {
      system: string
      messages: { content: string }[]
      output_config: { effort: string }
    }
    expect(body.system).toContain('best moments')
    expect(body.messages[0]!.content).toMatch(/^\[0:00\]/)
    expect(body.output_config.effort).toBe('low')
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

  it('bật AI cục bộ: sửa phụ đề và chỉnh zoom cũng đi qua Ollama, không cần key Claude', async () => {
    const { calls, fetchImpl } = ollamaFetch()
    const ai = new AiService({
      getKey: async () => undefined,
      getLocalAi: async () => local(),
      run: runFfmpeg,
      fetchImpl,
    })
    const lines = [{ id: 'l0', text: 'xin chào' }]
    // Máy chủ giả trả JSON không có "lines": giữ nguyên nội dung, nhưng phải đã hỏi Ollama.
    expect(await ai.editCaptions(lines, 'viết hoa', 'vi')).toEqual(lines)
    expect(
      await ai.planZooms(dir, { instruction: 'zoom 2x', zooms: [], durationMs: 1000, clicks: [] }),
    ).toEqual([])
    const chats = calls.filter((c) => c.url.endsWith('/api/chat'))
    expect(chats).toHaveLength(2)
    expect(chats.map((c) => (c.body as { model: string }).model)).toEqual([
      'qwen2.5:7b',
      'qwen2.5:7b',
    ])
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

describe('AI cục bộ: độ bền và hiệu năng', () => {
  it('contextSize / extractJson: ngữ cảnh đủ cho lời thoại dài, JSON bọc markdown vẫn đọc được', async () => {
    const { contextSize, extractJson } = await import('./ollama')
    expect(contextSize(100)).toBe(4096)
    expect(contextSize(30_000)).toBe(16_384)
    expect(contextSize(1_000_000)).toBe(32_768)
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('Sure! ```json\n{"a": [1, 2]}\n```')).toEqual({ a: [1, 2] })
    expect(extractJson('Here you go: {"cuts":[]} hope it helps')).toEqual({ cuts: [] })
    expect(() => extractJson('no json here')).toThrow('ollama_bad_json')
  })

  it('JSON hỏng thì thử lại một lần với lời nhắc nghiêm hơn; gửi keep_alive và num_ctx', async () => {
    const bodies: {
      options: { num_ctx: number }
      keep_alive: string
      messages: { content: string }[]
    }[] = []
    let calls = 0
    const fetchImpl: FetchLike = async (_input, init) => {
      const body = JSON.parse(String(init!.body))
      bodies.push(body)
      calls++
      const content =
        calls === 1 ? 'oops not json' : JSON.stringify({ commands: [{ kind: 'autoZoom' }] })
      return new Response(JSON.stringify({ message: { content } }), { status: 200 })
    }
    const ai = new AiService({
      getKey: async () => undefined,
      getLocalAi: async () => ({ enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'm' }),
      run: runFfmpeg,
      fetchImpl,
    })
    expect(await ai.plan('zoom', { language: 'vi', durationMs: 1, hasTranscript: false })).toEqual([
      { kind: 'autoZoom' },
    ])
    expect(calls).toBe(2)
    expect(bodies[0]!.keep_alive).toBe('15m')
    // Cửa sổ ngữ cảnh theo độ dài lời nhắc (lời nhắc trợ lý nay dài hơn 4 KB).
    expect(bodies[0]!.options.num_ctx).toBeGreaterThanOrEqual(4096)
    expect(bodies[1]!.messages[0]!.content).toContain('exactly one JSON object')
    // Hỏng lần hai thì báo lỗi rõ.
    const alwaysBad: FetchLike = async () =>
      new Response(JSON.stringify({ message: { content: '???' } }), { status: 200 })
    await expect(
      new AiService({
        getKey: async () => undefined,
        getLocalAi: async () => ({ enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'm' }),
        run: runFfmpeg,
        fetchImpl: alwaysBad,
      }).plan('zoom', { language: 'vi', durationMs: 1, hasTranscript: false }),
    ).rejects.toThrow('ollama_bad_json')
  })

  it('tìm từ thừa với model cục bộ: chia lời thoại dài thành từng đoạn 400 từ, giữ chỉ số toàn cục', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lumora-ai-local-'))
    const words = Array.from({ length: 1000 }, (_, i) => ({
      text: i === 450 ? 'ừm' : `w${i}`,
      start: i * 100,
      end: i * 100 + 80,
    }))
    await writeFile(join(dir, 'transcript.json'), JSON.stringify({ language: 'vi', words }))
    const users: string[] = []
    const fetchImpl: FetchLike = async (_input, init) => {
      const body = JSON.parse(String(init!.body)) as { messages: { content: string }[] }
      users.push(body.messages[1]!.content)
      // Đoạn thứ hai (từ 400-799) chứa từ 450: model chỉ ra bằng chỉ số toàn cục.
      const cuts =
        users.length === 2 ? [{ from: 450, to: 450, kind: 'filler', reason: 'Từ đệm' }] : []
      return new Response(JSON.stringify({ message: { content: JSON.stringify({ cuts }) } }), {
        status: 200,
      })
    }
    const ai = new AiService({
      getKey: async () => undefined,
      getLocalAi: async () => ({ enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'm' }),
      run: runFfmpeg,
      fetchImpl,
    })
    const cuts = await ai.suggestCuts(dir)
    expect(users).toHaveLength(3)
    expect(users[0]).toContain('words 0-399')
    expect(users[1]).toContain('[450]ừm')
    expect(users[2]).toContain('words 800-999')
    expect(cuts.filter((c) => c.kind === 'filler').map((c) => c.start)).toEqual([45_000])
    await rm(dir, { recursive: true, force: true })
  })

  it('benchmark: đọc tốc độ từ /api/generate', async () => {
    const { benchmarkOllama } = await import('./ollama')
    const fetchImpl: FetchLike = async (input, init) => {
      expect(String(input)).toContain('/api/generate')
      expect(JSON.parse(String(init!.body)).keep_alive).toBe('15m')
      return new Response(
        JSON.stringify({
          load_duration: 1.5e9,
          eval_count: 60,
          eval_duration: 3e9,
          total_duration: 5e9,
        }),
        { status: 200 },
      )
    }
    expect(await benchmarkOllama('http://127.0.0.1:11434', 'm', fetchImpl)).toEqual({
      loadMs: 1500,
      tokensPerSecond: 20,
      totalMs: 5000,
    })
  })
})

describe('AiService với giọng nói cục bộ (whisper.cpp + Piper)', () => {
  /** Bộ chạy giả: ghi lại tham số, trả transcript cố định và WAV 0,8 giây do ffmpeg tạo. */
  function fakeEngine() {
    const calls: { transcribe: unknown[]; speak: unknown[] } = { transcribe: [], speak: [] }
    const engine: LocalSpeechLike = {
      transcribe: vi.fn(async (wavPath: string, opts: unknown) => {
        calls.transcribe.push({ wavPath, opts })
        // File đưa cho whisper phải là WAV 16 kHz mono.
        const head = (await readFile(wavPath)).subarray(0, 36)
        expect(head.toString('ascii', 0, 4)).toBe('RIFF')
        expect(head.toString('ascii', 8, 12)).toBe('WAVE')
        expect(head.readUInt32LE(24)).toBe(16000)
        expect(head.readUInt16LE(22)).toBe(1)
        return {
          language: 'vi',
          words: [
            { text: 'Xin', start: 0, end: 300 },
            { text: 'chào', start: 300, end: 700 },
          ],
        }
      }),
      speak: vi.fn(async (text: string, opts: unknown) => {
        calls.speak.push({ text, opts })
        const wav = join(dir, 'piper-out.wav')
        const r = await runFfmpeg([
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.8',
          '-ar',
          '22050',
          '-ac',
          '1',
          wav,
        ])
        if (r.code !== 0) throw new Error(r.stderr)
        return readFile(wav)
      }),
      installedVoices: vi.fn(async () => [
        { id: 'vi_VN-vais1000-medium', name: 'Tiếng Việt – Vais' },
      ]),
    }
    return { engine, calls }
  }
  const localAi = (engine: LocalSpeechLike, enabled = true, soundsDir?: string) =>
    new AiService({
      getKey: async () => undefined,
      getLocalSpeech: async () => ({
        enabled,
        whisperModel: 'large-v3-turbo-q5_0',
        piperVoice: 'vi_VN-vais1000-medium',
      }),
      localSpeech: engine,
      run: runFfmpeg,
      soundsDir,
    })

  it('nhận dạng bằng whisper.cpp: không cần key, trộn thành WAV 16 kHz, lưu transcript, dọn file tạm', async () => {
    const { engine, calls } = fakeEngine()
    const ai = localAi(engine)
    expect(await ai.usingLocalSpeech()).toBe(true)
    const transcript = await ai.transcribe(project, dir, 'vi')
    expect(transcript.words.map((w) => w.text)).toEqual(['Xin', 'chào'])
    expect(calls.transcribe).toHaveLength(1)
    expect(calls.transcribe[0]).toMatchObject({
      wavPath: join(dir, '.speech.wav'),
      opts: { model: 'large-v3-turbo-q5_0', language: 'vi' },
    })
    expect(JSON.parse(await readFile(join(dir, 'transcript.json'), 'utf8'))).toEqual(transcript)
    expect((await readdir(dir)).some((f) => f.startsWith('.speech'))).toBe(false)
    expect(await ai.getTranscript(dir)).toEqual(transcript)
  })

  it('đọc bằng Piper: WAV đổi sang MP3, lưu đệm chung, khóa riêng với ElevenLabs; tốc độ là file riêng', async () => {
    const { engine, calls } = fakeEngine()
    const sounds = join(dir, 'sounds')
    const ai = localAi(engine, true, sounds)
    expect(await ai.voices()).toEqual([{ id: 'vi_VN-vais1000-medium', name: 'Tiếng Việt – Vais' }])
    const asset = await ai.speak(dir, ' Xin chào cả nhà ', 'vi_VN-vais1000-medium')
    expect(asset.file).toMatch(/^asset-tts-[0-9a-f]{16}\.mp3$/)
    expect(asset.name).toBe('Xin chào cả nhà')
    expect(asset.durationMs).toBeGreaterThan(600)
    expect(calls.speak[0]).toEqual({
      text: 'Xin chào cả nhà',
      opts: { voice: 'vi_VN-vais1000-medium', speed: 1 },
    })
    // File WAV tạm đã dọn; bản MP3 nằm trong dự án và trong bộ đệm chung.
    expect(
      (await readdir(dir)).filter((f) => f.startsWith('asset-tts-') && f.endsWith('.wav')),
    ).toEqual([])
    expect(await readdir(sounds)).toHaveLength(1)
    const again = await ai.speak(dir, 'Xin chào cả nhà', 'vi_VN-vais1000-medium')
    expect(again.file).toBe(asset.file)
    expect(calls.speak).toHaveLength(1)
    const fast = await ai.speak(dir, 'Xin chào cả nhà', 'vi_VN-vais1000-medium', { speed: 1.2 })
    expect(fast.file).not.toBe(asset.file)
    expect(calls.speak[1]).toMatchObject({ opts: { speed: 1.2 } })
  })

  it('tắt giọng nói cục bộ thì quay về ElevenLabs (thiếu key báo rõ)', async () => {
    const { engine, calls } = fakeEngine()
    const ai = localAi(engine, false)
    expect(await ai.usingLocalSpeech()).toBe(false)
    await expect(ai.transcribe(project, dir)).rejects.toBeInstanceOf(MissingKeyError)
    await expect(ai.speak(dir, 'hi', 'vi_VN-vais1000-medium')).rejects.toBeInstanceOf(
      MissingKeyError,
    )
    expect(calls.transcribe).toHaveLength(0)
    expect(calls.speak).toHaveLength(0)
  })
})
