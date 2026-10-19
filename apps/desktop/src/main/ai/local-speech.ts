import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { cpus } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  WHISPER_MODELS,
  type Transcript,
  type TranscriptWord,
  type WhisperModel,
} from '@lumora/core'
import { extractZip } from '../lib/unzip'

/**
 * Giọng nói cục bộ, không cần ElevenLabs: whisper.cpp (nhận dạng lời nói → phụ đề) và Piper
 * (đọc văn bản → giọng nói). Công cụ (exe + dll) tải từ GitHub Releases, model / giọng tải từ
 * Hugging Face; tất cả nằm trong thư mục của app và chạy hoàn toàn trên máy người dùng.
 *
 * Mã lỗi (`new Error(code)`), renderer dịch sang câu chữ:
 * - `local_speech_unsupported`: nền tảng này không có bản dựng sẵn.
 * - `local_speech_missing:whisper|piper|model|voice`: chưa cài công cụ / chưa tải model, giọng.
 * - `local_speech_download:<status>`: tải thất bại (HTTP), `network` nếu không kết nối được.
 * - `local_speech_failed:whisper|piper: <stderr>`: công cụ thoát với mã lỗi.
 * - `speech_empty`: văn bản rỗng.
 */

export type SpeechTool = 'whisper' | 'piper'

export interface LocalSpeechStatus {
  /** Có thể cài trên nền tảng này (Windows: cả hai; macOS / Linux: chỉ Piper có bản dựng sẵn). */
  supported: boolean
  platform: NodeJS.Platform
  /** `installed`: đã có whisper-cli(.exe); `models`: các model ggml đã tải. */
  whisper: { installed: boolean; models: WhisperModel[] }
  /** `installed`: đã có piper(.exe); `voices`: id giọng có đủ `.onnx` và `.onnx.json`. */
  piper: { installed: boolean; voices: string[] }
}

export type Progress = (completed: number, total: number) => void

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

export type Exec = (
  file: string,
  args: string[],
  opts: { cwd?: string; input?: string; timeoutMs: number },
) => Promise<ExecResult>

export interface LocalSpeechDeps {
  fetchImpl?: typeof fetch
  /** Chạy công cụ; mặc định bọc `child_process.execFile` (maxBuffer 64 MB). */
  exec?: Exec
  platform?: NodeJS.Platform
  arch?: NodeJS.Architecture
  /** Số luồng cho whisper; mặc định max(1, min(8, số CPU − 1)). */
  threads?: number
}

// ---------------------------------------------------------------- bảng tải

const WHISPER_VERSION = 'v1.8.3'
const PIPER_VERSION = '2023.11.14-2'
const WHISPER_RELEASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}`
const PIPER_RELEASE = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}`
const HF = 'https://huggingface.co'

/** Biến thể bản dựng; sau này thêm `cuda` (whisper-cublas-*.zip) khi hỗ trợ GPU. */
export type BuildVariant = 'cpu'

export interface ToolBuild {
  url: string
  format: 'zip' | 'tar.gz'
}

/** Bản dựng sẵn theo `${platform}-${arch}`; thiếu khóa = nền tảng chưa hỗ trợ. */
export const TOOL_BUILDS: Record<
  SpeechTool,
  Record<BuildVariant, Partial<Record<string, ToolBuild>>>
> = {
  whisper: {
    cpu: {
      'win32-x64': { url: `${WHISPER_RELEASE}/whisper-bin-x64.zip`, format: 'zip' },
    },
  },
  piper: {
    cpu: {
      'win32-x64': { url: `${PIPER_RELEASE}/piper_windows_amd64.zip`, format: 'zip' },
      'linux-x64': { url: `${PIPER_RELEASE}/piper_linux_x86_64.tar.gz`, format: 'tar.gz' },
      'darwin-arm64': { url: `${PIPER_RELEASE}/piper_macos_aarch64.tar.gz`, format: 'tar.gz' },
      'darwin-x64': { url: `${PIPER_RELEASE}/piper_macos_x64.tar.gz`, format: 'tar.gz' },
    },
  },
}

