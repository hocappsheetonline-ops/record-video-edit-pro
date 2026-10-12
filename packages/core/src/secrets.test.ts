import { describe, expect, it } from 'vitest'
import { checkKeyFormat, isSecretKey, maskSecret } from './secrets'

describe('maskSecret', () => {
  it('chỉ hiện 4 ký tự đầu và cuối', () => {
    expect(maskSecret('sk-ant-api03-abcdefghijklmnop-WXYZ')).toBe('sk-a••••••••WXYZ')
  })

  it('che toàn bộ key ngắn', () => {
    expect(maskSecret('abc')).toBe('•••')
  })

  it('bỏ khoảng trắng hai đầu', () => {
    expect(maskSecret('  1234567890abcdef  ')).toBe('1234••••••••cdef')
  })
})

describe('checkKeyFormat', () => {
  const longKey = 'x'.repeat(32)

  it('báo key rỗng', () => {
    expect(checkKeyFormat('elevenlabs', '')).toBe('empty')
  })

  it('báo key có khoảng trắng', () => {
    expect(checkKeyFormat('elevenlabs', `${longKey} abc`)).toBe('whitespace')
  })

  it('báo key quá ngắn', () => {
    expect(checkKeyFormat('elevenlabs', 'short')).toBe('too_short')
  })

  it('yêu cầu tiền tố sk-ant- cho key Claude', () => {
    expect(checkKeyFormat('anthropic', longKey)).toBe('wrong_prefix')
    expect(checkKeyFormat('anthropic', `sk-ant-${longKey}`)).toBeNull()
  })

  it('chấp nhận key ElevenLabs hợp lệ', () => {
    expect(checkKeyFormat('elevenlabs', longKey)).toBeNull()
  })
})

describe('isSecretKey', () => {
  it('chỉ nhận các key được hỗ trợ', () => {
    expect(isSecretKey('anthropic')).toBe(true)
    expect(isSecretKey('elevenlabs')).toBe(true)
    expect(isSecretKey('openai')).toBe(false)
    expect(isSecretKey(undefined)).toBe(false)
  })
})

describe('key kho nội dung', () => {
  it('Tenor là key Google Cloud (AIza…), Pixabay chỉ kiểm tra độ dài', () => {
    expect(isSecretKey('tenor')).toBe(true)
    expect(isSecretKey('pixabay')).toBe(true)
    expect(checkKeyFormat('tenor', 'x'.repeat(39))).toBe('wrong_prefix')
    expect(checkKeyFormat('tenor', `AIza${'x'.repeat(35)}`)).toBeNull()
    expect(checkKeyFormat('pixabay', '12345678-abcdef0123456789abcdef01')).toBeNull()
  })
})
