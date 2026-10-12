import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { Worker } from 'node:worker_threads'
import { ffmpegPath } from '../ffmpeg/binary'

/** Lọc tạp âm AI: biến một file âm thanh thành file đã lọc, kèm các bộ lọc FFmpeg phía sau. */
export interface Denoiser {
  render(input: string, output: string, filters: string[], timeoutMs: number): Promise<void>
}

const RATE = 48_000
/** RNNoise xử lý từng khung 10 ms (480 mẫu ở 48 kHz). */
const FRAME = 480
const FRAME_BYTES = FRAME * 4
/** Gửi sang luồng phụ mỗi lần ít nhất chừng này khung. */
const BATCH = 32

/**
 * Luồng phụ chạy RNNoise (bản WebAssembly của Jitsi, đã tối ưu). Nạp thẳng file .wasm: chỉ cần hai
 * hàm hỗ trợ bộ nhớ của Emscripten. Tên hàm xuất đã bị rút gọn khi build:
 * c = memory, d = khởi tạo, e = malloc, h = rnnoise_create, j = rnnoise_process_frame.
 * Nhận mảng float (-1..1) gồm nhiều khung, lọc tại chỗ rồi trả lại.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const FRAME = ${FRAME}
let memory
const imports = {
  a: {
    a: (size) => {
      const old = memory.buffer.byteLength
      const target = Math.max(size >>> 0, Math.ceil(old * 1.2))
      try {
        memory.grow(Math.ceil((target - old) / 65536))
        return 1
      } catch {
        return 0
      }
    },
    b: (dest, src, num) => new Uint8Array(memory.buffer).copyWithin(dest, src, src + num),
  },
}
const wasm = new WebAssembly.Instance(new WebAssembly.Module(workerData.wasm), imports).exports
memory = wasm.c
wasm.d()
const state = wasm.h(0)
const ptr = wasm.e(FRAME * 4)
parentPort.on('message', (buffer) => {
  const samples = new Float32Array(buffer)
  for (let off = 0; off + FRAME <= samples.length; off += FRAME) {
    let heap = new Float32Array(memory.buffer, ptr, FRAME)
    for (let i = 0; i < FRAME; i++) heap[i] = samples[off + i] * 32768
    wasm.j(state, ptr, ptr)
    heap = new Float32Array(memory.buffer, ptr, FRAME)
    for (let i = 0; i < FRAME; i++) {
      const v = heap[i] / 32768
      samples[off + i] = v > 1 ? 1 : v < -1 ? -1 : v
    }
  }
  parentPort.postMessage(buffer, [buffer])
})
`

/**
 * Lọc tạp âm bằng mạng nơ-ron RNNoise: FFmpeg giải mã ra PCM float mono 48 kHz → RNNoise (luồng
 * phụ, WebAssembly — cùng kết quả trên mọi máy) → FFmpeg mã hóa kèm các bộ lọc còn lại. Chạy theo
 * luồng nên không giữ cả file trong bộ nhớ và không làm đứng tiến trình chính.
 *
 * RNNoise trả kết quả trễ đúng một khung: bỏ khung ra đầu tiên và đẩy thêm một khung im lặng ở cuối
 * để âm thanh không bị lệch và độ dài giữ nguyên từng mẫu.
 */
export class RnnoiseDenoiser implements Denoiser {
  private wasm: Promise<Buffer> | null = null

  constructor(
    private readonly wasmPath: string,
    private readonly binary: () => string = ffmpegPath,
  ) {}