export interface WhisperModelInfo {
  file: string
  url: string
  sizeMb: number
  label: string
}

function whisperModel(name: WhisperModel, sizeMb: number, label: string): WhisperModelInfo {
  const file = `ggml-${name}.bin`
  return { file, url: `${HF}/ggerganov/whisper.cpp/resolve/main/${file}`, sizeMb, label }
}

export const WHISPER_MODEL_INFO: Record<WhisperModel, WhisperModelInfo> = {
  small: whisperModel('small', 488, 'Small – nhanh, chất lượng vừa'),
  'medium-q5_0': whisperModel('medium-q5_0', 539, 'Medium (nén) – cân bằng'),
  'large-v3-turbo-q5_0': whisperModel(
    'large-v3-turbo-q5_0',
    574,
    'Large v3 Turbo (nén) – tốt nhất cho tiếng Việt, gọn',
  ),
  'large-v3-turbo': whisperModel('large-v3-turbo', 1620, 'Large v3 Turbo – tốt nhất, nặng'),
}

export interface PiperVoice {
  id: string
  language: 'vi' | 'en'
  label: string
  sizeMb: number
  url: string
  configUrl: string
}

function piperVoice(
  language: 'vi' | 'en',
  locale: string,
  name: string,
  quality: string,
  sizeMb: number,
  label: string,
): PiperVoice {
  const id = `${locale}-${name}-${quality}`
  const base = `${HF}/rhasspy/piper-voices/resolve/v1.0.0/${language}/${locale}/${name}/${quality}/${id}.onnx`
  return { id, language, label, sizeMb, url: base, configUrl: `${base}.json` }
}

export const PIPER_VOICES: readonly PiperVoice[] = [
  piperVoice('vi', 'vi_VN', 'vais1000', 'medium', 63, 'Tiếng Việt – Vais (vừa)'),
  piperVoice('vi', 'vi_VN', '25hours_single', 'low', 25, 'Tiếng Việt – 25hours (nhẹ)'),
  piperVoice('vi', 'vi_VN', 'vivos', 'x_low', 20, 'Tiếng Việt – Vivos (rất nhẹ)'),
  piperVoice('en', 'en_US', 'lessac', 'medium', 63, 'English (US) – Lessac (medium)'),
  piperVoice('en', 'en_US', 'amy', 'medium', 63, 'English (US) – Amy (medium)'),
  piperVoice('en', 'en_GB', 'alan', 'medium', 63, 'English (UK) – Alan (medium)'),
]

// ---------------------------------------------------------------- tham số CLI

export interface WhisperArgsOptions {
  /** Đường dẫn file ggml. */
  model: string
  /** WAV 16 kHz mono s16le. */
  input: string
  /** Mã ngôn ngữ (vi, en…); rỗng = tự nhận diện. */
  language?: string
  /** Tiền tố file kết quả; whisper ghi `<outBase>.json`. */
  outBase: string
  threads: number
}

