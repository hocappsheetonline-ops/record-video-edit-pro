import Anthropic from '@anthropic-ai/sdk'
import { anthropicBaseUrl, elevenLabsBaseUrl } from './ai/endpoints'
import { pixabayBaseUrl, tenorBaseUrl } from './content/endpoints'
import { checkKeyFormat, type KeyValidationResult, type SecretKey } from '@lumora/core'

const TIMEOUT_MS = 15_000

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Kiểm tra key ElevenLabs bằng endpoint thông tin tài khoản (không tốn credit). */
export async function validateElevenLabsKey(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<KeyValidationResult> {
  let response: Response
  try {
    response = await fetchImpl(`${elevenLabsBaseUrl()}/v1/user`, {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, reason: 'network', message: errorMessage(error) }
  }
  if (response.ok) return { ok: true }
  const body = await response.text().catch(() => '')
  // Key bị giới hạn quyền (không có quyền đọc thông tin tài khoản) vẫn là key hợp lệ.
  if (response.status === 401 && body.includes('missing_permissions')) return { ok: true }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'invalid' }
  return { ok: false, reason: 'unknown', message: `HTTP ${response.status}` }
}

/** Kiểm tra key Claude bằng cách liệt kê model (không tốn token). */
export async function validateAnthropicKey(
  apiKey: string,
  fetchImpl?: FetchLike,
): Promise<KeyValidationResult> {
  const client = new Anthropic({
    apiKey,
    baseURL: anthropicBaseUrl(),
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    fetch: fetchImpl,
  })
  try {
    await client.models.list({ limit: 1 })
    return { ok: true }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'invalid' }
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'invalid' }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, reason: 'network', message: error.message }
    }
    return { ok: false, reason: 'unknown', message: errorMessage(error) }
  }
}

/** Gọi thử một URL kho nội dung: 2xx là key dùng được; 400/401/403 là key sai. */
async function probe(url: string, fetchImpl: FetchLike): Promise<KeyValidationResult> {
  let response: Response
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    return { ok: false, reason: 'network', message: errorMessage(error) }
  }
  if (response.ok) return { ok: true }
  if ([400, 401, 403].includes(response.status)) return { ok: false, reason: 'invalid' }
  return { ok: false, reason: 'unknown', message: `HTTP ${response.status}` }
}

/** Kiểm tra key Tenor (Google Cloud) bằng một lần lấy danh sách nổi bật, 1 kết quả. */
export function validateTenorKey(apiKey: string, fetchImpl: FetchLike = fetch) {
  const params = new URLSearchParams({ key: apiKey, client_key: 'lumora', limit: '1' })
  return probe(`${tenorBaseUrl()}/v2/featured?${params}`, fetchImpl)
}

/** Kiểm tra key Pixabay bằng một lần tìm ảnh, 3 kết quả (mức tối thiểu của API). */
export function validatePixabayKey(apiKey: string, fetchImpl: FetchLike = fetch) {
  const params = new URLSearchParams({ key: apiKey, q: 'meme', per_page: '3' })
  return probe(`${pixabayBaseUrl()}/api/?${params}`, fetchImpl)
}

export type Validators = Record<SecretKey, (apiKey: string) => Promise<KeyValidationResult>>

export const defaultValidators: Validators = {
  elevenlabs: (apiKey) => validateElevenLabsKey(apiKey),
  anthropic: (apiKey) => validateAnthropicKey(apiKey),
  tenor: (apiKey) => validateTenorKey(apiKey),
  pixabay: (apiKey) => validatePixabayKey(apiKey),
}

export async function validateKey(
  key: SecretKey,
  apiKey: string,
  validators: Validators = defaultValidators,
): Promise<KeyValidationResult> {
  const formatError = checkKeyFormat(key, apiKey)
  if (formatError) return { ok: false, reason: 'format', message: formatError }
  return validators[key](apiKey)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
