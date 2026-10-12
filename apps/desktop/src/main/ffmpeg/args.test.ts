import { describe, expect, it } from 'vitest'
import {
  buildRemuxArgs,
  buildScreenCaptureArgs,
  buildThumbnailArgs,
  type ScreenCaptureSpec,
} from './args'

const rect = { x: 100, y: 50, width: 1280, height: 720 }
const file = { kind: 'file', path: 'C:\\Videos\\seg0-screen.mkv' } as const

describe('buildScreenCaptureArgs', () => {
  it('ddagrab + NVENC: ẩn con trỏ, nhận texture GPU trực tiếp', () => {
    const spec: ScreenCaptureSpec = {
      backend: 'ddagrab',
      encoder: 'h264_nvenc',
      fps: 60,
      rect,
      outputIdx: 1,
    }
    const args = buildScreenCaptureArgs(spec, file)
    expect(args).toContain(
      'ddagrab=output_idx=1:framerate=60:draw_mouse=0:offset_x=100:offset_y=50:video_size=1280x720',
    )
    expect(args.join(' ')).toContain('-c:v h264_nvenc')
    expect(args).not.toContain('-vf')
    expect(args.slice(-4)).toEqual(['-f', 'matroska', '-y', 'C:\\Videos\\seg0-screen.mkv'])
    expect(args.join(' ')).toContain('-g 120')
  })

  it('ddagrab + libx264: tải khung hình về RAM trước khi mã hóa', () => {
    const args = buildScreenCaptureArgs(
      { backend: 'ddagrab', encoder: 'libx264', fps: 30, rect },
      file,
    )
    expect(args.join(' ')).toContain('-vf hwdownload,format=bgra -pix_fmt yuv420p')
    expect(args.join(' ')).toContain('-c:v libx264 -preset ultrafast')
  })

  it('ddagrab + QSV: ánh xạ texture sang QSV', () => {
    const args = buildScreenCaptureArgs(
      { backend: 'ddagrab', encoder: 'h264_qsv', fps: 30, rect },
      file,
    )
    expect(args.join(' ')).toContain('-vf hwmap=derive_device=qsv,format=qsv')
  })

  it('gdigrab: tọa độ màn hình ảo, có thể âm', () => {
    const args = buildScreenCaptureArgs(
      {
        backend: 'gdigrab',
        encoder: 'h264_amf',
        fps: 30,
        rect: { x: -1920, y: 0, width: 1920, height: 1080 },
      },
      file,
    )
    expect(args.join(' ')).toContain(
      '-f gdigrab -thread_queue_size 512 -framerate 30 -draw_mouse 0 -offset_x -1920 -offset_y 0 -video_size 1920x1080 -i desktop',
    )
    expect(args.join(' ')).toContain('-pix_fmt yuv420p')
  })

  it('x11grab: dùng DISPLAY và vị trí vùng', () => {
    const args = buildScreenCaptureArgs(
      { backend: 'x11grab', encoder: 'libx264', fps: 30, rect, x11Display: ':99' },
      file,
    )
    expect(args.join(' ')).toContain('-draw_mouse 0 -video_size 1280x720 -i :99.0+100,50')
  })

  it('chế độ dò: không ghi file, chỉ vài khung hình', () => {
    const args = buildScreenCaptureArgs(
      { backend: 'gdigrab', encoder: 'libx264', fps: 30, rect },
      { kind: 'null', frames: 10 },
    )
    expect(args.slice(-6)).toEqual(['-an', '-frames:v', '10', '-f', 'null', '-'])
  })
})

describe('các lệnh phụ', () => {
  it('remux chỉ chép luồng, không mã hóa lại', () => {
    expect(buildRemuxArgs('a.webm', 'b.webm')).toEqual(
      expect.arrayContaining(['-i', 'a.webm', '-c', 'copy', '-y', 'b.webm']),
    )
  })

  it('thumbnail lấy một khung hình', () => {
    expect(buildThumbnailArgs('a.mkv', 't.jpg').join(' ')).toContain('-frames:v 1')
  })
})