/** Mã ngôn ngữ cho whisper: 2–3 chữ cái thường, còn lại là `auto`. */
export function whisperLanguage(language?: string): string {
  const code = (language ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return /^[a-z]{2,3}$/.test(code) ? code : 'auto'
}

/**
 * Tham số whisper-cli: mỗi từ một đoạn (`-ml 1 -sow`), ghi JSON (`-oj -of`), không in ra
 * màn hình (`-np`).
 */
export function whisperArgs(opts: WhisperArgsOptions): string[] {
  return [
    '-m',
    opts.model,
    '-f',
    opts.input,
    '-l',
    whisperLanguage(opts.language),
    '-ml',
    '1',
    '-sow',
    '-oj',
    '-of',
    opts.outBase,
    '-t',
    String(Math.max(1, Math.floor(opts.threads))),
    '-np',
  ]
}

export interface PiperArgsOptions {
  model: string
  config: string
  output: string
  /** 0.5–2, 1 = bình thường. */
  speed?: number
}

/** Kẹp tốc độ đọc vào 0.5–2. */
export function clampSpeed(speed?: number): number {
  return typeof speed === 'number' && Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1
}

/** Tham số piper; văn bản đi qua stdin, không bao giờ nằm trên dòng lệnh. */
export function piperArgs(opts: PiperArgsOptions): string[] {
  const lengthScale = Math.round((1 / clampSpeed(opts.speed)) * 100) / 100
  return [
    '-m',
    opts.model,
    '-c',
    opts.config,
    '-f',
    opts.output,
    '--length_scale',
    String(lengthScale),
    '--sentence_silence',
    '0.2',
  ]
}

// ---------------------------------------------------------------- đọc JSON whisper

/** Nhãn whisper tự chèn: `[BLANK_AUDIO]`, `(music)`, `[_BEG_]`, `♪`… không phải lời nói. */
const NON_SPEECH = /^[[(（【].*[\])）】]$/u
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u

function asRecord(value: unknown): Record<string, unknown> {
  return (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
}

/** Chia một đoạn nhiều từ thành từng từ, chia thời gian theo số ký tự. */
function splitSegment(text: string, start: number, end: number): TranscriptWord[] {
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return [{ text, start, end }]
  const chars = parts.reduce((n, p) => n + p.length, 0)
  const words: TranscriptWord[] = []
  let at = start
  for (const [i, part] of parts.entries()) {
    const to = i === parts.length - 1 ? end : at + Math.round(((end - start) * part.length) / chars)
    words.push({ text: part, start: at, end: to })
    at = to
  }
  return words
}

/**
 * Đọc JSON của `whisper-cli -oj` (chạy với `-ml 1 -sow` nên mỗi đoạn ≈ một từ) thành bản ghi:
 * bỏ nhãn không phải lời nói, gộp dấu câu vào từ trước, bảo đảm `end > start` và sắp theo thời gian.
 */
export function parseWhisperJson(json: unknown): Transcript {
  const root = asRecord(json)
  const result = asRecord(root.result)
  const language = typeof result.language === 'string' ? result.language.trim() : ''
  const words: TranscriptWord[] = []
  const segments = Array.isArray(root.transcription) ? root.transcription : []
  for (const raw of segments) {
    const seg = asRecord(raw)
    const offsets = asRecord(seg.offsets)
    if (
      typeof seg.text !== 'string' ||
      typeof offsets.from !== 'number' ||
      typeof offsets.to !== 'number' ||
      !Number.isFinite(offsets.from) ||
      !Number.isFinite(offsets.to)
    )
      continue
    const text = seg.text.trim()
    if (!text || NON_SPEECH.test(text)) continue
    const start = Math.max(0, Math.round(offsets.from))
    const end = Math.max(start + 1, Math.round(offsets.to))
    if (!HAS_WORD_CHAR.test(text)) {
      // Dấu câu đứng riêng ("," "." "?"): dính vào từ trước, giống ElevenLabs trả "Xin,".
      const prev = words[words.length - 1]
      if (prev) {
        prev.text += text
        prev.end = Math.max(prev.end, end)
      }
      continue
    }
    words.push(...splitSegment(text, start, end))
  }
  words.sort((a, b) => a.start - b.start || a.end - b.end)
  return { language, words }
}

// ---------------------------------------------------------------- hạ tầng

const DOWNLOAD_TIMEOUT_MS = 60 * 60_000
const TRANSCRIBE_TIMEOUT_MS = 30 * 60_000
const SPEAK_TIMEOUT_MS = 10 * 60_000
const EXTRACT_TIMEOUT_MS = 5 * 60_000
/** Model / giọng nhỏ hơn mức này chắc chắn là trang lỗi HTML chứ không phải file thật. */
const MIN_MODEL_BYTES = 1024 * 1024
const STDERR_TAIL = 400

const defaultExec: Exec = (file, args, opts) =>
  new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        killSignal: 'SIGKILL',
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        let code = 0
        let err = String(stderr)
        if (error) {
          // `code` là số khi tiến trình tự thoát; là chuỗi (ENOENT…) hoặc null (bị giết) khi không.
          code = typeof error.code === 'number' ? error.code : 1
          if (typeof error.code !== 'number') err = `${err}\n${error.message}`.trim()
        }
        resolve({ code, stdout: String(stdout), stderr: err })
      },
    )
    child.stdin?.on('error', () => {})
    if (opts.input !== undefined) child.stdin?.end(opts.input, 'utf8')
    else child.stdin?.end()
  })

