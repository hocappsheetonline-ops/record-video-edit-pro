import { parseDestinations } from '@lumora/core'
import type { LiveConfig } from '@shared/ipc'

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  destinations: [],
  resolution: 720,
  videoBitrate: 4500,
  recordLocally: true,
  publicUrl: '',
  youtubeVideoId: '',
  facebookVideoId: '',
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parseLiveConfig(input: unknown): LiveConfig {
  const r = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const bitrate =
    typeof r.videoBitrate === 'number' && Number.isFinite(r.videoBitrate)
      ? r.videoBitrate
      : DEFAULT_LIVE_CONFIG.videoBitrate
  const publicUrl = str(r.publicUrl, 200)
  return {
    destinations: parseDestinations(r.destinations).slice(0, 10),
    resolution: r.resolution === 1080 ? 1080 : 720,
    videoBitrate: Math.round(Math.min(12_000, Math.max(800, bitrate))),
    recordLocally: r.recordLocally !== false,
    publicUrl: /^https?:\/\/\S+$/i.test(publicUrl) ? publicUrl : '',
    youtubeVideoId: str(r.youtubeVideoId, 64).replace(/[^\w-]/g, ''),
    facebookVideoId: str(r.facebookVideoId, 64).replace(/[^\w]/g, ''),
  }
}
