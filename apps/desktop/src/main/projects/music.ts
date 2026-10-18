import { randomBytes } from 'node:crypto'
import { access, copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import type { AudioAsset, MusicTrack, RecentDownload } from '@shared/ipc'
import { parseDurationMs } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'
import { AUDIO_EXTENSIONS } from './assets'

const INDEX = 'music.json'
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
/** Kho nhạc tối đa 500 bài để file chỉ mục luôn nhỏ. */
const MAX_TRACKS = 500

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  )

async function probeDuration(path: string, run: FfmpegRunner): Promise<number> {
  const probe = await run(['-hide_banner', '-i', path], 30_000)
  const ms = parseDurationMs(probe.stderr)
  if (!ms || ms <= 0 || !/Audio:/.test(probe.stderr)) throw new Error('audio_unreadable')
  return ms
}

/**
 * Kho nhạc của riêng người dùng (lưu trong thư mục dữ liệu của app): nhạc tải từ Thư viện âm thanh
 * YouTube hoặc file trên máy, thêm một lần, dùng lại ở mọi dự án. App không kèm sẵn nhạc.
 */
export class MusicLibrary {
  constructor(
    private readonly dir: string,
    private readonly run: FfmpegRunner,
  ) {}

  private async records(): Promise<MusicTrack[]> {
    const raw = await readJsonFile(join(this.dir, INDEX))
    if (!Array.isArray(raw)) return []
    return raw.flatMap((r): MusicTrack[] =>
      typeof r === 'object' &&
      r !== null &&
      typeof r.file === 'string' &&
      /^music-[\w.-]+$/.test(r.file) &&
      typeof r.name === 'string' &&
      typeof r.durationMs === 'number'
        ? [
            {
              file: r.file,
              name: r.name,
              durationMs: r.durationMs,
              addedAt: typeof r.addedAt === 'number' ? r.addedAt : 0,
              source:
                r.source === 'youtube' ? 'youtube' : r.source === 'jamendo' ? 'jamendo' : 'file',
              ...(typeof r.credit === 'string' && r.credit ? { credit: r.credit } : {}),
              ...(isObj(r.origin) &&
              r.origin.source === 'jamendo' &&
              typeof r.origin.id === 'string'
                ? { origin: { source: 'jamendo' as const, id: r.origin.id } }
                : {}),
            },
          ]
        : [],
    )
  }

  /** Bài đã tải từ kho online (theo mã bài), nếu còn trên đĩa. */
  async findByOrigin(source: 'jamendo', id: string): Promise<MusicTrack | null> {
    const track = (await this.list()).find((t) => t.origin?.source === source && t.origin.id === id)
    return track ?? null
  }

  /**
   * Thêm một file nhạc đã tải từ kho online (AI tự tìm): đặt tên, ghi nguồn và mã bài để lần sau
   * dùng lại không tải nữa.
   */
  async addTrack(
    sourcePath: string,
    info: { name: string; credit: string; origin: { source: 'jamendo'; id: string } },
    now: () => number = Date.now,
  ): Promise<MusicTrack> {
    await mkdir(this.dir, { recursive: true })
    const ext = extname(sourcePath).slice(1).toLowerCase()
    if (!AUDIO_EXTENSIONS.includes(ext)) throw new Error('audio_unsupported')
    const durationMs = await probeDuration(sourcePath, this.run)
    const file = `music-${randomBytes(6).toString('hex')}.${ext}`
    await copyFile(sourcePath, join(this.dir, file))
    const track: MusicTrack = {
      file,
      name: cleanName(info.name),
      durationMs,
      addedAt: now(),
      source: 'jamendo',
      credit: info.credit.slice(0, 300),
      origin: info.origin,
    }
    const records = await this.records()
    records.push(track)
    await writeJsonFile(join(this.dir, INDEX), records.slice(-MAX_TRACKS))
    return track
  }