function defaultThreads(): number {
  return Math.max(1, Math.min(8, cpus().length - 1))
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function tail(text: string): string {
  return text.trim().slice(-STDERR_TAIL)
}

/** Tên file an toàn cho id giọng (tránh `../`). */
const SAFE_ID = /^[\w.-]{1,80}$/

// ---------------------------------------------------------------- lớp chính

export class LocalSpeech {
  private readonly fetchImpl: typeof fetch
  private readonly exec: Exec
  private readonly platform: NodeJS.Platform
  private readonly arch: NodeJS.Architecture
  private readonly threads: number
  /** Tải / cài đang chạy theo đường dẫn đích, để bấm hai lần không tải hai lần. */
  private readonly inflight = new Map<string, Promise<void>>()

  constructor(
    private readonly paths: { toolsDir: string; modelsDir: string; cacheDir: string },
    deps: LocalSpeechDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.exec = deps.exec ?? defaultExec
    this.platform = deps.platform ?? process.platform
    this.arch = deps.arch ?? process.arch
    this.threads = deps.threads ?? defaultThreads()
  }

  // ---- đường dẫn

  private toolDir(tool: SpeechTool): string {
    return join(this.paths.toolsDir, tool)
  }

  private exePath(tool: SpeechTool): string {
    const name = tool === 'whisper' ? 'whisper-cli' : 'piper'
    return join(this.toolDir(tool), this.platform === 'win32' ? `${name}.exe` : name)
  }

  private modelPath(model: WhisperModel): string {
    return join(this.paths.modelsDir, 'whisper', WHISPER_MODEL_INFO[model].file)
  }

  private voicePaths(voiceId: string): { model: string; config: string } {
    const model = join(this.paths.modelsDir, 'piper', `${voiceId}.onnx`)
    return { model, config: `${model}.json` }
  }

  private build(tool: SpeechTool, variant: BuildVariant = 'cpu'): ToolBuild | undefined {
    return TOOL_BUILDS[tool][variant][`${this.platform}-${this.arch}`]
  }

  // ---- trạng thái

  async status(): Promise<LocalSpeechStatus> {
    const models: WhisperModel[] = []
    for (const m of WHISPER_MODELS) if (await exists(this.modelPath(m))) models.push(m)
    const voices: string[] = []
    for (const v of PIPER_VOICES) {
      const p = this.voicePaths(v.id)
      if ((await exists(p.model)) && (await exists(p.config))) voices.push(v.id)
    }
    return {
      supported: this.build('whisper') !== undefined || this.build('piper') !== undefined,
      platform: this.platform,
      whisper: { installed: await exists(this.exePath('whisper')), models },
      piper: { installed: await exists(this.exePath('piper')), voices },
    }
  }

  // ---- tải về

  private dedupe(key: string, run: () => Promise<void>): Promise<void> {
    const running = this.inflight.get(key)
    if (running) return running
    const task = run().finally(() => this.inflight.delete(key))
    this.inflight.set(key, task)
    return task
  }

  /**
   * Tải `url` về `dest`: ghi vào `.part` rồi đổi tên khi xong; báo tiến độ theo content-length;
   * xóa file dở nếu lỗi.
   */
  private async download(
    url: string,
    dest: string,
    minBytes: number,
    onProgress?: Progress,
  ): Promise<void> {
    await mkdir(dirname(dest), { recursive: true })
    const part = `${dest}.part`
    try {
      let response: Response
      try {
        response = await this.fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
      } catch (error) {
        throw new Error(`local_speech_download:network: ${(error as Error).message}`)
      }
      if (!response.ok || !response.body)
        throw new Error(`local_speech_download:${response.status}`)
      const total = Number(response.headers.get('content-length')) || 0
      let completed = 0
      const body = response.body
      async function* chunks() {
        for await (const chunk of body) {
          completed += chunk.byteLength
          onProgress?.(completed, Math.max(total, completed))
          yield chunk
        }
      }
      await pipeline(Readable.from(chunks()), createWriteStream(part))
      const size = (await stat(part)).size
      if (size < minBytes) throw new Error('local_speech_download:truncated')
      await rename(part, dest)
      onProgress?.(size, size)
    } catch (error) {
      await rm(part, { force: true }).catch(() => {})
      throw error
    }
  }

  /** Cài whisper.cpp hoặc Piper từ bản dựng sẵn cho nền tảng này. */
  installTool(tool: SpeechTool, onProgress?: Progress): Promise<void> {
    const build = this.build(tool)
    if (!build) return Promise.reject(new Error('local_speech_unsupported'))
    const dir = this.toolDir(tool)
    return this.dedupe(dir, async () => {
      const archive = join(this.paths.cacheDir, `${tool}-${basename(build.url)}`)
      try {
        await this.download(build.url, archive, 1, onProgress)
        await mkdir(dir, { recursive: true })
        if (build.format === 'zip') {
          await extractZip(archive, dir, tool === 'whisper' ? pickWhisperEntry : pickPiperEntry)
        } else {
          // Bản tar.gz (macOS / Linux) có thư mục gốc `piper/`; bỏ cấp đó khi giải nén.
          const r = await this.exec('tar', ['-xzf', archive, '-C', dir, '--strip-components=1'], {
            timeoutMs: EXTRACT_TIMEOUT_MS,
          })
          if (r.code !== 0) throw new Error(`local_speech_failed:${tool}: ${tail(r.stderr)}`)
        }
      } finally {
        await rm(archive, { force: true }).catch(() => {})
      }
    })
  }

  /** Tải model ggml từ Hugging Face. */
  downloadModel(model: WhisperModel, onProgress?: Progress): Promise<void> {
    const info = WHISPER_MODELS.includes(model) ? WHISPER_MODEL_INFO[model] : undefined
    if (!info) return Promise.reject(new Error('local_speech_missing:model'))
    const dest = this.modelPath(model)
    return this.dedupe(dest, () => this.download(info.url, dest, MIN_MODEL_BYTES, onProgress))
  }

  /** Tải giọng Piper (`.onnx` + `.onnx.json`) từ Hugging Face. */
  downloadVoice(voiceId: string, onProgress?: Progress): Promise<void> {
    const voice = PIPER_VOICES.find((v) => v.id === voiceId)
    if (!voice || !SAFE_ID.test(voiceId))
      return Promise.reject(new Error('local_speech_missing:voice'))
    const { model, config } = this.voicePaths(voiceId)
    return this.dedupe(model, async () => {
      await this.download(voice.configUrl, config, 1)
      await this.download(voice.url, model, MIN_MODEL_BYTES, onProgress)
    })
  }

  async removeModel(model: WhisperModel): Promise<void> {
    if (!WHISPER_MODELS.includes(model)) return
    await rm(this.modelPath(model), { force: true })
  }

  async removeVoice(voiceId: string): Promise<void> {
    if (!SAFE_ID.test(voiceId)) return
    const { model, config } = this.voicePaths(voiceId)
    await rm(model, { force: true })
    await rm(config, { force: true })
  }

  // ---- chạy công cụ

  /** Nhận dạng file WAV 16 kHz mono (đã chuẩn bị bằng ffmpeg) thành từng từ kèm thời gian. */
  async transcribe(
    wavPath: string,
    opts: { model: WhisperModel; language?: string; timeoutMs?: number },
  ): Promise<Transcript> {
    const exe = this.exePath('whisper')
    if (!(await exists(exe))) throw new Error('local_speech_missing:whisper')
    if (!WHISPER_MODELS.includes(opts.model)) throw new Error('local_speech_missing:model')
    const model = this.modelPath(opts.model)
    if (!(await exists(model))) throw new Error('local_speech_missing:model')
    await mkdir(this.paths.cacheDir, { recursive: true })
    const outBase = join(this.paths.cacheDir, `whisper-${randomUUID()}`)
    const outFile = `${outBase}.json`
    try {
      const r = await this.exec(
        exe,
        whisperArgs({
          model,
          input: wavPath,
          language: opts.language,
          outBase,
          threads: this.threads,
        }),
        { cwd: this.toolDir('whisper'), timeoutMs: opts.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS },
      )
      if (r.code !== 0) throw new Error(`local_speech_failed:whisper: ${tail(r.stderr)}`)
      let raw: string
      try {
        raw = await readFile(outFile, 'utf8')
      } catch {
        throw new Error(`local_speech_failed:whisper: không có file kết quả ${tail(r.stderr)}`)
      }
      return parseWhisperJson(JSON.parse(raw))
    } finally {
      await rm(outFile, { force: true }).catch(() => {})
    }
  }

  /** Đọc `text` bằng giọng Piper; trả về WAV 22050 Hz mono (bên gọi chuyển sang mp3). */
  async speak(text: string, opts: { voice: string; speed?: number }): Promise<Buffer> {
    // Piper coi mỗi dòng stdin là một lượt đọc và ghi đè file ra: gộp thành một dòng.
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) throw new Error('speech_empty')
    const exe = this.exePath('piper')
    if (!(await exists(exe))) throw new Error('local_speech_missing:piper')
    if (!SAFE_ID.test(opts.voice)) throw new Error('local_speech_missing:voice')
    const voice = this.voicePaths(opts.voice)
    if (!(await exists(voice.model)) || !(await exists(voice.config)))
      throw new Error('local_speech_missing:voice')
    await mkdir(this.paths.cacheDir, { recursive: true })
    const output = join(this.paths.cacheDir, `piper-${randomUUID()}.wav`)
    try {
      const r = await this.exec(
        exe,
        piperArgs({ model: voice.model, config: voice.config, output, speed: opts.speed }),
        { cwd: this.toolDir('piper'), input: `${clean}\n`, timeoutMs: SPEAK_TIMEOUT_MS },
      )
      if (r.code !== 0) throw new Error(`local_speech_failed:piper: ${tail(r.stderr)}`)
      let wav: Buffer
      try {
        wav = await readFile(output)
      } catch {
        throw new Error(`local_speech_failed:piper: không có file âm thanh ${tail(r.stderr)}`)
      }
      // Header WAV là 44 byte; ngắn hơn nghĩa là không có mẫu âm thanh nào.
      if (wav.length <= 44)
        throw new Error(`local_speech_failed:piper: file rỗng ${tail(r.stderr)}`)
      return wav
    } finally {
      await rm(output, { force: true }).catch(() => {})
    }
  }
}

/** Bản zip whisper: chỉ lấy `whisper-cli.exe` và các `.dll` trong `Release/`, bỏ cấp thư mục. */
export function pickWhisperEntry(name: string): string | null {
  const file = name.split('/').pop() ?? ''
  return file === 'whisper-cli.exe' || /\.dll$/i.test(file) ? file : null
}

/** Bản zip Piper: lấy nguyên cây `piper/` (exe, dll, espeak-ng-data/…), bỏ tiền tố. */
export function pickPiperEntry(name: string): string | null {
  return name.startsWith('piper/') && name.length > 'piper/'.length
    ? name.slice('piper/'.length)
    : null
}
