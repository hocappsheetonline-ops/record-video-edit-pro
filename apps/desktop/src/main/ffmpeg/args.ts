import type { Rect } from '@lumora/core'

export type CaptureBackend = 'ddagrab' | 'gdigrab' | 'x11grab'
export type VideoEncoder = 'h264_nvenc' | 'h264_amf' | 'h264_qsv' | 'libx264'

/** Thứ tự ưu tiên: mã hóa bằng card đồ họa trước, CPU (libx264) sau cùng. */
export const ENCODER_PRIORITY: readonly VideoEncoder[] = [
  'h264_nvenc',
  'h264_amf',
  'h264_qsv',
  'libx264',
]

export interface ScreenCaptureSpec {
  backend: CaptureBackend
  encoder: VideoEncoder
  fps: number
  /**
   * Vùng cần quay, pixel vật lý.
   * - ddagrab: tương đối với góc trên-trái của màn hình (output) được chọn.
   * - gdigrab, x11grab: tọa độ trên toàn màn hình ảo.
   */
  rect: Rect
  /** Chỉ số màn hình DXGI (ddagrab). */
  outputIdx?: number
  /** Tên màn hình X11, ví dụ ":0" (x11grab). */
  x11Display?: string
}

export type CaptureOutput = { kind: 'file'; path: string } | { kind: 'null'; frames: number }

function inputArgs(spec: ScreenCaptureSpec): string[] {
  const { x, y, width, height } = spec.rect
  switch (spec.backend) {
    case 'ddagrab': {
      const opts = [
        `output_idx=${spec.outputIdx ?? 0}`,
        `framerate=${spec.fps}`,
        'draw_mouse=0',
        `offset_x=${x}`,
        `offset_y=${y}`,
        `video_size=${width}x${height}`,
      ]
      return ['-f', 'lavfi', '-i', `ddagrab=${opts.join(':')}`]
    }
    case 'gdigrab':
      return [
        '-f',
        'gdigrab',
        '-thread_queue_size',
        '512',
        '-framerate',
        String(spec.fps),
        '-draw_mouse',
        '0',
        '-offset_x',
        String(x),
        '-offset_y',
        String(y),
        '-video_size',
        `${width}x${height}`,
        '-i',
        'desktop',
      ]
    case 'x11grab':
      return [
        '-f',
        'x11grab',
        '-thread_queue_size',
        '512',
        '-framerate',
        String(spec.fps),
        '-draw_mouse',
        '0',
        '-video_size',
        `${width}x${height}`,
        '-i',
        `${spec.x11Display ?? ':0'}.0+${x},${y}`,
      ]
  }
}

/**
 * Bộ lọc chuyển khung hình sang định dạng bộ mã hóa nhận được.
 * ddagrab trả về texture trên GPU (D3D11): NVENC/AMF nhận trực tiếp, QSV cần ánh xạ,
 * còn libx264 phải tải khung hình về RAM.
 */
function filterArgs(spec: ScreenCaptureSpec): string[] {
  if (spec.backend !== 'ddagrab') return ['-pix_fmt', 'yuv420p']
  switch (spec.encoder) {
    case 'h264_nvenc':
    case 'h264_amf':
      return []
    case 'h264_qsv':
      return ['-vf', 'hwmap=derive_device=qsv,format=qsv']
    case 'libx264':
      return ['-vf', 'hwdownload,format=bgra', '-pix_fmt', 'yuv420p']
  }
}

function encoderArgs(encoder: VideoEncoder): string[] {
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0']
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '20']
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '20']
    case 'libx264':
      return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20']
  }
}

/**
 * Tạo tham số dòng lệnh ffmpeg để quay màn hình không kèm con trỏ chuột.
 * Ghi ra Matroska (.mkv) vì file vẫn đọc được nếu app bị tắt đột ngột giữa chừng.
 */
export function buildScreenCaptureArgs(spec: ScreenCaptureSpec, output: CaptureOutput): string[] {
  const head = ['-hide_banner', '-loglevel', 'info']
  const gop = ['-g', String(spec.fps * 2)]
  const tail =
    output.kind === 'file'
      ? ['-an', '-f', 'matroska', '-y', output.path]
      : ['-an', '-frames:v', String(output.frames), '-f', 'null', '-']
  return [
    ...head,
    ...inputArgs(spec),
    ...filterArgs(spec),
    ...encoderArgs(spec.encoder),
    ...gop,
    ...tail,
  ]
}

/** Ghi lại container (không mã hóa lại) để file WebM từ MediaRecorder có thời lượng và tua được. */
export function buildRemuxArgs(input: string, output: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-i', input, '-c', 'copy', '-y', output]
}

/** Chọn một khung hình đại diện trong 30 khung đầu làm ảnh thu nhỏ. */
export function buildThumbnailArgs(input: string, output: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-vf',
    'thumbnail=n=30,scale=480:-2',
    '-frames:v',
    '1',
    '-q:v',
    '4',
    '-y',
    output,
  ]
}

/** Thử mở một màn hình DXGI để biết nó có tồn tại không và độ phân giải bao nhiêu. */
export function buildDdagrabProbeArgs(outputIdx: number): string[] {
  return [
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    `ddagrab=output_idx=${outputIdx}:framerate=5:draw_mouse=0`,
    '-frames:v',
    '1',
    '-f',
    'null',
    '-',
  ]
}
