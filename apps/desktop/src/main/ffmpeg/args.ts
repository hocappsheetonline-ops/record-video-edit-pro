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

/** atempo chỉ nhận 0.5..100 mỗi lần, nên tốc độ chậm hơn 0.5 phải ghép nhiều bộ lọc. */
export function atempoChain(speed: number): string[] {
  const filters: string[] = []
  let rest = speed
  while (rest < 0.5) {
    filters.push('atempo=0.5')
    rest /= 0.5
  }
  while (rest > 100) {
    filters.push('atempo=100')
    rest /= 100
  }
  if (Math.abs(rest - 1) > 1e-6) filters.push(`atempo=${Number(rest.toFixed(6))}`)
  return filters
}

export interface MuxAudioPiece {
  /** Đường dẫn đầy đủ tới file âm thanh. */
  path: string
  mediaStart: number
  duration: number
  outputStart: number
  speed: number
  volume: number
  /** Âm lượng tăng dần lúc đầu / giảm dần lúc cuối (giây). */
  fadeIn?: number
  fadeOut?: number
  /** Lặp lại file (nhạc nền ngắn hơn đoạn cần phát). */
  loop?: boolean
}

const sec = (n: number) => Number(n.toFixed(6))

/**
 * Ghép video đã dựng (chưa có tiếng) với âm thanh: cắt từng mảnh, đổi tốc độ, chỉnh âm lượng,
 * đặt đúng vị trí rồi trộn lại. Video được chép nguyên, không mã hóa lại.
 */
export function buildExportMuxArgs(options: {
  video: string
  pieces: readonly MuxAudioPiece[]
  durationS: number
  output: string
}): string[] {
  const { video, pieces, durationS, output } = options
  const head = ['-hide_banner', '-loglevel', 'error', '-y', '-i', video]
  const tail = ['-movflags', '+faststart', '-t', String(sec(durationS)), output]
  if (pieces.length === 0) return [...head, '-map', '0:v', '-c:v', 'copy', '-an', ...tail]

  const files = [...new Set(pieces.map((p) => p.path))]
  // File cần lặp được mở với -stream_loop -1; atrim phía sau giới hạn độ dài.
  const inputs = files.flatMap((f) =>
    pieces.some((p) => p.path === f && p.loop) ? ['-stream_loop', '-1', '-i', f] : ['-i', f],
  )
  const filters: string[] = []
  const labels = new Map<string, string[]>()
  files.forEach((file, i) => {
    const count = pieces.filter((p) => p.path === file).length
    const outs = Array.from({ length: count }, (_, k) => `f${i}_${k}`)
    labels.set(file, outs)
    filters.push(
      count === 1
        ? `[${i + 1}:a]anull[${outs[0]}]`
        : `[${i + 1}:a]asplit=${count}${outs.map((o) => `[${o}]`).join('')}`,
    )
  })
  const used = new Map<string, number>()
  const mixed = pieces.map((p, k) => {
    const n = used.get(p.path) ?? 0
    used.set(p.path, n + 1)
    const source = labels.get(p.path)![n]!
    const delayMs = Math.round(p.outputStart * 1000)
    const chain = [
      `atrim=start=${sec(p.mediaStart)}:end=${sec(p.mediaStart + p.duration)}`,
      'asetpts=PTS-STARTPTS',
      ...atempoChain(p.speed),
      `volume=${sec(p.volume)}`,
      ...(p.fadeIn ? [`afade=t=in:st=0:d=${sec(p.fadeIn)}`] : []),
      ...(p.fadeOut
        ? [
            `afade=t=out:st=${sec(Math.max(0, p.duration / p.speed - p.fadeOut))}:d=${sec(p.fadeOut)}`,
          ]
        : []),
      `adelay=${delayMs}:all=1`,
    ]
    filters.push(`[${source}]${chain.join(',')}[p${k}]`)
    return `[p${k}]`
  })
  filters.push(
    // apad chỉ đệm im lặng tới đúng độ dài video: `apad` không giới hạn có thể làm FFmpeg chạy
    // mãi (bỏ qua -t, ngốn RAM) khi hai mảnh liền nhau cùng lấy từ một file.
    // asetpts=N/SR/TB đánh lại mốc thời gian liền mạch: mảnh bị cắt đầu (atrim start > 0) làm amix
    // ra mốc thời gian lệch, trình ghép MP4 bỏ hết phần tiếng phía sau (video xuất bị câm).
    `${mixed.join('')}amix=inputs=${mixed.length}:duration=longest:normalize=0,apad=whole_dur=${sec(durationS)},asetpts=N/SR/TB[aout]`,
  )
  return [
    ...head,
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    ...tail,
  ]
}

