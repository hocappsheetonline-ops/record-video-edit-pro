import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { aiErrorText, localSpeechErrorKey } from './ai-errors'

const t = i18n.t

beforeEach(() => i18n.changeLanguage('vi'))

describe('aiErrorText', () => {
  it('thiếu key / Ollama / không có âm thanh: câu quen thuộc', () => {
    expect(aiErrorText(t, new Error('missing_key:elevenlabs'))).toContain('API key ElevenLabs')
    expect(aiErrorText(t, new Error('ollama_offline'))).toContain('Ollama')
    expect(aiErrorText(t, 'no_audio')).toContain('không có âm thanh')
    expect(aiErrorText(t, new Error('boom'))).toBe('Lỗi: boom')
  })

  it('giọng nói cục bộ: chỉ đường tới Cài đặt → Giọng nói cục bộ', () => {
    // Lỗi IPC của Electron có tiền tố "Error invoking remote method…" cũng được gỡ ra.
    expect(
      aiErrorText(
        t,
        new Error("Error invoking remote method 'ai:transcribe': Error: local_speech_unsupported"),
      ),
    ).toContain('Cài đặt → Giọng nói cục bộ')
    expect(aiErrorText(t, new Error('local_speech_missing:whisper'))).toContain('Cài whisper.cpp')
    expect(aiErrorText(t, new Error('local_speech_missing:piper'))).toContain('Cài Piper')
    expect(aiErrorText(t, new Error('local_speech_missing:model'))).toContain('Tải model')
    expect(aiErrorText(t, new Error('local_speech_missing:voice'))).toContain('Tải giọng')
    expect(aiErrorText(t, new Error('local_speech_download:404'))).toContain('mã 404')
    expect(aiErrorText(t, new Error('local_speech_failed:whisper'))).toContain(
      'whisper.cpp gặp lỗi',
    )
    expect(aiErrorText(t, new Error('local_speech_failed:piper'))).toContain('Piper gặp lỗi')
  })
})

describe('localSpeechErrorKey', () => {
  it('đổi mã lỗi thành khóa i18n, lỗi khác thì null', () => {
    expect(localSpeechErrorKey('local_speech_unsupported')).toEqual({
      key: 'local_speech_unsupported',
    })
    expect(localSpeechErrorKey('local_speech_missing:model')).toEqual({
      key: 'local_speech_missing_model',
    })
    expect(localSpeechErrorKey('local_speech_download:503')).toEqual({
      key: 'local_speech_download',
      params: { code: '503' },
    })
    expect(localSpeechErrorKey('local_speech_failed:piper')).toEqual({
      key: 'local_speech_failed_piper',
    })
    expect(localSpeechErrorKey('local_speech_missing:ffmpeg')).toBeNull()
    expect(localSpeechErrorKey('ollama_offline')).toBeNull()
  })
})
