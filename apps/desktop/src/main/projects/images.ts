import { randomBytes } from 'node:crypto'
import { access, copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ImageAsset, MemeItem } from '@shared/ipc'
import { parseInputResolution } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

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
  if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error('image_unsupported')
  return ext
}

/** Chép ảnh / GIF meme của người dùng vào dự án. */
export async function importImageFile(
  source: string,
  projectDir: string,
  run: FfmpegRunner,
): Promise<ImageAsset> {
  const ext = checkExtension(source)
  const size = await probeSize(source, run)
  const file = `asset-${randomBytes(6).toString('hex')}.${ext}`
  await copyFile(source, join(projectDir, file))
  return { file, name: basename(source, extname(source)), width: size.width, height: size.height }
}

const INDEX = 'memes.json'

interface MemeRecord {
  file: string
  name: string
  width: number
  height: number
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
    return raw.filter(
      (r): r is MemeRecord =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.file === 'string' &&
        /^meme-[\w.-]+$/.test(r.file) &&
        typeof r.name === 'string' &&
        typeof r.width === 'number' &&
        typeof r.height === 'number',
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
            '-i',
            join(this.dir, r.file),
            '-frames:v',
            '1',
            '-vf',
            'scale=96:-2',
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

  async add(paths: readonly string[]): Promise<MemeItem[]> {
    await mkdir(this.dir, { recursive: true })
    const records = await this.records()
    for (const source of paths) {
      const ext = checkExtension(source)
      const size = await probeSize(source, this.run)
      const file = `meme-${randomBytes(6).toString('hex')}.${ext}`
      await copyFile(source, join(this.dir, file))
      records.push({ file, name: basename(source, extname(source)), ...size })
    }
    await writeJsonFile(join(this.dir, INDEX), records)
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
  async useInProject(file: string, projectDir: string): Promise<ImageAsset> {
    const record = (await this.records()).find((r) => r.file === file)
    if (!record) throw new Error('meme_missing')
    const target = `asset-${record.file}`
    if (!(await exists(join(projectDir, target))))
      await copyFile(join(this.dir, record.file), join(projectDir, target))
    return { file: target, name: record.name, width: record.width, height: record.height }
  }
}
