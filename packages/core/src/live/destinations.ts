export const PLATFORMS = ['youtube', 'facebook', 'tiktok', 'twitch', 'custom'] as const
export type Platform = (typeof PLATFORMS)[number]

/** Địa chỉ máy chủ RTMP mặc định của từng nền tảng (TikTok và tùy chỉnh do người dùng nhập). */
export const PLATFORM_SERVERS: Record<Platform, string> = {
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
  tiktok: '',
  twitch: 'rtmp://live.twitch.tv/app',
  custom: '',
}

export interface Destination {
  id: string
  platform: Platform
  name: string
  server: string
  enabled: boolean
}

export function isValidServer(server: string): boolean {
  return /^rtmps?:\/\/[^\s/]+(\/\S*)?$/i.test(server.trim())
}

/** Ghép địa chỉ máy chủ và stream key thành URL phát. */
export function streamUrl(server: string, key: string): string {
  const base = server.trim().replace(/\/+$/, '')
  const k = key.trim().replace(/^\/+/, '')
  return k ? `${base}/${k}` : base
}

export function parseDestinations(input: unknown): Destination[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((d, i): Destination[] => {
    if (typeof d !== 'object' || d === null) return []
    const r = d as Record<string, unknown>
    const platform = PLATFORMS.includes(r.platform as Platform)
      ? (r.platform as Platform)
      : 'custom'
    const server = typeof r.server === 'string' ? r.server.trim() : PLATFORM_SERVERS[platform]
    if (!isValidServer(server)) return []
    return [
      {
        id: typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : `d${i}`,
        platform,
        name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : platform,
        server,
        enabled: r.enabled !== false,
      },
    ]
  })
}

/** Ẩn stream key khi hiển thị log/lỗi. */
export function redactUrl(url: string): string {
  return url.replace(
    /^(rtmps?:\/\/[^/]+\/(?:[^/]+\/)*)([^/]+)$/i,
    (_m, base: string, key: string) => `${base}${key.slice(0, 3)}•••`,
  )
}