  async render(input: string, output: string, filters: string[], timeoutMs: number) {
    this.wasm ??= readFile(this.wasmPath).catch((error: unknown) => {
      this.wasm = null
      throw error
    })
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { wasm: await this.wasm } })
    const decoder = spawn(
      this.binary(),
      ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-ac', '1'].concat([
        '-ar',
        String(RATE),
        '-f',
        'f32le',
        '-',
      ]),
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    )
    const encoder = spawn(
      this.binary(),
      ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(RATE)]
        .concat(['-ac', '1', '-i', '-'])
        .concat(filters.length ? ['-af', filters.join(',')] : [])
        .concat(['-ar', String(RATE), '-c:a', 'aac', '-b:a', '192k', output]),
      { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true },
    )
    let stderr = ''
    let failure: string | null = null
    const collect = (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000)
    }
    decoder.stderr?.on('data', collect)
    encoder.stderr?.on('data', collect)
    const exited = (child: ChildProcess) =>
      new Promise<number | null>((resolve) => {
        child.on('error', (e) => {
          stderr += `\n${e.message}`
          resolve(null)
        })
        child.on('close', (code) => resolve(code))
      })
    const decoded = exited(decoder)
    const encoded = exited(encoder)
    const stop = (reason: string) => {
      failure ??= reason
      decoder.kill('SIGKILL')
      encoder.kill('SIGKILL')
    }
    encoder.stdin?.on('error', () => stop('encoder closed'))
    const timer = setTimeout(() => stop('timeout'), timeoutMs)

    // Luồng phụ xử lý lần lượt: mỗi lần gửi một gói và chờ đúng gói đó trả về.
    let waiting: { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void } | null = null
    worker.on('message', (b: ArrayBuffer) => waiting?.resolve(b))
    worker.on('error', (e) => {
      stop(e.message)
      waiting?.reject(e)
    })
    const denoise = (samples: ArrayBuffer) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        waiting = { resolve, reject }
        worker.postMessage(samples, [samples])
      })

    let skip = FRAME
    let total = 0
    let written = 0
    const write = async (samples: Float32Array, limit: number) => {
      const from = Math.min(skip, samples.length)
      skip -= from
      const count = Math.max(0, Math.min(samples.length - from, limit - written))
      if (count === 0) return
      written += count
      const bytes = Buffer.from(samples.buffer, samples.byteOffset + from * 4, count * 4)
      if (!encoder.stdin?.write(bytes) && !failure)
        await new Promise<void>((resolve) => {
          encoder.stdin?.once('drain', resolve)
          encoder.once('close', resolve)
        })
    }
    const run = async (bytes: Uint8Array, limit: number) => {
      const copy = new Uint8Array(bytes.length)
      copy.set(bytes)
      await write(new Float32Array(await denoise(copy.buffer)), limit)
    }

    let pending: Buffer = Buffer.alloc(0)
    let chain: Promise<void> = Promise.resolve()
    decoder.stdout?.on('data', (chunk: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
      total += chunk.length
      const n = pending.length - (pending.length % FRAME_BYTES)
      if (n < FRAME_BYTES * BATCH) return
      const batch = pending.subarray(0, n)
      pending = Buffer.from(pending.subarray(n))
      decoder.stdout?.pause()
      chain = chain
        .then(() => run(batch, Infinity))
        .then(() => {
          decoder.stdout?.resume()
        })
        .catch((e: unknown) => stop(String(e)))
    })

    try {
      const decodeCode = await decoded
      await chain
      const samples = Math.floor(total / 4)
      // Phần cuối: bù im lặng cho đủ khung, thêm một khung im lặng để lấy nốt phần bị trễ.
      const rest = pending.subarray(0, pending.length - (pending.length % 4))
      const tail = new Uint8Array(Math.ceil(rest.length / FRAME_BYTES) * FRAME_BYTES + FRAME_BYTES)
      tail.set(rest)
      if (!failure) await run(tail, samples)
      encoder.stdin?.end()
      const encodeCode = await encoded
      if (failure || decodeCode !== 0 || encodeCode !== 0)
        throw new Error(`audio_fx_failed: ${failure ?? ''} ${stderr}`.trim())
    } finally {
      clearTimeout(timer)
      decoder.kill('SIGKILL')
      encoder.kill('SIGKILL')
      await worker.terminate()
    }
  }
}
