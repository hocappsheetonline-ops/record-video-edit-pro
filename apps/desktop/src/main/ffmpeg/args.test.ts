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
