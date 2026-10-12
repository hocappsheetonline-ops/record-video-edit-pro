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
