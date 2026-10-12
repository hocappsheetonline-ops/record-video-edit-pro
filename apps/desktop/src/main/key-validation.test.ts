import { describe, expect, it, vi } from 'vitest'
import {
  validateAnthropicKey,
  validateElevenLabsKey,
  validateKey,
  type FetchLike,
  type Validators,
} from './key-validation'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchReturning = (response: Response): FetchLike => vi.fn(async () => response)
const failingFetch: FetchLike = async () => {
  throw new TypeError('fetch failed')
}

describe('validateElevenLabsKey', () => {
  it('gửi key qua header xi-api-key', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json(200, {}))
    await validateElevenLabsKey('el-key', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.elevenlabs.io/v1/user')
    expect(init?.headers).toEqual({ 'xi-api-key': 'el-key' })
  })

  it('hợp lệ khi trả về 200', async () => {
    expect(await validateElevenLabsKey('k', fetchReturning(json(200, {})))).toEqual({ ok: true })
  })

  it('không hợp lệ khi trả về 401', async () => {
    const result = await validateElevenLabsKey(
      'k',
      fetchReturning(json(401, { detail: { status: 'invalid_api_key' } })),
    )
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('vẫn hợp lệ khi key chỉ thiếu quyền đọc tài khoản', async () => {
    const result = await validateElevenLabsKey(
      'k',
      fetchReturning(json(401, { detail: { status: 'missing_permissions' } })),
    )
    expect(result).toEqual({ ok: true })
  })

  it('báo lỗi mạng', async () => {
    expect(await validateElevenLabsKey('k', failingFetch)).toMatchObject({
      ok: false,
      reason: 'network',
    })
  })

  it('báo lỗi khác kèm mã HTTP', async () => {
    expect(await validateElevenLabsKey('k', fetchReturning(json(500, {})))).toEqual({
      ok: false,
      reason: 'unknown',
      message: 'HTTP 500',
    })
  })
})

describe('validateAnthropicKey', () => {
  it('gọi endpoint models với header x-api-key', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json(200, { data: [], has_more: false, first_id: null, last_id: null }),
    )
    expect(await validateAnthropicKey('sk-ant-test', fetchImpl)).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain('/v1/models')
    expect(new Headers(init?.headers).get('x-api-key')).toBe('sk-ant-test')
  })

  it('không hợp lệ khi trả về 401', async () => {
    const result = await validateAnthropicKey(
      'sk-ant-test',
      fetchReturning(
        json(401, {
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      ),
    )
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('báo lỗi mạng', async () => {
    expect(await validateAnthropicKey('sk-ant-test', failingFetch)).toMatchObject({
      ok: false,
      reason: 'network',
    })
  })
})

describe('validateKey', () => {
  const validators: Validators = {
    elevenlabs: vi.fn(async () => ({ ok: true as const })),
    anthropic: vi.fn(async () => ({ ok: true as const })),
  }

  it('báo lỗi định dạng mà không gọi API', async () => {
    expect(await validateKey('anthropic', 'abc', validators)).toEqual({
      ok: false,
      reason: 'format',
      message: 'too_short',
    })
    expect(validators.anthropic).not.toHaveBeenCalled()
  })

  it('gọi đúng validator khi định dạng hợp lệ', async () => {
    await validateKey('elevenlabs', 'x'.repeat(32), validators)
    expect(validators.elevenlabs).toHaveBeenCalledWith('x'.repeat(32))
  })
})