/** Đổi MP4 sang GIF với bảng màu tối ưu (đẹp hơn nhiều so với bảng màu mặc định). */
export function buildGifArgs(input: string, output: string, width: number, fps: number): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-vf',
    `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    '-loop',
    '0',
    output,
  ]
}

/**
 * Trộn các mảnh âm thanh thành một file MP3 mono 16 kHz (gọn nhẹ để gửi đi nhận dạng giọng nói).
 * Dùng nền im lặng đủ dài để thời gian trong file khớp đúng thời gian nguồn.
 */
export function buildSpeechAudioArgs(options: {
  pieces: readonly MuxAudioPiece[]
  durationS: number
  output: string
  /** `pcm`: PCM 16-bit mono 8 kHz thô (để vẽ dạng sóng), mặc định MP3 16 kHz. */
  format?: 'mp3' | 'pcm'
}): string[] {
  const { pieces, durationS, output } = options
  const pcm = options.format === 'pcm'
  const files = [...new Set(pieces.map((p) => p.path))]
  const filters: string[] = []
  const labels = new Map<string, string[]>()
  files.forEach((file, i) => {
    const count = pieces.filter((p) => p.path === file).length
    const outs = Array.from({ length: count }, (_, k) => `f${i}_${k}`)
    labels.set(file, outs)
    filters.push(
      count === 1
        ? `[${i + 1}:a]anull[${outs[0]}]`
        : `[${i + 1}:a]asplit=${count}${outs.map((o) => `[${o}]`).join('')}`,
    )
  })
  const used = new Map<string, number>()
  const mixed = ['[0:a]']
  pieces.forEach((p, k) => {
    const n = used.get(p.path) ?? 0
    used.set(p.path, n + 1)
    filters.push(
      `[${labels.get(p.path)![n]}]atrim=start=${sec(p.mediaStart)}:end=${sec(p.mediaStart + p.duration)},asetpts=PTS-STARTPTS,adelay=${Math.round(p.outputStart * 1000)}:all=1[p${k}]`,
    )
    mixed.push(`[p${k}]`)
  })
  filters.push(`${mixed.join('')}amix=inputs=${mixed.length}:duration=first:normalize=0[aout]`)
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-t',
    String(sec(durationS)),
    '-i',
    'anullsrc=r=16000:cl=mono',
    ...files.flatMap((f) => ['-i', f]),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[aout]',
    '-ac',
    '1',
    '-ar',
    pcm ? '8000' : '16000',
    ...(pcm ? ['-f', 's16le', '-c:a', 'pcm_s16le'] : ['-c:a', 'libmp3lame', '-b:a', '64k']),
    output,
  ]
}

export type LiveOutput = { kind: 'rtmp'; url: string } | { kind: 'file'; path: string }

export interface LiveEncodeOptions {
  encoder: VideoEncoder
  fps: number
  /** kbps */
  videoBitrate: number
  /** kbps */
  audioBitrate: number
}

/** Thoát ký tự đặc biệt trong tên đầu ra của muxer tee. */
export function escapeTee(value: string): string {
  return value.replace(/[\\|[\]]/g, (ch) => `\\${ch}`)
}

function liveVideoArgs(o: LiveEncodeOptions): string[] {
  const rate = `${o.videoBitrate}k`
  const common = [
    '-b:v',
    rate,
    '-maxrate',
    rate,
    '-bufsize',
    `${o.videoBitrate * 2}k`,
    '-g',
    String(o.fps * 2),
    '-r',
    String(o.fps),
  ]
  switch (o.encoder) {
    case 'h264_nvenc':
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p4',
        '-tune',
        'll',
        '-rc',
        'cbr',
        ...common,
        '-pix_fmt',
        'yuv420p',
      ]
    case 'h264_amf':
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'speed',
        '-rc',
        'cbr',
        ...common,
        '-pix_fmt',
        'yuv420p',
      ]
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', ...common, '-pix_fmt', 'nv12']
    case 'libx264':
      return [
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-tune',
        'zerolatency',
        ...common,
        '-keyint_min',
        String(o.fps * 2),
        '-sc_threshold',
        '0',
        '-pix_fmt',
        'yuv420p',
      ]
  }
}

/**
 * Phát trực tiếp: nhận WebM (hình chương trình + âm thanh đã trộn) từ stdin, mã hóa H.264/AAC đúng chuẩn
 * RTMP rồi đẩy cùng lúc tới mọi đích bằng muxer `tee`. `onfail=ignore`: một đích lỗi không làm dừng các đích khác.
 */
export function buildLiveArgs(
  outputs: readonly LiveOutput[],
  options: LiveEncodeOptions,
): string[] {
  if (outputs.length === 0) throw new Error('Chưa có đích phát nào')
  const slaves = outputs.map((o) =>
    o.kind === 'rtmp'
      ? `[f=flv:onfail=ignore:flvflags=no_duration_filesize]${escapeTee(o.url)}`
      : `[f=matroska]${escapeTee(o.path)}`,
  )
  return [
    '-hide_banner',
    '-loglevel',
    'info',
    '-stats_period',
    '1',
    '-fflags',
    '+genpts',
    '-thread_queue_size',
    '1024',
    '-i',
    'pipe:0',
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...liveVideoArgs(options),
    '-c:a',
    'aac',
    '-b:a',
    `${options.audioBitrate}k`,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-flags',
    '+global_header',
    '-f',
    'tee',
    slaves.join('|'),
  ]
}
