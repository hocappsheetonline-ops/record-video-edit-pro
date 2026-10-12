import { describe, expect, it, vi } from 'vitest'
import { mediaUrl, pickMimeType, TrackRecorder, type ChunkSink } from './media'

describe('pickMimeType', () => {
  it('ưu tiên H.264 cho video và Opus cho âm thanh', () => {
    expect(pickMimeType('screen', () => true)).toBe('video/webm;codecs=h264')
    expect(pickMimeType('mic', () => true)).toBe('audio/webm;codecs=opus')
  })

  it('lùi về VP9 khi không có H.264', () => {
    expect(pickMimeType('camera', (t) => !t.includes('h264'))).toBe('video/webm;codecs=vp9')
  })

  it('trả về rỗng khi không hỗ trợ gì (để trình duyệt tự chọn)', () => {
    expect(pickMimeType('system', () => false)).toBe('')
  })
})

describe('mediaUrl', () => {
  it('mã hóa tên thư mục có khoảng trắng', () => {
    expect(mediaUrl('2026-10-12 09.00.00.lumora', 'seg0-screen.mkv')).toBe(
      'lumora-media://projects/2026-10-12%2009.00.00.lumora/seg0-screen.mkv',
    )
  })
})

/** MediaRecorder giả để kiểm tra luồng gửi dữ liệu. */
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstart: (() => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start() {
    this.state = 'recording'
    queueMicrotask(() => this.onstart?.())
  }
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) })
  }
  stop() {
    this.state = 'inactive'
    this.emit('last')
    queueMicrotask(() => this.onstop?.())
  }
}

describe('TrackRecorder', () => {
  it('báo thời điểm bắt đầu, gửi dữ liệu theo đúng thứ tự và chờ phần cuối khi dừng', async () => {
    const written: string[] = []
    const sink: ChunkSink = {
      trackStarted: vi.fn(async () => {}),
      writeChunk: vi.fn(async (_i, _k, data: ArrayBuffer) => {
        await new Promise((r) => setTimeout(r, Math.random() * 5))
        written.push(new TextDecoder().decode(data))
      }),
    }
    let fake!: FakeRecorder
    const recorder = new TrackRecorder('mic', {} as MediaStream, sink, () => {
      fake = new FakeRecorder()
      return fake as unknown as MediaRecorder
    })
    await recorder.start(2)
    expect(sink.trackStarted).toHaveBeenCalledWith(2, 'mic', expect.any(Number))
    fake.emit('a')
    fake.emit('b')
    await recorder.stop()
    expect(written).toEqual(['a', 'b', 'last'])
    expect(sink.writeChunk).toHaveBeenCalledWith(2, 'mic', expect.any(ArrayBuffer))
  })

  it('báo lỗi khi gửi dữ liệu thất bại', async () => {
    const sink: ChunkSink = {
      trackStarted: async () => {},
      writeChunk: async () => Promise.reject(new Error('disk full')),
    }
    let fake!: FakeRecorder
    const recorder = new TrackRecorder('camera', {} as MediaStream, sink, () => {
      fake = new FakeRecorder()
      return fake as unknown as MediaRecorder
    })
    await recorder.start(0)
    fake.emit('x')
    await expect(recorder.stop()).rejects.toThrow('disk full')
  })
})
