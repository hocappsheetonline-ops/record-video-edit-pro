import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yazl from 'yazl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LocalSpeech,
  PIPER_VOICES,
  WHISPER_MODEL_INFO,
  parseWhisperJson,
  piperArgs,
  whisperArgs,
  type Exec,
} from './local-speech'

let root: string
let paths: { toolsDir: string; modelsDir: string; cacheDir: string }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lumora-speech-'))
  paths = {
    toolsDir: join(root, 'tools'),
    modelsDir: join(root, 'models'),
    cacheDir: join(root, 'cache'),
  }
})
afterEach(() => rm(root, { recursive: true, force: true }))

function zipBuffer(entries: Record<string, string>): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name)
  zip.end()
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
}

/** fetch giả: trả về nội dung theo đuôi URL, chia nhỏ thành nhiều khúc để kiểm tra tiến độ. */
function fakeFetch(routes: Record<string, Buffer | number>, chunkSize = 64 * 1024): typeof fetch {
  const calls: string[] = []
  const impl = async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const match = Object.entries(routes).find(([suffix]) => url.endsWith(suffix))
    const body = match?.[1]
    if (body === undefined || typeof body === 'number')
      return new Response('not found', { status: typeof body === 'number' ? body : 404 })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < body.length; i += chunkSize)
          controller.enqueue(new Uint8Array(body.subarray(i, i + chunkSize)))
        controller.close()
      },
    })
    return new Response(stream, {
      status: 200,
      headers: { 'content-length': String(body.length) },
    })
  }
  return Object.assign(impl as typeof fetch, { calls })
}

async function installFakeWhisper(exe = 'whisper-cli.exe') {
  await mkdir(join(paths.toolsDir, 'whisper'), { recursive: true })
  await writeFile(join(paths.toolsDir, 'whisper', exe), 'bin')
}

async function installFakePiper(exe = 'piper.exe') {
  await mkdir(join(paths.toolsDir, 'piper'), { recursive: true })
  await writeFile(join(paths.toolsDir, 'piper', exe), 'bin')
}

async function addFakeModel(name = 'small') {
  await mkdir(join(paths.modelsDir, 'whisper'), { recursive: true })
  await writeFile(join(paths.modelsDir, 'whisper', `ggml-${name}.bin`), 'model')
}

async function addFakeVoice(id = 'vi_VN-vais1000-medium', withConfig = true) {
  await mkdir(join(paths.modelsDir, 'piper'), { recursive: true })
  await writeFile(join(paths.modelsDir, 'piper', `${id}.onnx`), 'onnx')
  if (withConfig) await writeFile(join(paths.modelsDir, 'piper', `${id}.onnx.json`), '{}')
}

const WHISPER_JSON = {
  result: { language: 'vi' },
  transcription: [
    {
      timestamps: { from: '00:00:00,000', to: '00:00:00,480' },
      offsets: { from: 0, to: 480 },
      text: ' Xin',
    },
    { offsets: { from: 480, to: 900 }, text: ' chào' },
    { offsets: { from: 900, to: 950 }, text: ',' },
    { offsets: { from: 950, to: 1500 }, text: ' [BLANK_AUDIO]' },
    { offsets: { from: 1500, to: 1500 }, text: ' các' },
    { offsets: { from: 1500, to: 2000 }, text: ' bạn' },
    { offsets: { from: 2000, to: 2400 }, text: ' (music)' },
    { offsets: { from: 2400, to: 2401 }, text: '' },
  ],
}

