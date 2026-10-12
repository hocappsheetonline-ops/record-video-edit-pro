import type { Size } from '@lumora/core'

/** Lấy độ phân giải của luồng video đầu vào đầu tiên từ log của ffmpeg. */
export function parseInputResolution(stderr: string): Size | null {
  const inputStart = stderr.indexOf('Input #0')
  const section = inputStart >= 0 ? stderr.slice(inputStart) : stderr
  for (const line of section.split(/\r?\n/)) {
    if (!/Stream #0:\d+.*Video:/.test(line)) continue
    const match = /\b(\d{2,5})x(\d{2,5})\b/.exec(line)
    if (match) return { width: Number(match[1]), height: Number(match[2]) }
  }
  return null
}

/** Lấy thời lượng (ms) từ dòng "Duration: 00:01:02.50" trong log của `ffmpeg -i`. */
export function parseDurationMs(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr)
  if (!match) return null
  const [, h, m, s] = match
  return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000)
}

/** ffmpeg in dòng này khi đã mở xong nguồn quay và bắt đầu ghi. */
export function isCaptureStartedLine(line: string): boolean {
  return line.includes('Press [q] to stop') || /^frame=\s*\d+/.test(line.trim())
}
