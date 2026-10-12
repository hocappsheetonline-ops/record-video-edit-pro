import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import yazl from 'yazl'
import {
  EDIT_FILE,
  parseProject,
  PROJECT_FILE,
  PROJECT_FOLDER_SUFFIX,
  TRANSCRIPT_FILE,
  type Project,
} from '@lumora/core'
import { AI_FILE } from '../ai/service'
import { safeFileName } from '../export/manager'
import { listProjects, readProject } from './library'

export const PACK_EXTENSION = 'lumorapack'
const MANIFEST = 'lumora-pack.json'

import type { PackImportResult, PackMode } from '@shared/ipc'

/** Những file chứa công sức chỉnh sửa (đi kèm cả gói đầy đủ lẫn gói chỉ bản chỉnh sửa). */
const EDIT_FILES = [EDIT_FILE, TRANSCRIPT_FILE, AI_FILE]

/** Không gửi: video đã xuất, file tạm, ảnh/sóng tính lại được ở máy nhận. */
function shareable(name: string): boolean {
  return (
    !name.startsWith('.') &&
    name !== 'exports' &&
    !/^filmstrip(-\d+\.jpg|\.json)$/.test(name) &&
    name !== 'waveform.json' &&
    !/^edit\.backup-/.test(name)
  )
}

/** File đã nén sẵn (video, âm thanh, ảnh) thì chỉ đóng gói, không nén lại cho nhanh. */
const compressible = (name: string) => /\.(json|jsonl|txt|srt|vtt)$/i.test(name)

interface Manifest {
  format: 'lumora-pack'
  version: 1
  mode: PackMode
  projectId: string
  name: string
  exportedAt: string
}

/** Đóng gói dự án thành một file `.lumorapack` (zip) để gửi cho người khác chỉnh sửa. */
export async function exportPack(
  projectDir: string,
  project: Project,
  mode: PackMode,
  outPath: string,
): Promise<{ path: string; bytes: number }> {
  const names = (await readdir(projectDir)).filter(shareable)
  const files =
    mode === 'full' ? names : names.filter((n) => n === PROJECT_FILE || EDIT_FILES.includes(n))
  const manifest: Manifest = {
    format: 'lumora-pack',
    version: 1,
    mode,
    projectId: project.id,
    name: project.name,
    exportedAt: new Date().toISOString(),
  }
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), MANIFEST)
  for (const name of files) {
    const info = await stat(join(projectDir, name))
    if (info.isFile()) zip.addFile(join(projectDir, name), name, { compress: compressible(name) })
  }
  zip.end()
  const tmp = `${outPath}.part`
  await pipeline(zip.outputStream, createWriteStream(tmp))
  await rename(tmp, outPath)
  return { path: outPath, bytes: (await stat(outPath)).size }
}

/** Tên file trong gói phải là tên đơn giản (không thư mục, không "..") để không ghi ra ngoài dự án. */
function safeEntryName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length < 200 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.') &&
    name !== '..' &&
    !name.includes(':')
  )
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) =>
      error || !zip ? reject(error ?? new Error('zip')) : resolve(zip),
    ),
  )
}

/** Đọc từng file trong gói; `onEntry` trả về đường dẫn để lưu hoặc null để bỏ qua. */
async function readEntries(
  path: string,
  onEntry: (name: string) => Promise<string | null> | string | null,
): Promise<void> {
  const zip = await openZip(path)
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject)
      zip.on('end', () => resolve())
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          const target = await onEntry(entry.fileName)
          if (target) {
            const stream = await new Promise<NodeJS.ReadableStream>((ok, fail) =>
              zip.openReadStream(entry, (error, s) => (error || !s ? fail(error) : ok(s))),
            )
            await pipeline(stream, createWriteStream(target))
          }
          zip.readEntry()
        })().catch(reject)
      })
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
}

