import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAudioRemuxArgs, buildExportMuxArgs } from './args'
import { parseDurationMs } from './parse'
import { runFfmpeg } from './runner'

/**
 * Kiểm tra bằng ffmpeg thật: các lỗi "giật" (hụt mốc thời gian, tiếng tách ở điểm cắt) và "rè"
 * (cắt ngọn khi trộn) phải được xử lý đúng ở đầu ra, không chỉ đúng tham số.
 */
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-audio-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function ff(args: string[]): Promise<string> {
  const r = await runFfmpeg(['-hide_banner', '-y', ...args], 60_000)
  if (r.code !== 0) throw new Error(r.stderr)
  return r.stderr
}

/** Âm lượng trung bình (dB) của một đoạn trong file, qua bộ lọc tùy chọn. */
async function meanDb(file: string, from: number, len: number, filter = 'anull') {
  const r = await runFfmpeg([
    '-hide_banner',
    '-i',
    file,
    '-vn',
    '-af',
    `${filter},atrim=start=${from}:end=${from + len},volumedetect`,
    '-f',
    'null',
    '-',
  ])
  // volumedetect có thể in một báo cáo rỗng trước báo cáo thật: lấy giá trị cuối.
  const all = [...r.stderr.matchAll(/mean_volume: (-?[\d.]+) dB/g)]
  return Number(all.at(-1)?.[1] ?? -100)
}

/** Đỉnh (dB) của cả file, qua bộ lọc tùy chọn. */
async function peakDb(file: string, filter = 'anull') {
  const r = await runFfmpeg([
    '-hide_banner',
    '-i',
    file,
    '-vn',
    '-af',
    `${filter},astats=measure_overall=Peak_level:measure_perchannel=none`,
    '-f',
    'null',
    '-',
  ])
  const all = [...r.stderr.matchAll(/Peak level dB: (-?[\d.]+)/g)]
  return Number(all.at(-1)?.[1] ?? NaN)
}

async function durationS(file: string) {
  const r = await runFfmpeg(['-hide_banner', '-i', file])
  return (parseDurationMs(r.stderr) ?? 0) / 1000
}

/** Sóng sin biên độ `amp` (0..1) dài `d` giây, PCM 16-bit 48 kHz. */
function tone(file: string, freq: number, amp: number, d: number) {
  return ff([
    '-f',
    'lavfi',
    '-i',
    `aevalsrc='${amp}*sin(2*PI*${freq}*t)':s=48000:d=${d}`,
    '-c:a',
    'pcm_s16le',
    file,
  ])
}

/** Video đen ngắn để ghép (buildExportMuxArgs cần luồng hình). */
function video(file: string, d: number) {
  return ff([
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=64x64:r=10:d=${d}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    file,
  ])
}

describe('track âm thanh của MediaRecorder', () => {
  it('chỗ hụt mốc thời gian được điền im lặng: lời giữ đúng vị trí, độ dài giữ nguyên', async () => {
    // Giả lập file Opus của Chromium: tiếng 0–1 s, mốc thời gian nhảy, rồi tiếng tiếp ở 2.5–3.5 s.
    const gap = join(dir, 'seg0-mic.rec.webm')
    await ff([
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=f=880:d=1',
      '-filter_complex',
      '[0]asetpts=PTS-STARTPTS[a];[1]asetpts=PTS-STARTPTS+1.5/TB[b];[a][b]concat=n=2:v=0:a=1',
      '-c:a',
      'libopus',
      gap,
    ])
    const fixed = join(dir, 'seg0-mic.webm')
    await ff(buildAudioRemuxArgs(gap, fixed).filter((a) => a !== '-y'))
    expect(await durationS(fixed)).toBeCloseTo(3.5, 1)
    expect(await meanDb(fixed, 0.2, 0.6)).toBeGreaterThan(-30)
    // Khoảng hụt là im lặng (phát nguyên bản cũ thì tiếng thứ hai bị kéo lên đây → lệch hình 1,5 s).
    expect(await meanDb(fixed, 1.2, 1.0)).toBeLessThan(-60)
    expect(await meanDb(fixed, 2.7, 0.6)).toBeGreaterThan(-30)
  })
})

describe('ghép âm thanh khi xuất', () => {
  it('hai nguồn cộng lại vượt 0 dB vẫn không bị cắt ngọn, và không lệch thời gian', async () => {
    const a = join(dir, 'a.wav')
    const b = join(dir, 'b.wav')
    const v = join(dir, 'v.mp4')
    await Promise.all([tone(a, 100, 0.9, 3), tone(b, 1000, 0.9, 3), video(v, 3)])
    const out = join(dir, 'o.mp4')
    await ff(
      buildExportMuxArgs({
        video: v,
        durationS: 3,
        output: out,
        pieces: [
          { path: a, mediaStart: 0, duration: 3, outputStart: 0, speed: 1, volume: 1 },
          // Mảnh thứ hai vào ở giây 1: kiểm tra vị trí sau bộ chặn đỉnh (có bù độ trễ).
          { path: b, mediaStart: 0, duration: 2, outputStart: 1, speed: 1, volume: 1 },
        ],
      }).filter((x) => x !== '-y'),
    )
    // Cộng thẳng 0.9 + 0.9 là +5 dB; sau khi chặn đỉnh phải dưới 0 dB (AAC có thể dao động nhẹ).
    expect(await peakDb(out)).toBeLessThan(0.5)
    expect(await durationS(out)).toBeCloseTo(3, 1)
    // Trước giây 1 chỉ có tiếng 100 Hz; từ giây 1 có thêm 1 kHz: bộ chặn đỉnh không làm trôi vị trí mảnh.
    const only1k = Array(4).fill('highpass=f=500:p=2').join(',')
    expect(await meanDb(out, 0.9, 0.09, only1k)).toBeLessThan(-40)
    expect(await meanDb(out, 1.01, 0.09, only1k)).toBeGreaterThan(-25)
  })

  it('điểm cắt giữa dao động không còn tiếng "tách"', async () => {
    const a = join(dir, 'a.wav')
    const v = join(dir, 'v.mp4')
    await Promise.all([tone(a, 200, 0.8, 3), video(v, 3)])
    const out = join(dir, 'o.mp4')
    await ff(
      buildExportMuxArgs({
        video: v,
        durationS: 3,
        output: out,
        // Cắt ở 0.2503 s (không trùng điểm sóng qua 0) và đặt ở giây 0.5: tiếng tách là năng lượng tần
        // số cao ở điểm cắt; vuốt 5 ms hai đầu phải xóa nó (không vuốt thì đỉnh ~ -30 dB).
        pieces: [
          { path: a, mediaStart: 0.2503, duration: 1, outputStart: 0.5, speed: 1, volume: 1 },
        ],
      }).filter((x) => x !== '-y'),
    )
    expect(await peakDb(out, 'highpass=f=4000:p=2')).toBeLessThan(-50)
    expect(await meanDb(out, 0.6, 0.8)).toBeGreaterThan(-10)
  })
})
