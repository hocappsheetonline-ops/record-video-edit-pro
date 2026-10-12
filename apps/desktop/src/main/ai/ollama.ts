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
        options: { temperature: 0.2 },
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
  try {
    return JSON.parse(content) as T
  } catch {
    throw new OllamaError('ollama_bad_json', content.slice(0, 200))
  }
}
