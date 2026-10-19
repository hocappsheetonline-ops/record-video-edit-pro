import type { MusicTempo } from '@lumora/core'
import type { FetchLike } from '../key-validation'
import { jamendoBaseUrl } from './endpoints'
import { ContentError, getJson, int, isObj, str } from './types'

/**
 * Jamendo (https://developer.jamendo.com): kho nhạc độc lập phát hành theo giấy phép Creative
 * Commons; API v3.0 miễn phí (cần `client_id` của ứng dụng). App chỉ lấy bài có giấy phép cho
 * phép dùng thương mại (không NC) và cho tải về; mọi bài CC đều cần ghi nguồn (tên bài, nghệ
 * sĩ, giấy phép) — app lưu dòng ghi nguồn cùng bài trong kho nhạc để người dùng dán vào mô tả.
 */
export interface MusicCandidate {
  id: string
  name: string
  artist: string
  durationMs: number
  /** Link tải MP3 (của Jamendo, không chứa key). */
  downloadUrl: string
  /** Giấy phép Creative Commons, ví dụ "CC BY 3.0". */
  license: string
  licenseUrl: string
  /** Trang bài hát trên Jamendo (để ghi nguồn). */
  pageUrl: string
  tags: string[]
  /** Dòng ghi nguồn sẵn để dán vào mô tả video. */
  credit: string
}

export interface MusicQuery {
  /** Vài từ tiếng Anh về tâm trạng / thể loại ("upbeat corporate", "calm lofi"). */
  mood: string
  tempo: MusicTempo
  /** Thời lượng video (ms) để ưu tiên bài dài tương đương. */
  durationMs: number
  /** Chỉ lấy nhạc không lời (mặc định: có, vì nhạc nền dưới giọng nói). */
  instrumental?: boolean
  limit?: number
  fetchImpl?: FetchLike
}

/** Jamendo `speed`: verylow / low / medium / high / veryhigh. */
const SPEED: Record<MusicTempo, string> = {
  slow: 'low+verylow',
  medium: 'medium',
  fast: 'high+veryhigh',
}

/** Từ tâm trạng → thẻ Jamendo (fuzzytags); từ lạ vẫn được gửi nguyên. */
const TAG_SYNONYMS: [RegExp, string][] = [
  [/\b(upbeat|energetic|fun|cheerful|positive)\b/i, 'happy'],
  [/\b(calm|chill|relax(ed|ing)?|soft|gentle|ambient)\b/i, 'relaxing'],
  [/\b(corporate|business|tech(nology)?|presentation|tutorial)\b/i, 'corporate'],
  [/\b(epic|cinematic|trailer|dramatic)\b/i, 'epic'],
  [/\b(lo-?fi|hip ?hop|beats?)\b/i, 'lounge'],
  [/\b(acoustic|guitar|folk|warm)\b/i, 'acoustic'],
  [/\b(electronic|edm|dance|synth|house)\b/i, 'electronic'],
  [/\b(piano|classical)\b/i, 'piano'],
  [/\b(rock|guitar riff)\b/i, 'rock'],
  [/\b(jazz|swing)\b/i, 'jazz'],
  [/\b(pop)\b/i, 'pop'],
  [/\b(sad|melancholic|emotional)\b/i, 'sad'],
  [/\b(dark|tense|suspense)\b/i, 'dark'],
]

/** Thẻ Jamendo từ câu tâm trạng (tối đa 4, không trùng). */
export function moodTags(mood: string): string[] {
  const out: string[] = []
  const push = (t: string) => {
    if (!out.includes(t) && out.length < 4) out.push(t)
  }
  for (const [re, tag] of TAG_SYNONYMS) if (re.test(mood)) push(tag)
  for (const word of mood.toLowerCase().split(/[\s,]+/)) {
    if (/^[a-z][a-z-]{2,}$/.test(word) && !/^(and|the|with|music|background|for|a)$/.test(word))
      push(word)
  }
  return out
}

