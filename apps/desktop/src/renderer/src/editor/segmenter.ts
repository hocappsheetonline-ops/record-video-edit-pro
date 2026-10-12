import type { AnyCanvas, Ctx } from './draw'

/**
 * Tách người khỏi phông (AI, MediaPipe selfie segmenter) cho webcam và video meme. Chạy trên CPU,
 * từng ảnh một (không phụ thuộc thứ tự thời gian) nên xem trước và xuất ra cho cùng kết quả.
 * File wasm và model được main phục vụ qua lumora-media://ai/.
 */
export interface PersonSegmenter {
  /**
   * Mặt nạ người của một khung hình: canvas nhỏ (cạnh dài ≤ 256) cùng tỉ lệ với nguồn, điểm ảnh
   * trắng với độ trong suốt = độ tin là người. Null nếu không xử lý được.
   */
  segment(source: CanvasImageSource, width: number, height: number): AnyCanvas | null
  /** AI đã gặp lỗi khi chạy (máy không hỗ trợ): từ đó luôn trả null. */
  readonly failed: boolean
}

const AI_BASE = 'lumora-media://ai'
/** Cạnh dài của ảnh đưa vào model (model selfie_segmenter dùng 256×256). */
const INPUT = 256

function canvasOf(width: number, height: number): AnyCanvas {
  return typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height })
}

let loading: Promise<PersonSegmenter | null> | null = null

/** Nạp AI xóa phông một lần; null nếu máy không chạy được (thiếu WebAssembly…). */
export function loadSegmenter(): Promise<PersonSegmenter | null> {
  loading ??= (async () => {
    try {
      const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
      const segmenter = await ImageSegmenter.createFromOptions(
        {
          wasmLoaderPath: `${AI_BASE}/vision_wasm_internal.js`,
          wasmBinaryPath: `${AI_BASE}/vision_wasm_internal.wasm`,
        },
        {
          baseOptions: { modelAssetPath: `${AI_BASE}/selfie_segmenter.tflite`, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        },
      )
      let failed = false
      const run = (source: CanvasImageSource, width: number, height: number): AnyCanvas | null => {
        if (width <= 0 || height <= 0) return null
        const scale = INPUT / Math.max(width, height)
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        // Canvas mới mỗi lần: một nguồn khác gốc (không đọc được điểm ảnh) không làm hỏng lần sau.
        const input = canvasOf(w, h)
        const ictx = input.getContext('2d', { willReadFrequently: true }) as Ctx | null
        if (!ictx) return null
        ictx.drawImage(source, 0, 0, w, h)
        let pixels: ImageData
        try {
          pixels = ictx.getImageData(0, 0, w, h)
        } catch {
          return null
        }
        // Đưa điểm ảnh thô (ImageData): MediaPipe xử lý hoàn toàn trên CPU, không cần WebGL.
        const result = segmenter.segment(pixels)
        try {
          const mask = result.confidenceMasks?.[0]
          if (!mask) return null
          const values = mask.getAsFloat32Array()
          // Mỗi lần một canvas mới: webcam và nhiều video meme cùng khung không ghi đè nhau.
          const output = canvasOf(w, h)
          const octx = output.getContext('2d') as Ctx | null
          if (!octx) return null
          const image = octx.createImageData(w, h)
          for (let i = 0; i < w * h; i++) {
            const o = i * 4
            image.data[o] = 255
            image.data[o + 1] = 255
            image.data[o + 2] = 255
            image.data[o + 3] = Math.round(Math.min(1, Math.max(0, values[i] ?? 0)) * 255)
          }
          octx.putImageData(image, 0, 0)
          return output
        } finally {
          result.close()
        }
      }
      return {
        get failed() {
          return failed
        },
        segment(source, width, height) {
          if (failed) return null
          try {
            return run(source, width, height)
          } catch (error) {
            // Lỗi của MediaPipe (thiếu WebGL…): tắt hẳn để không làm hỏng xem trước / xuất video.
            console.warn('ai background failed', error)
            failed = true
            return null
          }
        },
      }
    } catch (error) {
      console.warn('ai background unavailable', error)
      return null
    }
  })()
  return loading
}