async function readManifest(packPath: string): Promise<{ manifest: Manifest; files: string[] }> {
  const files: string[] = []
  let raw: Buffer | null = null
  const tmpDir = await mkdtemp(join(tmpdir(), 'lumora-pack-'))
  try {
    await readEntries(packPath, (name) => {
      if (name === MANIFEST) return join(tmpDir, MANIFEST)
      if (!safeEntryName(name)) throw new Error('pack_invalid')
      files.push(name)
      return null
    })
    raw = await readFile(join(tmpDir, MANIFEST)).catch(() => null)
  } catch (error) {
    if ((error as Error).message === 'pack_invalid') throw error
    throw new Error('pack_invalid')
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
  const m = raw ? (JSON.parse(raw.toString('utf8')) as Partial<Manifest>) : null
  if (
    !m ||
    m.format !== 'lumora-pack' ||
    m.version !== 1 ||
    (m.mode !== 'full' && m.mode !== 'edits') ||
    typeof m.projectId !== 'string' ||
    typeof m.name !== 'string' ||
    !files.includes(PROJECT_FILE)
  )
    throw new Error('pack_invalid')
  return { manifest: m as Manifest, files }
}

export type ImportResult = PackImportResult

/**
 * Nhập gói `.lumorapack`. Nếu máy đã có dự án cùng mã (đã nhận gói đầy đủ trước đó) thì chỉ cập nhật
 * bản chỉnh sửa và thêm file còn thiếu; bản chỉnh sửa cũ được sao lưu thành `edit.backup-….json`.
 */
export async function importPack(packPath: string, projectsDir: string): Promise<ImportResult> {
  const { manifest } = await readManifest(packPath)
  await mkdir(projectsDir, { recursive: true })
  const existing = await findProject(projectsDir, manifest.projectId)

  if (existing) {
    const dir = join(projectsDir, existing)
    const editPath = join(dir, EDIT_FILE)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await copyFile(editPath, join(dir, `edit.backup-${stamp}.json`)).catch(() => undefined)
    const present = new Set(await readdir(dir))
    await readEntries(packPath, (name) => {
      if (name === MANIFEST || name === PROJECT_FILE) return null
      if (EDIT_FILES.includes(name) || !present.has(name)) return join(dir, name)
      return null
    })
    return { folder: existing, status: 'updated', mode: manifest.mode }
  }

  if (manifest.mode !== 'full') throw new Error('pack_needs_full')
  const folder = await uniqueFolder(projectsDir, manifest.name)
  const dir = join(projectsDir, folder)
  const tmp = `${dir}.importing`
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  try {
    await readEntries(packPath, (name) => (name === MANIFEST ? null : join(tmp, name)))
    const project = parseProject(JSON.parse(await readFile(join(tmp, PROJECT_FILE), 'utf8')))
    if (!project || project.id !== manifest.projectId) throw new Error('pack_invalid')
    await rename(tmp, dir)
  } catch (error) {
    await rm(tmp, { recursive: true, force: true })
    throw error
  }
  return { folder, status: 'created', mode: 'full' }
}

async function findProject(projectsDir: string, id: string): Promise<string | null> {
  for (const summary of await listProjects(projectsDir)) {
    const project = await readProject(projectsDir, summary.folder)
    if (project?.id === id) return summary.folder
  }
  return null
}

async function uniqueFolder(projectsDir: string, name: string): Promise<string> {
  const base = safeFileName(name)
  const taken = new Set(await readdir(projectsDir).catch(() => [] as string[]))
  for (let i = 1; ; i++) {
    const folder = `${base}${i === 1 ? '' : ` (${i})`}${PROJECT_FOLDER_SUFFIX}`
    if (!taken.has(folder) && !taken.has(`${folder}.importing`)) return folder
  }
}

/** Tên file gợi ý khi lưu gói. */
export function packFileName(project: Project, mode: PackMode): string {
  const suffix = mode === 'edits' ? ' (bản chỉnh sửa)' : ''
  return `${safeFileName(project.name)}${suffix}.${PACK_EXTENSION}`
}
