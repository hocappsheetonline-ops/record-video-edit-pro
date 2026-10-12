import { appendFile, copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EVENTS_FILE,
  FILMSTRIP_FILE,
  PROJECT_FILE,
  WAVEFORM_FILE,
  type Project,
  type Segment,
  type TrackFile,
  type TrackKind,
} from '@lumora/core'
import { parseDurationMs } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'

/** Video nhập dài tối đa 2 giờ. */
export const MAX_IMPORT_MS = 2 * 3600_000
/** Khoảng trống (ms) giữa đoạn trước và đoạn nhập, để sự kiện chuột của bản quay không lấn sang. */
const GAP_MS = 1000

/** Đuôi file video / âm thanh nhập được. */
export const IMPORT_VIDEO_EXT = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'm4v',
  'wmv',
  'flv',
  'mpg',
  'mpeg',
  'ts',
]

/**
 * Nhập video từ máy làm đoạn mới ở cuối dự án (giống ghép clip trong CapCut): chuẩn hóa hình về
 * MP4 H.264 (tối đa 1920×1080, đúng fps của dự án), tách tiếng thành track "âm thanh máy" (AAC)
 * để trộn tiếng như bản quay. Ghi lại `project.json`, xóa bộ nhớ đệm dạng sóng / dải phim
 * để tạo lại. Trả về dự án mới.
 */
export async function importVideoSegment(
  dir: string,
  project: Project,
  source: string,
  run: FfmpegRunner,
): Promise<Project> {
  const probe = await run(['-hide_banner', '-i', source], 30_000)
  if (!/Stream #\d+:\d+.*Video:/.test(probe.stderr)) throw new Error('import_no_video')
  const hasAudio = /Stream #\d+:\d+.*Audio:/.test(probe.stderr)
  const sourceMs = parseDurationMs(probe.stderr) ?? 0
  if (sourceMs <= 0) throw new Error('import_no_video')
  if (sourceMs > MAX_IMPORT_MS) throw new Error('import_too_long')

  const index = Math.max(-1, ...project.segments.map((s) => s.index)) + 1
  const video = `import${index}-screen.mp4`
  const audio = `import${index}-system.m4a`
  const fps = project.fps >= 50 ? 60 : 30
  const encode = async (args: string[], target: string) => {
    const tmp = join(dir, `${target}.part${target.slice(target.lastIndexOf('.'))}`)
    const r = await run(
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, ...args, tmp],
      Math.max(120_000, sourceMs * 4),
    )
    if (r.code !== 0) {
      await rm(tmp, { force: true })
      throw new Error(`import_failed: ${r.stderr.slice(-300)}`)
    }
    await rename(tmp, join(dir, target))
  }
  await encode(
    [
      '-map',
      '0:v:0',
      '-an',
      '-sn',
      '-dn',
      '-vf',
      `scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=${fps},format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-movflags',
      '+faststart',
    ],
    video,
  )
  if (hasAudio)
    await encode(
      ['-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000'],
      audio,
    )

  // Thời lượng thật của file đã chuẩn hóa (có thể lệch vài khung so với file gốc).
  const out = await run(['-hide_banner', '-i', join(dir, video)], 30_000)
  const durationMs = parseDurationMs(out.stderr) ?? sourceMs
  const last = project.segments.reduce((m, s) => Math.max(m, s.endedAt), 0)
  const startedAt = last + GAP_MS
  const segment: Segment = {
    index,
    startedAt,
    endedAt: startedAt + durationMs,
    tracks: {
      screen: { file: video, startedAt },
      ...(hasAudio ? { system: { file: audio, startedAt } } : {}),
    },
    kind: 'imported',
  }
  const next: Project = {
    ...project,
    segments: [...project.segments, segment],
    durationMs: project.durationMs + durationMs,
  }
  await writeFile(join(dir, PROJECT_FILE), `${JSON.stringify(next, null, 2)}\n`)
  // Dạng sóng và dải phim tính theo toàn bộ dự án: tạo lại lần mở sau.
  await Promise.all([
    rm(join(dir, WAVEFORM_FILE), { force: true }),
    rm(join(dir, FILMSTRIP_FILE), { force: true }),
  ])
  return next
}

/**
 * Ghép một bản quay khác vào cuối dự án: chép các file track (đổi tên), dời thời gian các đoạn
 * cho nối sau đoạn cuối. Sự kiện chuột được ghép theo (dời cùng khoảng) khi hai bản quay cùng
 * vùng màn hình; khác vùng thì các đoạn ghép không vẽ con trỏ. Trả về dự án mới.
 */
export async function mergeProject(
  dir: string,
  project: Project,
  otherDir: string,
  other: Project,
): Promise<Project> {
  const first = other.segments[0]
  if (!first) throw new Error('merge_empty')
  const last = project.segments.reduce((m, s) => Math.max(m, s.endedAt), 0)
  const shift = last + GAP_MS - first.startedAt
  const base = Math.max(-1, ...project.segments.map((s) => s.index)) + 1
  const sameArea =
    other.hasEvents &&
    JSON.stringify(other.source.captureRect) === JSON.stringify(project.source.captureRect)
  const added: Segment[] = []
  for (const [i, seg] of other.segments.entries()) {
    const index = base + i
    const tracks: Segment['tracks'] = {}
    for (const [kind, track] of Object.entries(seg.tracks) as [TrackKind, TrackFile][]) {
      const ext = track.file.slice(track.file.lastIndexOf('.') + 1)
      const file = `merge${index}-${kind}.${ext}`
      await copyFile(join(otherDir, track.file), join(dir, file))
      tracks[kind] = { file, startedAt: track.startedAt + shift }
    }
    added.push({
      index,
      startedAt: seg.startedAt + shift,
      endedAt: seg.endedAt + shift,
      tracks,
      ...(seg.kind === 'imported' || !sameArea ? { kind: 'imported' as const } : {}),
    })
  }
  if (sameArea) {
    const raw = await readFile(join(otherDir, EVENTS_FILE), 'utf8').catch(() => '')
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const e = JSON.parse(line) as { t?: unknown }
          return typeof e.t === 'number' ? [JSON.stringify({ ...e, t: e.t + shift })] : []
        } catch {
          return []
        }
      })
    if (lines.length > 0) await appendFile(join(dir, EVENTS_FILE), `${lines.join('\n')}\n`)
  }
  const next: Project = {
    ...project,
    segments: [...project.segments, ...added],
    durationMs: project.durationMs + other.durationMs,
    hasEvents: project.hasEvents || sameArea,
  }
  await writeFile(join(dir, PROJECT_FILE), `${JSON.stringify(next, null, 2)}\n`)
  await Promise.all([
    rm(join(dir, WAVEFORM_FILE), { force: true }),
    rm(join(dir, FILMSTRIP_FILE), { force: true }),
  ])
  return next
}
