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

/** Model đọc nhiều thứ tiếng (có tiếng Việt). */
export const TTS_MODEL = 'eleven_multilingual_v2'

export interface Voice {
  id: string
  name: string
}

async function elevenLabsError(response: Response): Promise<AiServiceError> {
  const body = await response.text().catch(() => '')
  const detail = /"message"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? body.slice(0, 200)
  return new AiServiceError(
    'elevenlabs',
    response.status,
    `ElevenLabs ${response.status}: ${detail}`,
  )
}

/** Danh sách giọng đọc trong tài khoản ElevenLabs (gồm cả giọng có sẵn). */
export async function listVoices(apiKey: string, fetchImpl: FetchLike = fetch): Promise<Voice[]> {
  const response = await fetchImpl(`${elevenLabsBaseUrl()}/v1/voices`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw await elevenLabsError(response)
  const data = (await response.json()) as { voices?: unknown }
  const voices = Array.isArray(data.voices) ? data.voices : []
  return voices.flatMap((v): Voice[] => {
    if (typeof v !== 'object' || v === null) return []
    const { voice_id: id, name } = v as Record<string, unknown>
    return typeof id === 'string' && /^[\w-]+$/.test(id) && typeof name === 'string'
      ? [{ id, name }]
      : []
  })
}

/** Đọc một câu thành MP3 bằng giọng `voiceId`. */
/** Tùy chọn giọng đọc: tốc độ 0.7–1.2 (1 = thường), độ ổn định 0–1 (thấp = biểu cảm hơn). */
export interface SpeechOptions {
  speed?: number
  stability?: number
}

/** Kẹp tùy chọn vào khoảng ElevenLabs cho phép; bỏ giá trị mặc định. */
export function cleanSpeechOptions(options: SpeechOptions = {}): Required<SpeechOptions> {
  const clamp = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
  return {
    speed: Math.round(clamp(options.speed, 0.7, 1.2, 1) * 100) / 100,
    stability: Math.round(clamp(options.stability, 0, 1, 0.5) * 100) / 100,
  }
}

export async function textToSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  options: SpeechOptions = {},
): Promise<Buffer> {
  const { speed, stability } = cleanSpeechOptions(options)
  const response = await fetchImpl(
    `${elevenLabsBaseUrl()}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        // Mặc định: để giọng dùng cài đặt riêng của nó.
        ...(speed !== 1 || stability !== 0.5
          ? { voice_settings: { stability, similarity_boost: 0.75, speed } }
          : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    },
  )
  if (!response.ok) throw await elevenLabsError(response)
  return Buffer.from(await response.arrayBuffer())
}
