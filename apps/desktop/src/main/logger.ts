import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { IpcMain } from 'electron'
import { redactUrl } from '@lumora/core'

export type LogLevel = 'info' | 'warn' | 'error'

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[\w-]{6,}/g, // Claude
  /\b(?:sk|el|xi)_[\w-]{12,}/g, // ElevenLabs
  /AIza[\w-]{10,}/g, // Google / YouTube
  /\bEAA[\w-]{20,}/g, // Facebook access token
]

/** Che API key, token và stream key trước khi ghi ra file nhật ký. */
export function redactSecrets(text: string): string {
  let out = text.replace(/rtmps?:\/\/[^\s'"]+/g, (url) => redactUrl(url))
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (m) => `${m.slice(0, 4)}•••`)
  return out
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  return String(error)
}

/**
 * Nhật ký lỗi trong `%APPDATA%\Lumora\logs\main.log`. Khi file lớn hơn giới hạn, đổi tên thành
 * `main.old.log` (chỉ giữ một bản cũ). Mọi dòng đều được che thông tin bí mật.
 */
export class Logger {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    readonly file: string,
    private readonly maxBytes = 5 * 1024 * 1024,
    private readonly now: () => Date = () => new Date(),
  ) {}

  info(scope: string, message: string) {
    this.write('info', scope, message)
  }

  warn(scope: string, message: string) {
    this.write('warn', scope, message)
  }

  error(scope: string, error: unknown) {
    this.write('error', scope, formatError(error))
  }

  write(level: LogLevel, scope: string, message: string): Promise<void> {
    const line = `${this.now().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${redactSecrets(message)}\n`
    this.queue = this.queue.then(() => this.append(line)).catch(() => undefined)
    return this.queue
  }

  /** Chờ mọi dòng đang chờ được ghi xong. */
  flush(): Promise<void> {
    return this.queue
  }

  private async append(line: string) {
    await mkdir(dirname(this.file), { recursive: true })
    const size = await stat(this.file).then(
      (s) => s.size,
      () => 0,
    )
    if (size > 0 && size + Buffer.byteLength(line) > this.maxBytes) {
      await rename(this.file, this.file.replace(/\.log$/, '.old.log'))
    }
    await appendFile(this.file, line, 'utf8')
  }
}

/** Bọc ipcMain: lỗi của mọi handler được ghi nhật ký rồi ném lại cho giao diện như cũ. */
export function loggingIpc(
  ipc: Pick<IpcMain, 'handle'>,
  logger: Pick<Logger, 'error'>,
): Pick<IpcMain, 'handle'> {
  return {
    handle: (channel, listener) =>
      ipc.handle(channel, async (event, ...args: unknown[]) => {
        try {
          return (await listener(event, ...args)) as unknown
        } catch (error) {
          logger.error(`ipc ${channel}`, error)
          throw error
        }
      }),
  }
}
