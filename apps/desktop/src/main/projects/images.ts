import { randomBytes } from 'node:crypto'
import { access, copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import type { MediaAsset, MemeItem, MemeOrigin } from '@shared/ipc'
import { parseDurationMs, parseInputResolution } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi']
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]
/** Video meme dài hơn thì chỉ lấy phần đầu (meme thường chỉ vài giây). */
export const MAX_VIDEO_SECONDS = 120

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

async function probeSize(path: string, run: FfmpegRunner) {
  const probe = await run(['-hide_banner', '-i', path], 30_000)
  const size = parseInputResolution(probe.stderr)
  if (!size) throw new Error('image_unreadable')
  return size
}

function checkExtension(path: string): string {
  const ext = extname(path).slice(1).toLowerCase()
  if (!MEDIA_EXTENSIONS.includes(ext)) throw new Error('image_unsupported')
  return ext
}

const isVideo = (ext: string) => VIDEO_EXTENSIONS.includes(ext)

/**
 * Chuẩn hóa video meme về MP4 H.264 + AAC (tối đa 1280px, 30 hình/giây, 2 phút): phát mượt
 * trong khung xem trước, giải mã được khi xuất ở mọi máy, file gọn.
 */
async function normalizeVideo(source: string, target: string, run: FfmpegRunner) {
  const tmp = `${target}.part.mp4`
  const r = await run(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      source,
      '-t',
      String(MAX_VIDEO_SECONDS),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-sn',
      '-dn',
      '-vf',
      "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,format=yuv420p",
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '21',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-movflags',
      '+faststart',
      tmp,
    ],
    10 * 60_000,
  )
  if (r.code !== 0) {
    await rm(tmp, { force: true })
    throw new Error('video_unreadable')
  }
  await rename(tmp, target)
  const probe = await run(['-hide_banner', '-i', target], 30_000)
  const size = parseInputResolution(probe.stderr)
  const durationMs = parseDurationMs(probe.stderr)
  if (!size || !durationMs || durationMs < 100) {
    await rm(target, { force: true })
    throw new Error('video_unreadable')
  }
  return { ...size, durationMs, hasAudio: /Stream #\d+:\d+.*Audio:/.test(probe.stderr) }
}

/** Đọc thông tin và chép (ảnh) hoặc chuẩn hóa (video) một file vào `target`. */
async function importTo(
  source: string,
  target: string,
  run: FfmpegRunner,
): Promise<Omit<MediaAsset, 'file' | 'name'>> {
  const ext = checkExtension(source)
  if (isVideo(ext)) return { kind: 'video', ...(await normalizeVideo(source, target, run)) }
  const size = await probeSize(source, run)
  await copyFile(source, target)
  return { kind: 'image', ...size, durationMs: 0, hasAudio: false }
}

const targetExt = (ext: string) => (isVideo(ext) ? 'mp4' : ext)

/** Chép ảnh / GIF / video meme của người dùng vào dự án. */
export async function importImageFile(
  source: string,
  projectDir: string,
  run: FfmpegRunner,
): Promise<MediaAsset> {
  const ext = checkExtension(source)
  const file = `asset-${randomBytes(6).toString('hex')}.${targetExt(ext)}`
  const info = await importTo(source, join(projectDir, file), run)
  return { file, name: basename(source, extname(source)), ...info }
}

const INDEX = 'memes.json'

type MemeRecord = MediaAsset & { origin?: MemeOrigin }

/** Tên / nguồn gốc ghi kèm khi thêm (meme tải từ kho online). */
export interface MemeMeta {
  name?: string
  origin?: MemeOrigin
}

function parseOrigin(v: unknown): MemeOrigin | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  return (o.source === 'giphy' || o.source === 'pixabay' || o.source === 'tenor') &&
    typeof o.id === 'string'
    ? { source: o.source, id: o.id }
    : undefined
}

/**
 * Thư viện meme của riêng người dùng (lưu trong thư mục dữ liệu của app): nhập ảnh/GIF meme yêu
 * thích một lần, dùng lại ở mọi dự án. App không kèm sẵn ảnh meme có bản quyền.
 */
export class MemeLibrary {
  constructor(
    private readonly dir: string,
    private readonly run: FfmpegRunner,
  ) {}

