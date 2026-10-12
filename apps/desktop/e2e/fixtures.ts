import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const ffmpeg = (args: string[]) =>
  execFileSync(
    ffmpegPath as unknown as string,
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    { stdio: 'pipe' },
  )

export const FIXTURE_FOLDER = 'Fixture 2026-01-01.lumora'
export const FIXTURE_START = 1_000_000

/**
 * Tạo một dự án mẫu giống hệt bản quay thật (không cần màn hình): video màn hình 1280×720,
 * webcam, micro (âm sine 440Hz), các click chuột để tự động zoom.
 */
export function createFixtureProject(projectsDir: string, durationS = 4): string {
  const dir = join(projectsDir, FIXTURE_FOLDER)
  mkdirSync(dir, { recursive: true })
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=1280x720:rate=30:duration=${durationS}`,
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-g',
    '60',
    '-f',
    'matroska',
    join(dir, 'seg0-screen.mkv'),
  ])
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=640x480:rate=30:duration=${durationS}`,
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-f',
    'matroska',
    join(dir, 'seg0-camera.mkv'),
  ])
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationS}`,
    '-c:a',
    'libopus',
    join(dir, 'seg0-mic.webm'),
  ])

  const t0 = FIXTURE_START
  const events = [
    { type: 'move', t: t0, x: 100, y: 100 },
    { type: 'move', t: t0 + 800, x: 900, y: 500 },
    { type: 'down', t: t0 + 1000, x: 900, y: 500, button: 'left' },
    { type: 'up', t: t0 + 1080, x: 900, y: 500, button: 'left' },
    { type: 'down', t: t0 + 1600, x: 950, y: 520, button: 'left' },
    { type: 'up', t: t0 + 1680, x: 950, y: 520, button: 'left' },
  ]
  writeFileSync(join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(
    join(dir, 'project.json'),
    JSON.stringify({
      version: 1,
      id: 'fixture',
      name: 'Fixture',
      createdAt: '2026-01-01T00:00:00.000Z',
      source: {
        kind: 'display',
        name: 'Test',
        captureRect: { x: 0, y: 0, width: 1280, height: 720 },
        scaleFactor: 1,
      },
      engine: 'ffmpeg',
      encoder: 'libx264',
      fps: 30,
      cursorHidden: true,
      segments: [
        {
          index: 0,
          startedAt: t0,
          endedAt: t0 + durationS * 1000,
          tracks: {
            screen: { file: 'seg0-screen.mkv', startedAt: t0 },
            camera: { file: 'seg0-camera.mkv', startedAt: t0 },
            mic: { file: 'seg0-mic.webm', startedAt: t0 },
          },
        },
      ],
      hasEvents: true,
      inputMode: 'hook',
      durationMs: durationS * 1000,
    }),
  )
  return dir
}

/** Màu (RGB) của một điểm ảnh trong video tại giây `t`. */
export function pixelAt(file: string, x: number, y: number, t = 0.5): [number, number, number] {
  const out = execFileSync(
    ffmpegPath as unknown as string,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(t),
      '-i',
      file,
      '-vf',
      `format=rgb24,crop=1:1:${x}:${y}`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return [out[0]!, out[1]!, out[2]!]
}