function licenseName(url: string): string {
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/i.exec(url)
  if (m) return `CC ${m[1]!.toUpperCase()} ${m[2]}`
  if (/publicdomain\/zero/i.test(url)) return 'CC0'
  return 'Creative Commons'
}

/**
 * Tìm bài trên Jamendo theo tâm trạng + nhịp; chỉ bài cho tải về và giấy phép cho phép dùng
 * thương mại (`ccnc=false`). Kết quả theo độ phổ biến, bài dài gần bằng video được xếp trước.
 */
export async function searchJamendo(
  clientId: string,
  query: MusicQuery,
): Promise<MusicCandidate[]> {
  const tags = moodTags(query.mood)
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: String(query.limit ?? 20),
    order: 'popularity_total',
    include: 'musicinfo+licenses',
    audioformat: 'mp32',
    speed: SPEED[query.tempo],
    ccnc: 'false',
    vocalinstrumental: query.instrumental === false ? 'vocal' : 'instrumental',
  })
  if (tags.length > 0) params.set('fuzzytags', tags.join('+'))
  // Bài dài 1-10 phút: đủ để lặp dưới video, không phải nhạc hiệu vài giây.
  params.set('durationbetween', '60_600')
  const data = await getJson(`${jamendoBaseUrl()}/v3.0/tracks/?${params}`, query.fetchImpl ?? fetch)
  if (!isObj(data)) throw new ContentError('bad_response')
  const headers = isObj(data.headers) ? data.headers : {}
  if (headers.status === 'failed') {
    // Jamendo trả 200 kèm mã lỗi: 2 = client_id sai.
    if (int(headers.code) === 2 || /client/i.test(str(headers.error_message)))
      throw new ContentError('key_invalid')
    throw new ContentError('bad_response')
  }
  const results = Array.isArray(data.results) ? data.results : []
  const items = results.flatMap((r): MusicCandidate[] => {
    if (!isObj(r)) return []
    const downloadUrl = str(r.audiodownload) || str(r.audio)
    if (!/^https?:\/\//.test(downloadUrl) || r.audiodownload_allowed === false) return []
    const licenseUrl = str(r.license_ccurl)
    // Không rõ giấy phép hoặc cấm dùng thương mại (NC): bỏ.
    if (!licenseUrl || /\/by-nc|-nc-?/i.test(licenseUrl)) return []
    const id = String(r.id ?? '')
    const name = str(r.name).trim()
    const artist = str(r.artist_name).trim()
    if (!id || !name) return []
    const info = isObj(r.musicinfo) ? r.musicinfo : {}
    const tagInfo = isObj(info.tags) ? info.tags : {}
    const tagList = (['genres', 'vartags'] as const).flatMap((k) =>
      Array.isArray(tagInfo[k])
        ? (tagInfo[k] as unknown[]).filter((t): t is string => typeof t === 'string')
        : [],
    )
    const license = licenseName(licenseUrl)
    return [
      {
        id,
        name,
        artist,
        durationMs: int(r.duration) * 1000,
        downloadUrl,
        license,
        licenseUrl,
        pageUrl: str(r.shareurl),
        tags: tagList.slice(0, 8),
        credit: `"${name}" by ${artist || 'Unknown'} — ${license} (Jamendo${r.shareurl ? `, ${str(r.shareurl)}` : ''})`,
      },
    ]
  })
  return rankByDuration(items, query.durationMs)
}

/** Giữ thứ tự phổ biến nhưng đẩy bài quá ngắn so với video xuống dưới (nhạc lặp lại nghe lộ). */
export function rankByDuration(items: MusicCandidate[], durationMs: number): MusicCandidate[] {
  if (durationMs <= 0) return items
  const fits = (c: MusicCandidate) => c.durationMs >= Math.min(durationMs, 120_000) * 0.8
  return [...items.filter(fits), ...items.filter((c) => !fits(c))]
}
