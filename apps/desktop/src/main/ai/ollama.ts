import type { FetchLike } from '../key-validation'

/**
 * AI cục bộ qua Ollama (https://ollama.com): máy chủ chạy trên máy người dùng, model mở (Qwen,
 * Llama, Gemma…). API: POST /api/chat với `format` là JSON schema (structured outputs), GET
 * /api/tags liệt kê model đã tải. Miễn phí, không gửi dữ liệu ra ngoài.
 */
export class OllamaError extends Error {
  constructor(
    readonly code: 'ollama_offline' | 'ollama_model' | 'ollama_bad_json' | 'ollama_http',
    message: string,
  ) {
    super(`${code}: ${message}`)
    this.name = 'OllamaError'
  }
}

const TIMEOUT_MS = 10 * 60_000
/** Giữ model trong bộ nhớ sau mỗi lần gọi để các lần sau không phải nạp lại (nhanh hơn nhiều). */
const KEEP_ALIVE = '15m'

/**
 * Cửa sổ ngữ cảnh theo độ dài yêu cầu: Ollama mặc định chỉ 2048 token nên lời thoại dài bị cắt
 * ngầm; ước lượng 1 token ≈ 3 ký tự (tiếng Việt có dấu tốn token hơn), chừa chỗ cho câu trả lời.
 */
export function contextSize(chars: number, reserve = 2048): number {
  const need = Math.ceil(chars / 3) + reserve
  return Math.min(32_768, Math.max(4096, 2 ** Math.ceil(Math.log2(need))))
}

/** Lấy JSON từ câu trả lời: model nhỏ hay bọc ```json … ``` hoặc thêm vài chữ trước / sau. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const candidates = [trimmed]
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]
  if (fenced) candidates.push(fenced.trim())
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1))
  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch {
      // thử ứng viên tiếp theo
    }
  }
  throw new OllamaError('ollama_bad_json', trimmed.slice(0, 200))
}

export interface OllamaBenchmark {
  /** Thời gian nạp model (ms, 0 nếu đã nạp sẵn). */
  loadMs: number
  /** Tốc độ sinh (token / giây). */
  tokensPerSecond: number
  /** Tổng thời gian (ms). */
  totalMs: number
}

/** Chạy thử một câu ngắn để đo tốc độ model trên máy này (và nạp sẵn model). */
export async function benchmarkOllama(
  baseUrl: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): Promise<OllamaBenchmark> {
  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Count from one to twenty in words, separated by commas.',
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { num_predict: 64, temperature: 0 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new OllamaError('ollama_offline', error instanceof Error ? error.message : String(error))
  }
  if (response.status === 404) throw new OllamaError('ollama_model', model)
  if (!response.ok) throw new OllamaError('ollama_http', `HTTP ${response.status}`)
  const data = (await response.json().catch(() => null)) as {
    load_duration?: number
    eval_count?: number
    eval_duration?: number
    total_duration?: number
  } | null
  const evalNs = data?.eval_duration ?? 0
  return {
    loadMs: Math.round((data?.load_duration ?? 0) / 1e6),
    tokensPerSecond:
      evalNs > 0 ? Math.round(((data?.eval_count ?? 0) / evalNs) * 1e9 * 10) / 10 : 0,
    totalMs: Math.round((data?.total_duration ?? 0) / 1e6),
  }
}

export async function listOllamaModels(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    throw new OllamaError('ollama_offline', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) throw new OllamaError('ollama_http', `HTTP ${response.status}`)
  const data = (await response.json().catch(() => null)) as { models?: { name?: unknown }[] } | null
  return (data?.models ?? [])
    .map((m) => (typeof m.name === 'string' ? m.name : ''))
    .filter(Boolean)
    .sort()
}

export interface PullProgress {
  status: string
  completed: number
  total: number
}

/**
 * Tải một model về Ollama (POST /api/pull, trả về NDJSON từng dòng tiến độ). `onProgress` nhận
 * trạng thái và số byte đã tải / tổng của phần đang tải.
 */
export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (p: PullProgress) => void,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<void> {
  if (!/^[\w.:/-]+$/.test(model)) throw new OllamaError('ollama_model', model)
  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
      signal,
    })
  } catch (error) {
    throw new OllamaError('ollama_offline', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok || !response.body)
    throw new OllamaError('ollama_http', `HTTP ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const handle = (line: string) => {
    if (!line.trim()) return
    let data: { status?: unknown; completed?: unknown; total?: unknown; error?: unknown }
    try {
      data = JSON.parse(line)
    } catch {
      return
    }
    if (typeof data.error === 'string') {
      if (/not found|manifest/i.test(data.error)) throw new OllamaError('ollama_model', data.error)
      throw new OllamaError('ollama_http', data.error)
    }
    onProgress({
      status: typeof data.status === 'string' ? data.status : '',
      completed: typeof data.completed === 'number' ? data.completed : 0,
      total: typeof data.total === 'number' ? data.total : 0,
    })
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) handle(line)
  }
  handle(buffer)
}

/** Bộ cài Ollama cho hệ điều hành này (trang tải chính thức). */
export function ollamaInstallerUrl(platform: NodeJS.Platform = process.platform): {
  url: string
  fileName: string
} {
  if (platform === 'win32')
    return { url: 'https://ollama.com/download/OllamaSetup.exe', fileName: 'OllamaSetup.exe' }
  if (platform === 'darwin')
    return { url: 'https://ollama.com/download/Ollama-darwin.zip', fileName: 'Ollama-darwin.zip' }
  return { url: 'https://ollama.com/download/linux', fileName: '' }
}

/** Hỏi model cục bộ và nhận JSON đúng schema (Ollama ép định dạng bằng `format`). */
export async function askJsonOllama<T>(options: {
  baseUrl: string
  model: string
  system: string
  user: string
  schema: Record<string, unknown>
  fetchImpl?: FetchLike
}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(`${options.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        format: options.schema,
        keep_alive: KEEP_ALIVE,
        options: {
          temperature: 0.2,
          num_ctx: contextSize(options.system.length + options.user.length),
          num_predict: 4096,
        },
        messages: [
          { role: 'system', content: `${options.system}\nAnswer with JSON only.` },
          { role: 'user', content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new OllamaError('ollama_offline', error instanceof Error ? error.message : String(error))
  }
  if (response.status === 404) throw new OllamaError('ollama_model', options.model)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (/not found|pull/i.test(body)) throw new OllamaError('ollama_model', options.model)
    throw new OllamaError('ollama_http', `HTTP ${response.status} ${body.slice(0, 200)}`)
  }
  const data = (await response.json().catch(() => null)) as {
    message?: { content?: unknown }
  } | null
  const content = typeof data?.message?.content === 'string' ? data.message.content : ''
  return extractJson(content) as T
}
