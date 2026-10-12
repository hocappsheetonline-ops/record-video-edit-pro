import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { redactUrl } from '@lumora/core'
import { ffmpegPath } from '../ffmpeg/binary'

export interface LiveStats {
  /** Số giây đã phát. */
  seconds: number
  /** kbit/s */
  bitrate: number
  fps: number
}

export type DestinationState = 'connecting' | 'live' | 'error'

export interface StreamerEvents {
  onStats(stats: LiveStats): void
  onDestination(id: string, state: DestinationState, message?: string): void
  onExit(code: number | null, stderrTail: string): void
}

const FRAME_RE = /frame=\s*(\d+)\s+fps=\s*([\d.]+)/
const TIME_RE = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/
const BITRATE_RE = /bitrate=\s*([\d.]+)kbits/

/**
 * Đọc một dòng thống kê của ffmpeg. Với muxer `tee`, ffmpeg ghi `time=N/A bitrate=N/A`,
 * nên thời gian được tính từ số khung hình đã mã hóa.
 */
export function parseStats(line: string, outputFps: number): LiveStats | null {
  const frame = FRAME_RE.exec(line)
  if (!frame) return null
  const time = TIME_RE.exec(line)
  const bitrate = BITRATE_RE.exec(line)
  return {
    seconds: time
      ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3])
      : Number(frame[1]) / Math.max(1, outputFps),
    bitrate: bitrate ? Number(bitrate[1]) : 0,
    fps: Number(frame[2]),
  }
}

/**
 * Tìm đích phát bị lỗi trong một dòng log của ffmpeg (ffmpeg in URL kèm lỗi kết nối/ghi).
 * Trả về chỉ số đích hoặc -1.
 */
export function failedDestination(line: string, urls: readonly string[]): number {
  if (!/(error|failed|refused|timed out|broken pipe|unable|not found|denied)/i.test(line)) return -1
  return urls.findIndex(
    (url) => line.includes(url) || line.includes(url.replace(/^rtmps?:\/\//, '')),
  )
}

/**
 * Tiến trình ffmpeg phát trực tiếp: nhận dữ liệu WebM qua stdin.
 * Dừng bằng cách đóng stdin để ffmpeg kết thúc gọn gàng (file ghi lại không bị hỏng).
 */
export class LiveStreamer {
  private child: ChildProcessByStdio<Writable, null, Readable> | null = null
  private stderr = ''
  private exited: Promise<void> = Promise.resolve()
  private live = false

  constructor(
    private readonly destinations: readonly { id: string; url: string }[],
    private readonly events: StreamerEvents,
    private readonly outputFps = 30,
  ) {}

  start(args: string[]): void {
    const child = spawn(ffmpegPath(), args, {
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    for (const d of this.destinations) this.events.onDestination(d.id, 'connecting')
    let pending = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-8000)
      pending += chunk
      const lines = pending.split(/\r\n|\r|\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) this.handleLine(line)
    })
    child.stdin.on('error', () => undefined)
    this.exited = new Promise((resolve) => {
      child.on('close', (code) => {
        this.child = null
        this.events.onExit(code, redactAll(this.stderr, this.destinations))
        resolve()
      })
      child.on('error', () => resolve())
    })
  }

  private handleLine(line: string) {
    const stats = parseStats(line, this.outputFps)
    if (stats) {
      if (!this.live && stats.seconds > 0) {
        this.live = true
        for (const d of this.destinations) this.events.onDestination(d.id, 'live')
      }
      this.events.onStats(stats)
      return
    }
    const index = failedDestination(
      line,
      this.destinations.map((d) => d.url),
    )
    if (index >= 0)
      this.events.onDestination(
        this.destinations[index]!.id,
        'error',
        redactAll(line, this.destinations),
      )
  }

  get running(): boolean {
    return this.child !== null
  }

  write(data: Uint8Array): Promise<void> {
    const child = this.child
    if (!child || child.stdin.destroyed) return Promise.resolve()
    return new Promise((resolve) => {
      if (child.stdin.write(data)) return resolve()
      child.stdin.once('drain', () => resolve())
      child.once('close', () => resolve())
    })
  }

  async stop(timeoutMs = 15_000): Promise<void> {
    const child = this.child
    if (!child) return
    child.stdin.end()
    const timer = setTimeout(() => child.kill(), timeoutMs)
    await this.exited
    clearTimeout(timer)
  }
}

function redactAll(text: string, destinations: readonly { url: string }[]): string {
  return destinations.reduce((t, d) => t.split(d.url).join(redactUrl(d.url)), text)
}