  private async records(): Promise<MemeRecord[]> {
    const raw = await readJsonFile(join(this.dir, INDEX))
    if (!Array.isArray(raw)) return []
    return raw.flatMap((r): MemeRecord[] =>
      typeof r === 'object' &&
      r !== null &&
      typeof r.file === 'string' &&
      /^meme-[\w.-]+$/.test(r.file) &&
      typeof r.name === 'string' &&
      typeof r.width === 'number' &&
      typeof r.height === 'number'
        ? [
            {
              file: r.file,
              name: r.name,
              width: r.width,
              height: r.height,
              // Thư viện cũ chỉ có ảnh.
              kind: r.kind === 'video' ? 'video' : 'image',
              durationMs: typeof r.durationMs === 'number' ? r.durationMs : 0,
              hasAudio: r.hasAudio === true,
              ...(parseOrigin(r.origin) ? { origin: parseOrigin(r.origin) } : {}),
            },
          ]
        : [],
    )
  }

  /** Danh sách meme kèm ảnh thu nhỏ (data URL) để hiện trong bảng chọn. */
  async list(): Promise<MemeItem[]> {
    const items: MemeItem[] = []
    for (const r of await this.records()) {
      const thumbPath = join(this.dir, `${r.file}.thumb.jpg`)
      if (!(await exists(join(this.dir, r.file)))) continue
      if (!(await exists(thumbPath))) {
        await this.run(
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            // Video: lấy khung ở giây thứ nửa (khung đầu hay bị đen).
            ...(r.kind === 'video' && r.durationMs > 1000 ? ['-ss', '0.5'] : []),
            '-i',
            join(this.dir, r.file),
            '-frames:v',
            '1',
            '-vf',
            'scale=192:-2',
            thumbPath,
          ],
          30_000,
        )
      }
      const thumb = (await exists(thumbPath))
        ? `data:image/jpeg;base64,${(await readFile(thumbPath)).toString('base64')}`
        : ''
      items.push({ ...r, thumb })
    }
    return items
  }

  /**
   * Thêm ảnh / GIF / video vào thư viện (từ hộp thoại hoặc kéo thả). Đường dẫn phải là file thật,
   * đúng đuôi; file lỗi làm dừng cả lượt và báo lỗi (các file trước đó vẫn được giữ).
   */
  async add(paths: readonly string[], meta: readonly MemeMeta[] = []): Promise<MemeItem[]> {
    await mkdir(this.dir, { recursive: true })
    const records = await this.records()
    try {
      for (const source of paths) {
        if (typeof source !== 'string' || !isAbsolute(source)) throw new Error('image_unsupported')
        const ext = checkExtension(source)
        if (!(await stat(source).catch(() => null))?.isFile()) throw new Error('image_unreadable')
        const file = `meme-${randomBytes(6).toString('hex')}.${targetExt(ext)}`
        const info = await importTo(source, join(this.dir, file), this.run)
        const m = meta[paths.indexOf(source)]
        records.push({
          file,
          name: m?.name?.trim().slice(0, 80) || basename(source, extname(source)),
          ...info,
          ...(m?.origin ? { origin: m.origin } : {}),
        })
      }
    } finally {
      await writeJsonFile(join(this.dir, INDEX), records)
    }
    return this.list()
  }

  async remove(file: string): Promise<MemeItem[]> {
    const records = await this.records()
    const kept = records.filter((r) => r.file !== file)
    if (kept.length !== records.length) {
      await rm(join(this.dir, file), { force: true })
      await rm(join(this.dir, `${file}.thumb.jpg`), { force: true })
      await writeJsonFile(join(this.dir, INDEX), kept)
    }
    return this.list()
  }

  /** Chép một meme trong thư viện vào dự án (dùng lại nếu đã chép trước đó). */
  async useInProject(file: string, projectDir: string): Promise<MediaAsset> {
    const record = (await this.records()).find((r) => r.file === file)
    if (!record) throw new Error('meme_missing')
    const target = `asset-${record.file}`
    if (!(await exists(join(projectDir, target))))
      await copyFile(join(this.dir, record.file), join(projectDir, target))
    return { ...record, file: target }
  }
}