describe('parseWhisperJson', () => {
  it('đọc từng từ kèm thời gian (ms), bỏ khoảng trắng đầu', () => {
    const t = parseWhisperJson(WHISPER_JSON)
    expect(t.language).toBe('vi')
    expect(t.words.map((w) => w.text)).toEqual(['Xin', 'chào,', 'các', 'bạn'])
    expect(t.words[0]).toEqual({ text: 'Xin', start: 0, end: 480 })
  })

  it('bỏ nhãn [BLANK_AUDIO] / (music) và đoạn rỗng', () => {
    const t = parseWhisperJson(WHISPER_JSON)
    expect(t.words.some((w) => /BLANK|music/.test(w.text))).toBe(false)
  })

  it('dấu câu đứng riêng dính vào từ trước, dấu câu mở đầu bị bỏ', () => {
    const t = parseWhisperJson({
      transcription: [
        { offsets: { from: 0, to: 100 }, text: '.' },
        { offsets: { from: 100, to: 300 }, text: ' Ok' },
        { offsets: { from: 300, to: 350 }, text: '?' },
      ],
    })
    expect(t.words).toEqual([{ text: 'Ok?', start: 100, end: 350 }])
  })

  it('bảo đảm end > start và sắp xếp theo thời gian', () => {
    const t = parseWhisperJson({
      transcription: [
        { offsets: { from: 500, to: 700 }, text: ' hai' },
        { offsets: { from: 100, to: 100 }, text: ' một' },
      ],
    })
    expect(t.words).toEqual([
      { text: 'một', start: 100, end: 101 },
      { text: 'hai', start: 500, end: 700 },
    ])
  })

  it('tách đoạn có nhiều từ theo tỉ lệ ký tự', () => {
    const t = parseWhisperJson({
      transcription: [{ offsets: { from: 0, to: 600 }, text: ' ab cdef' }],
    })
    expect(t.words).toEqual([
      { text: 'ab', start: 0, end: 200 },
      { text: 'cdef', start: 200, end: 600 },
    ])
  })

  it('chịu được JSON sai dạng', () => {
    expect(parseWhisperJson(null)).toEqual({ language: '', words: [] })
    expect(parseWhisperJson({ transcription: [{ text: 'x' }, 5, null] })).toEqual({
      language: '',
      words: [],
    })
  })
})

describe('whisperArgs / piperArgs', () => {
  it('ghi JSON từng từ, -l auto khi không có ngôn ngữ', () => {
    expect(whisperArgs({ model: 'm.bin', input: 'a.wav', outBase: '/c/out', threads: 4 })).toEqual([
      '-m',
      'm.bin',
      '-f',
      'a.wav',
      '-l',
      'auto',
      '-ml',
      '1',
      '-sow',
      '-oj',
      '-of',
      '/c/out',
      '-t',
      '4',
      '-np',
    ])
  })

  it('chuẩn hóa mã ngôn ngữ', () => {
    const lang = (language: string) =>
      whisperArgs({ model: 'm', input: 'a', outBase: 'o', threads: 1, language })[5]
    expect(lang('vi')).toBe('vi')
    expect(lang(' EN-us ')).toBe('en')
    expect(lang('')).toBe('auto')
    expect(lang('../x')).toBe('auto')
  })

  it('piper: length_scale = 1 / tốc độ, kẹp trong 0.5–2', () => {
    const args = (speed?: number) =>
      piperArgs({ model: 'v.onnx', config: 'v.onnx.json', output: 'o.wav', speed })
    expect(args()).toEqual([
      '-m',
      'v.onnx',
      '-c',
      'v.onnx.json',
      '-f',
      'o.wav',
      '--length_scale',
      '1',
      '--sentence_silence',
      '0.2',
    ])
    expect(args(2)[7]).toBe('0.5')
    expect(args(0.1)[7]).toBe('2')
    expect(args(1.25)[7]).toBe('0.8')
  })
})

