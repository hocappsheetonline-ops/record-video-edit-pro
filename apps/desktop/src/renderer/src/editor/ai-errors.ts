import type { TFunction } from 'i18next'
import { ipcErrorMessage } from '../lib/prefs'

/** Đổi lỗi kỹ thuật thành câu dễ hiểu. */
export function aiErrorText(t: TFunction, error: unknown): string {
  const message = ipcErrorMessage(error)
  const key = /missing_key:(elevenlabs|anthropic)/.exec(message)?.[1]
  if (key) return t('ai.errors.missingKey', { name: t(`keys.${key}.name`) })
  const ollama = /ollama_(offline|model|bad_json)/.exec(message)?.[0]
  if (ollama) return t(`ai.errors.${ollama}`)
  const speech = localSpeechErrorKey(message)
  if (speech) return t(`ai.errors.${speech.key}`, speech.params)
  if (message.includes('no_audio')) return t('ai.errors.noAudio')
  if (message.includes('no_transcript')) return t('ai.errors.noTranscript')
  return t('ai.errors.generic', { message })
}

/**
 * Lỗi của giọng nói cục bộ (whisper.cpp / Piper) → khóa i18n dưới `ai.errors`: `local_speech_unsupported`,
 * `local_speech_missing:<whisper|piper|model|voice>`, `local_speech_download:<mã HTTP>`,
 * `local_speech_failed:<whisper|piper>`. Trả null nếu không phải lỗi giọng nói cục bộ.
 */
export function localSpeechErrorKey(
  message: string,
): { key: string; params?: Record<string, string> } | null {
  if (message.includes('local_speech_unsupported')) return { key: 'local_speech_unsupported' }
  const missing = /local_speech_missing:(whisper|piper|model|voice)/.exec(message)?.[1]
  if (missing) return { key: `local_speech_missing_${missing}` }
  const code = /local_speech_download:(\d+)/.exec(message)?.[1]
  if (code) return { key: 'local_speech_download', params: { code } }
  const failed = /local_speech_failed:(whisper|piper)/.exec(message)?.[1]
  if (failed) return { key: `local_speech_failed_${failed}` }
  return null
}
