import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { wordsFromElevenLabs, type Transcript } from '@lumora/core'
import type { FetchLike } from '../key-validation'
import { elevenLabsBaseUrl } from './endpoints'

export const STT_MODEL = 'scribe_v2'

export class AiServiceError extends Error {
  constructor(
    readonly service: 'elevenlabs' | 'anthropic',
    readonly status: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'AiServiceError'
  }
}

/**
 * Gửi file âm thanh lên ElevenLabs Speech-to-Text (Scribe) và nhận lại từng từ kèm thời gian.
 * `language` là mã ISO (vi, en...) hoặc để trống để tự nhận diện.
 */
export async function transcribeFile(
  file: string,
  apiKey: string,
  options: { language?: string; fetchImpl?: FetchLike; mimeType?: string } = {},
): Promise<Transcript> {
  const form = new FormData()
  form.append('model_id', STT_MODEL)
  form.append('timestamps_granularity', 'word')
  form.append('tag_audio_events', 'false')
  if (options.language) form.append('language_code', options.language)
  const data = await readFile(file)
  form.append(
    'file',
    new Blob([new Uint8Array(data)], { type: options.mimeType ?? 'audio/mpeg' }),
    basename(file),
  )

  const response = await (options.fetchImpl ?? fetch)(`${elevenLabsBaseUrl()}/v1/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const detail = /"message"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? body.slice(0, 200)
    throw new AiServiceError(
      'elevenlabs',
      response.status,
      `ElevenLabs ${response.status}: ${detail}`,
    )
  }
  return wordsFromElevenLabs(await response.json())
}
