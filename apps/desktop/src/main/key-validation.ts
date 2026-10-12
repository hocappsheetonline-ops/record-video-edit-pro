import Anthropic from '@anthropic-ai/sdk'
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
    response = await fetchImpl('https://api.elevenlabs.io/v1/user', {
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
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: TIMEOUT_MS, fetch: fetchImpl })
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

export interface Validators {
  elevenlabs: (apiKey: string) => Promise<KeyValidationResult>
  anthropic: (apiKey: string) => Promise<KeyValidationResult>
}

export const defaultValidators: Validators = {
  elevenlabs: (apiKey) => validateElevenLabsKey(apiKey),
  anthropic: (apiKey) => validateAnthropicKey(apiKey),
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