describe('LocalSpeech.status', () => {
  it('thư mục trống: chưa cài gì', async () => {
    const s = await new LocalSpeech(paths, { platform: 'win32', arch: 'x64' }).status()
    expect(s).toEqual({
      supported: true,
      platform: 'win32',
      whisper: { installed: false, models: [] },
      piper: { installed: false, voices: [] },
    })
  })

  it('liệt kê công cụ, model và giọng đã có (giọng thiếu .json không tính)', async () => {
    await installFakeWhisper()
    await installFakePiper()
    await addFakeModel('small')
    await addFakeModel('large-v3-turbo-q5_0')
    await addFakeVoice('vi_VN-vais1000-medium')
    await addFakeVoice('en_US-amy-medium', false)
    const s = await new LocalSpeech(paths, { platform: 'win32', arch: 'x64' }).status()
    expect(s.whisper).toEqual({ installed: true, models: ['small', 'large-v3-turbo-q5_0'] })
    expect(s.piper).toEqual({ installed: true, voices: ['vi_VN-vais1000-medium'] })
  })

  it('macOS / Linux: vẫn hỗ trợ (Piper), whisper chỉ khi có sẵn file không đuôi .exe', async () => {
    await installFakeWhisper('whisper-cli')
    const mac = await new LocalSpeech(paths, { platform: 'darwin', arch: 'arm64' }).status()
    expect(mac.supported).toBe(true)
    expect(mac.whisper.installed).toBe(true)
    const other = await new LocalSpeech(paths, { platform: 'linux', arch: 'arm64' }).status()
    expect(other.supported).toBe(false)
  })
})