  /** Danh sách bài (mới thêm trước), chỉ những file còn trên đĩa. */
  async list(): Promise<MusicTrack[]> {
    const items: MusicTrack[] = []
    for (const r of await this.records()) if (await exists(join(this.dir, r.file))) items.push(r)
    return items.sort((a, b) => b.addedAt - a.addedAt)
  }

  /**
   * Thêm file nhạc vào kho (từ hộp thoại, kéo thả, hoặc file vừa tải từ YouTube). File lỗi làm
   * dừng cả lượt và báo lỗi (các file trước đó vẫn được giữ).
   */
  async add(
    paths: readonly string[],
    source: MusicTrack['source'] = 'file',
    now: () => number = Date.now,
  ): Promise<MusicTrack[]> {
    await mkdir(this.dir, { recursive: true })
    const records = await this.records()
    try {
      for (const sourcePath of paths) {
        if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath))
          throw new Error('audio_unsupported')
        const ext = extname(sourcePath).slice(1).toLowerCase()
        if (!AUDIO_EXTENSIONS.includes(ext)) throw new Error('audio_unsupported')
        if (!(await stat(sourcePath).catch(() => null))?.isFile())
          throw new Error('audio_unreadable')
        const durationMs = await probeDuration(sourcePath, this.run)
        const file = `music-${randomBytes(6).toString('hex')}.${ext}`
        await copyFile(sourcePath, join(this.dir, file))
        records.push({
          file,
          name: cleanName(basename(sourcePath, extname(sourcePath))),
          durationMs,
          addedAt: now(),
          source,
        })
      }
    } finally {
      await writeJsonFile(join(this.dir, INDEX), records.slice(-MAX_TRACKS))
    }
    return this.list()
  }

  async remove(file: string): Promise<MusicTrack[]> {
    const records = await this.records()
    const kept = records.filter((r) => r.file !== file)
    if (kept.length !== records.length) {
      await rm(join(this.dir, file), { force: true })
      await writeJsonFile(join(this.dir, INDEX), kept)
    }
    return this.list()
  }

  /** Chép một bài trong kho vào dự án (dùng lại nếu đã chép trước đó). */
  async useInProject(file: string, projectDir: string): Promise<AudioAsset> {
    const record = (await this.records()).find((r) => r.file === file)
    if (!record) throw new Error('music_missing')
    const target = `asset-${record.file}`
    if (!(await exists(join(projectDir, target))))
      await copyFile(join(this.dir, record.file), join(projectDir, target))
    return { file: target, name: record.name, durationMs: record.durationMs }
  }
}

/** Tên bài từ tên file: bỏ " (1)" do tải trùng và dấu gạch dưới. */
export function cleanName(name: string): string {
  return (
    name
      .replace(/\s*\(\d+\)$/, '')
      .replace(/[_]+/g, ' ')
      .trim()
      .slice(0, 80) || name.slice(0, 80)
  )
}

/** File nhạc trong thư mục Tải về mới nhất (24 giờ), mới nhất trước, tối đa 20. */
export async function recentDownloads(
  downloadsDir: string,
  options: { sinceMs?: number; now?: () => number; limit?: number } = {},
): Promise<RecentDownload[]> {
  const now = options.now?.() ?? Date.now()
  const since = now - (options.sinceMs ?? 24 * 60 * 60_000)
  const names = await readdir(downloadsDir).catch(() => [] as string[])
  const out: RecentDownload[] = []
  for (const name of names) {
    const ext = extname(name).slice(1).toLowerCase()
    if (!AUDIO_EXTENSIONS.includes(ext)) continue
    const path = join(downloadsDir, name)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile() || info.mtimeMs < since || info.size === 0) continue
    // File đang tải dở (.crdownload / .part) không có đuôi nhạc nên tự bị bỏ qua.
    out.push({
      path,
      name: cleanName(basename(name, extname(name))),
      modifiedAt: info.mtimeMs,
      bytes: info.size,
    })
  }
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, options.limit ?? 20)
}
