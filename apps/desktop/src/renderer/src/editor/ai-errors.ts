import type { TFunction } from 'i18next'
import { ipcErrorMessage } from '../lib/prefs'

/** Đổi lỗi kỹ thuật thành câu dễ hiểu. */
export function aiErrorText(t: TFunction, error: unknown): string {
  const message = ipcErrorMessage(error)
  const key = /missing_key:(elevenlabs|anthropic)/.exec(message)?.[1]
  if (key) return t('ai.errors.missingKey', { name: t(`keys.${key}.name`) })
  const ollama = /ollama_(offline|model|bad_json)/.exec(message)?.[0]
  if (ollama) return t(`ai.errors.${ollama}`)
  if (message.includes('no_audio')) return t('ai.errors.noAudio')
  if (message.includes('no_transcript')) return t('ai.errors.noTranscript')
  return t('ai.errors.generic', { message })
}
