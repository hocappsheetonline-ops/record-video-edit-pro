import { execFile, spawn } from 'node:child_process'
import { ffmpegPath } from './binary'
import { isCaptureStartedLine } from './parse'

export interface RunResult {
  code: number | null
  stderr: string
}

/** Chạy ffmpeg tới khi xong (dùng cho dò phần cứng, ghép file, tạo ảnh thu nhỏ). */
export type FfmpegRunner = (args: string[], timeoutMs?: number) => Promise<RunResult>

export const runFfmpeg: FfmpegRunner = (args, timeoutMs = 30_000) =>
  new Promise((resolve) => {
    execFile(
      ffmpegPath(),
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
        resolve({ code, stderr: String(stderr) })
      },
    )
  })

export interface CaptureProcess {
  /** Thời điểm (ms, epoch) ffmpeg bắt đầu ghi khung hình. */
  readonly started: Promise<number>
  /** Dừng ghi một cách an toàn (gửi "q") để file được đóng đúng cách. */
  stop(): Promise<RunResult>
  /** Đăng ký hàm được gọi nếu ffmpeg tự thoát khi chưa được yêu cầu dừng. */
  onUnexpectedExit(listener: (result: RunResult) => void): void
}

export type CaptureLauncher = (args: string[]) => CaptureProcess

const STOP_TIMEOUT_MS = 10_000
const STDERR_TAIL = 8_000

/** Chạy ffmpeg quay màn hình dài hạn, có thể dừng bất cứ lúc nào. */
export const launchCapture: CaptureLauncher = (args) => {
  const child = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
  let stderr = ''
  let stopping = false
  let exitListener: ((result: RunResult) => void) | undefined

  const exited = new Promise<RunResult>((resolve) => {
    child.on('error', (error) => {
      stderr += `\n${error.message}`
      resolve({ code: null, stderr })
    })
    child.on('close', (code) => resolve({ code, stderr }))
  })

  const started = new Promise<number>((resolve, reject) => {
    let pending = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL)
      pending += chunk
      const lines = pending.split(/\r\n|\r|\n/)
      pending = lines.pop() ?? ''
      if (lines.some(isCaptureStartedLine)) resolve(Date.now())
    })
    void exited.then((result) =>
      reject(new Error(`ffmpeg đã thoát (mã ${result.code}): ${result.stderr.slice(-1000)}`)),
    )
  })
  // Tránh cảnh báo "unhandled rejection" khi ffmpeg thoát sau khi đã bắt đầu.
  started.catch(() => undefined)

  void exited.then((result) => {
    if (!stopping) exitListener?.(result)
  })

  return {
    started,
    onUnexpectedExit(listener) {
      exitListener = listener
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return exited
      stopping = true
      child.stdin.write('q')
      child.stdin.end()
      const timer = setTimeout(() => child.kill(), STOP_TIMEOUT_MS)
      const result = await exited
      clearTimeout(timer)
      return result
    },
  }
}