describe('LocalSpeech.installTool', () => {
  it('whisper: chỉ lấy whisper-cli.exe và *.dll, bỏ cấp Release/', async () => {
    const zip = await zipBuffer({
      'Release/whisper-cli.exe': 'cli',
      'Release/a.dll': 'dll',
      'Release/junk.exe': 'junk',
    })
    const fetchImpl = fakeFetch({ 'whisper-bin-x64.zip': zip })
    const progress = vi.fn()
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', fetchImpl })
    await speech.installTool('whisper', progress)
    expect((await readdir(join(paths.toolsDir, 'whisper'))).sort()).toEqual([
      'a.dll',
      'whisper-cli.exe',
    ])
    expect(progress).toHaveBeenLastCalledWith(zip.length, zip.length)
    expect(await readdir(paths.cacheDir)).toEqual([])
    expect((await speech.status()).whisper.installed).toBe(true)
  })

  it('piper: giữ nguyên cây piper/ (espeak-ng-data…)', async () => {
    const zip = await zipBuffer({
      'piper/piper.exe': 'exe',
      'piper/espeak-ng.dll': 'dll',
      'piper/espeak-ng-data/vi_dict': 'dict',
    })
    const fetchImpl = fakeFetch({ 'piper_windows_amd64.zip': zip })
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', fetchImpl })
    await speech.installTool('piper')
    expect(await readFile(join(paths.toolsDir, 'piper', 'piper.exe'), 'utf8')).toBe('exe')
    expect(await readFile(join(paths.toolsDir, 'piper', 'espeak-ng-data', 'vi_dict'), 'utf8')).toBe(
      'dict',
    )
    expect((await speech.status()).piper.installed).toBe(true)
  })

  it('Linux: tải tar.gz và giải nén bằng tar', async () => {
    const fetchImpl = fakeFetch({ 'piper_linux_x86_64.tar.gz': Buffer.from('tgz') })
    const exec = vi.fn<Exec>(async (_file, args) => {
      const dest = args[args.indexOf('-C') + 1] ?? ''
      await writeFile(join(dest, 'piper'), 'bin')
      return { code: 0, stdout: '', stderr: '' }
    })
    const speech = new LocalSpeech(paths, { platform: 'linux', arch: 'x64', fetchImpl, exec })
    await speech.installTool('piper')
    expect(exec).toHaveBeenCalledWith(
      'tar',
      [
        '-xzf',
        expect.stringMatching(/piper_linux_x86_64\.tar\.gz$/),
        '-C',
        join(paths.toolsDir, 'piper'),
        '--strip-components=1',
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
    expect((await speech.status()).piper.installed).toBe(true)
  })

  it('nền tảng không có bản dựng → local_speech_unsupported', async () => {
    const speech = new LocalSpeech(paths, {
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: fakeFetch({}),
    })
    await expect(speech.installTool('whisper')).rejects.toThrow('local_speech_unsupported')
  })
})

describe('LocalSpeech.downloadModel / downloadVoice', () => {
  it('tải theo khúc, báo tiến độ, lưu đúng tên file', async () => {
    const body = Buffer.alloc(1_200_000, 7)
    const fetchImpl = fakeFetch({ 'ggml-small.bin': body }, 500_000)
    const progress = vi.fn()
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', fetchImpl })
    await speech.downloadModel('small', progress)
    const file = join(paths.modelsDir, 'whisper', 'ggml-small.bin')
    expect((await stat(file)).size).toBe(body.length)
    expect(progress.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(progress.mock.calls[0]).toEqual([500_000, body.length])
    expect(progress).toHaveBeenLastCalledWith(body.length, body.length)
    expect(await readdir(join(paths.modelsDir, 'whisper'))).toEqual(['ggml-small.bin'])
    expect((await speech.status()).whisper.models).toEqual(['small'])
    await speech.removeModel('small')
    expect((await speech.status()).whisper.models).toEqual([])
  })

  it('HTTP 404 → local_speech_download:404 và không để lại file dở', async () => {
    const speech = new LocalSpeech(paths, {
      platform: 'win32',
      arch: 'x64',
      fetchImpl: fakeFetch({}),
    })
    await expect(speech.downloadModel('small')).rejects.toThrow('local_speech_download:404')
    expect(await readdir(join(paths.modelsDir, 'whisper'))).toEqual([])
  })

  it('file quá nhỏ (trang lỗi) → truncated', async () => {
    const fetchImpl = fakeFetch({ 'ggml-small.bin': Buffer.from('<html>oops</html>') })
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', fetchImpl })
    await expect(speech.downloadModel('small')).rejects.toThrow('local_speech_download:truncated')
    expect(await readdir(join(paths.modelsDir, 'whisper'))).toEqual([])
  })

  it('giọng: tải .onnx.json rồi .onnx; id lạ bị từ chối', async () => {
    const onnx = Buffer.alloc(1_100_000, 1)
    const fetchImpl = fakeFetch({
      'vi_VN-vais1000-medium.onnx': onnx,
      'vi_VN-vais1000-medium.onnx.json': Buffer.from('{"audio":{"sample_rate":22050}}'),
    })
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', fetchImpl })
    await speech.downloadVoice('vi_VN-vais1000-medium')
    expect((fetchImpl as unknown as { calls: string[] }).calls).toEqual([
      PIPER_VOICES[0]!.configUrl,
      PIPER_VOICES[0]!.url,
    ])
    expect((await speech.status()).piper.voices).toEqual(['vi_VN-vais1000-medium'])
    await expect(speech.downloadVoice('../evil')).rejects.toThrow('local_speech_missing:voice')
    await speech.removeVoice('vi_VN-vais1000-medium')
    expect((await speech.status()).piper.voices).toEqual([])
  })
})

describe('bảng model / giọng', () => {
  it('URL đúng mẫu Hugging Face', () => {
    expect(WHISPER_MODEL_INFO['large-v3-turbo-q5_0'].url).toBe(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    )
    const vais = PIPER_VOICES.find((v) => v.id === 'vi_VN-vais1000-medium')!
    expect(vais.url).toBe(
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx',
    )
    expect(vais.configUrl).toBe(`${vais.url}.json`)
    expect(vais.language).toBe('vi')
    expect(PIPER_VOICES.map((v) => v.id)).toContain('en_US-lessac-medium')
  })
})

describe('LocalSpeech.transcribe', () => {
  it('chạy whisper-cli trong thư mục công cụ, đọc JSON rồi dọn file tạm', async () => {
    await installFakeWhisper()
    await addFakeModel('small')
    const exec = vi.fn<Exec>(async (file, args, opts) => {
      expect(file).toBe(join(paths.toolsDir, 'whisper', 'whisper-cli.exe'))
      expect(opts.cwd).toBe(join(paths.toolsDir, 'whisper'))
      expect(args.slice(0, 6)).toEqual([
        '-m',
        join(paths.modelsDir, 'whisper', 'ggml-small.bin'),
        '-f',
        '/tmp/in.wav',
        '-l',
        'vi',
      ])
      expect(args).toContain('-np')
      const outBase = args[args.indexOf('-of') + 1]!
      await writeFile(`${outBase}.json`, JSON.stringify(WHISPER_JSON))
      return { code: 0, stdout: '', stderr: '' }
    })
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', exec, threads: 3 })
    const t = await speech.transcribe('/tmp/in.wav', { model: 'small', language: 'vi' })
    expect(t.language).toBe('vi')
    expect(t.words.map((w) => w.text)).toEqual(['Xin', 'chào,', 'các', 'bạn'])
    expect(exec.mock.calls[0]![1]).toContain('3')
    expect(await readdir(paths.cacheDir)).toEqual([])
  })

  it('chưa tải model → local_speech_missing:model; chưa cài → local_speech_missing:whisper', async () => {
    const exec = vi.fn<Exec>()
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', exec })
    await expect(speech.transcribe('a.wav', { model: 'small' })).rejects.toThrow(
      'local_speech_missing:whisper',
    )
    await installFakeWhisper()
    await expect(speech.transcribe('a.wav', { model: 'small' })).rejects.toThrow(
      'local_speech_missing:model',
    )
    expect(exec).not.toHaveBeenCalled()
  })

  it('whisper thoát lỗi → local_speech_failed:whisper kèm đuôi stderr', async () => {
    await installFakeWhisper()
    await addFakeModel('small')
    const exec = vi.fn<Exec>(async () => ({ code: 3, stdout: '', stderr: 'boom\nfailed to load' }))
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', exec })
    await expect(speech.transcribe('a.wav', { model: 'small' })).rejects.toThrow(
      'local_speech_failed:whisper: boom\nfailed to load',
    )
  })
})

describe('LocalSpeech.speak', () => {
  it('đưa văn bản qua stdin (một dòng), nhận WAV rồi dọn file tạm', async () => {
    await installFakePiper()
    await addFakeVoice()
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60, 1)])
    const exec = vi.fn<Exec>(async (file, args, opts) => {
      expect(file).toBe(join(paths.toolsDir, 'piper', 'piper.exe'))
      expect(opts.cwd).toBe(join(paths.toolsDir, 'piper'))
      expect(opts.input).toBe('Xin chào các bạn\n')
      expect(args).not.toContain('Xin chào các bạn')
      expect(args[args.indexOf('--length_scale') + 1]).toBe('0.67')
      await writeFile(args[args.indexOf('-f') + 1]!, wav)
      return { code: 0, stdout: '', stderr: '' }
    })
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', exec })
    const out = await speech.speak('Xin chào\n  các bạn ', {
      voice: 'vi_VN-vais1000-medium',
      speed: 1.5,
    })
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.equals(wav)).toBe(true)
    expect(await readdir(paths.cacheDir)).toEqual([])
  })

  it('văn bản rỗng → speech_empty; thiếu giọng / piper → local_speech_missing', async () => {
    const exec = vi.fn<Exec>()
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', exec })
    await expect(speech.speak('  \n', { voice: 'vi_VN-vais1000-medium' })).rejects.toThrow(
      'speech_empty',
    )
    await expect(speech.speak('hi', { voice: 'vi_VN-vais1000-medium' })).rejects.toThrow(
      'local_speech_missing:piper',
    )
    await installFakePiper()
    await expect(speech.speak('hi', { voice: 'vi_VN-vais1000-medium' })).rejects.toThrow(
      'local_speech_missing:voice',
    )
    await expect(speech.speak('hi', { voice: '../x' })).rejects.toThrow(
      'local_speech_missing:voice',
    )
    expect(exec).not.toHaveBeenCalled()
  })

  it('piper thoát lỗi → local_speech_failed:piper', async () => {
    await installFakePiper()
    await addFakeVoice()
    const exec = vi.fn<Exec>(async () => ({ code: 1, stdout: '', stderr: 'bad model' }))
    const speech = new LocalSpeech(paths, { platform: 'win32', arch: 'x64', exec })
    await expect(speech.speak('hi', { voice: 'vi_VN-vais1000-medium' })).rejects.toThrow(
      'local_speech_failed:piper: bad model',
    )
  })
})