describe('xuất video: ghép âm thanh', () => {
  it('atempoChain tách tốc độ ngoài khoảng 0.5..100', async () => {
    const { atempoChain } = await import('./args')
    expect(atempoChain(1)).toEqual([])
    expect(atempoChain(2)).toEqual(['atempo=2'])
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5'])
  })

  it('không có âm thanh thì chỉ chép video', async () => {
    const { buildExportMuxArgs } = await import('./args')
    const args = buildExportMuxArgs({ video: 'v.mp4', pieces: [], durationS: 3, output: 'o.mp4' })
    expect(args.join(' ')).toContain('-map 0:v -c:v copy -an -movflags +faststart -t 3 o.mp4')
  })

  it('nâng cao chất lượng: mã hóa lại với bộ lọc giảm nhiễu + làm nét thay vì chép video', async () => {
    const { buildExportMuxArgs, ENHANCE_FILTER } = await import('./args')
    const args = buildExportMuxArgs({
      video: 'v.mp4',
      pieces: [],
      durationS: 3,
      output: 'o.mp4',
      videoFilter: ENHANCE_FILTER,
    })
    expect(args.join(' ')).toContain(`-vf ${ENHANCE_FILTER} -c:v libx264 -preset medium -crf 18`)
    expect(args).not.toContain('copy')
  })

  it('cắt, đổi tốc độ, đặt vị trí và trộn các mảnh âm thanh', async () => {
    const { buildExportMuxArgs } = await import('./args')
    const args = buildExportMuxArgs({
      video: 'v.mp4',
      pieces: [
        { path: 'mic.webm', mediaStart: 1.2, duration: 2, outputStart: 0, speed: 1, volume: 1 },
        { path: 'mic.webm', mediaStart: 5, duration: 2, outputStart: 2, speed: 2, volume: 1 },
        { path: 'sys.webm', mediaStart: 0, duration: 1.5, outputStart: 0.5, speed: 1, volume: 0.5 },
      ],
      durationS: 3,
      output: 'o.mp4',
    })
    expect(args.slice(4, 10)).toEqual(['-i', 'v.mp4', '-i', 'mic.webm', '-i', 'sys.webm'])
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph.split(';')).toEqual([
      '[1:a]asplit=2[f0_0][f0_1]',
      '[2:a]anull[f1_0]',
      '[f0_0]atrim=start=1.2:end=3.2,asetpts=PTS-STARTPTS,volume=1,adelay=0:all=1[p0]',
      '[f0_1]atrim=start=5:end=7,asetpts=PTS-STARTPTS,atempo=2,volume=1,adelay=2000:all=1[p1]',
      '[f1_0]atrim=start=0:end=1.5,asetpts=PTS-STARTPTS,volume=0.5,adelay=500:all=1[p2]',
      '[p0][p1][p2]amix=inputs=3:duration=longest:normalize=0,apad=whole_dur=3,asetpts=N/SR/TB[aout]',
    ])
    expect(args.join(' ')).toContain('-map 0:v -map [aout] -c:v copy -c:a aac')
    expect(args.slice(-4)).toEqual(['+faststart', '-t', '3', 'o.mp4'])
  })
})

describe('livestream', () => {
  it('tee phát cùng lúc nhiều đích và ghi file, đích lỗi không làm dừng các đích khác', async () => {
    const { buildLiveArgs } = await import('./args')
    const args = buildLiveArgs(
      [
        { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2/key-1' },
        { kind: 'rtmp', url: 'rtmps://live-api-s.facebook.com:443/rtmp/FB|key' },
        { kind: 'file', path: 'C:\\Videos\\live.mkv' },
      ],
      { encoder: 'libx264', fps: 30, videoBitrate: 4500, audioBitrate: 160 },
    )
    expect(args.join(' ')).toContain('-i pipe:0 -map 0:v:0 -map 0:a:0?')
    expect(args.join(' ')).toContain(
      '-c:v libx264 -preset veryfast -tune zerolatency -b:v 4500k -maxrate 4500k -bufsize 9000k -g 60',
    )
    expect(args.join(' ')).toContain('-c:a aac -b:a 160k')
    expect(args.at(-1)).toBe(
      '[f=flv:onfail=ignore:flvflags=no_duration_filesize]rtmp://a.rtmp.youtube.com/live2/key-1|' +
        '[f=flv:onfail=ignore:flvflags=no_duration_filesize]rtmps://live-api-s.facebook.com:443/rtmp/FB\\|key|' +
        '[f=matroska]C:\\\\Videos\\\\live.mkv',
    )
  })

  it('NVENC dùng CBR độ trễ thấp; không có đích thì báo lỗi', async () => {
    const { buildLiveArgs } = await import('./args')
    expect(
      buildLiveArgs([{ kind: 'file', path: 'x.mkv' }], {
        encoder: 'h264_nvenc',
        fps: 30,
        videoBitrate: 6000,
        audioBitrate: 160,
      }).join(' '),
    ).toContain('-c:v h264_nvenc -preset p4 -tune ll -rc cbr')
    expect(() =>
      buildLiveArgs([], { encoder: 'libx264', fps: 30, videoBitrate: 1, audioBitrate: 1 }),
    ).toThrow()
  })
})
