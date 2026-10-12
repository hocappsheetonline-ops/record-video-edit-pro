import { randomUUID } from 'node:crypto'
import { cp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { writeJsonFile } from '../json-file'
import {
  EDIT_FILE,
  EVENTS_FILE,
  parseEditState,
  parseEvents,
  parseProject,
  PROJECT_FILE,
  PROJECT_FOLDER_SUFFIX,
  projectFolderName,
  THUMBNAIL_FILE,
  type EditState,
  type InputEvent,
  type Project,
} from '@lumora/core'
import type { ProjectSummary } from '@shared/ipc'

/** Tên thư mục dự án hợp lệ: chỉ một cấp, có đuôi .lumora, không chứa ký tự điều hướng. */
export function isProjectFolderName(name: string): boolean {
  return (
    name.endsWith(PROJECT_FOLDER_SUFFIX) &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.') &&
    name !== PROJECT_FOLDER_SUFFIX
  )
}

/** Ghép đường dẫn và bảo đảm kết quả vẫn nằm trong thư mục gốc (chống "../"). */
export function safeJoin(root: string, ...parts: string[]): string | null {
  const base = resolve(root)
  const full = resolve(base, ...parts)
  return full.startsWith(base + sep) ? full : null
}

export async function readProject(projectsDir: string, folder: string): Promise<Project | null> {
  if (!isProjectFolderName(folder)) return null
  const file = safeJoin(projectsDir, folder, PROJECT_FILE)
  if (!file) return null
  try {
    return parseProject(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    return null
  }
}

/** Liệt kê dự án trong thư mục, mới nhất trước. Bỏ qua thư mục hỏng hoặc không phải dự án. */
export async function listProjects(projectsDir: string): Promise<ProjectSummary[]> {
  let entries: string[]
  try {
    entries = await readdir(projectsDir)
  } catch {
    return []
  }
  const summaries = await Promise.all(
    entries.filter(isProjectFolderName).map(async (folder): Promise<ProjectSummary | null> => {
      const project = await readProject(projectsDir, folder)
      if (!project) return null
      const hasThumbnail = await stat(join(projectsDir, folder, THUMBNAIL_FILE)).then(
        (s) => s.isFile(),
        () => false,
      )
      return {
        folder,
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        durationMs: project.durationMs,
        sourceKind: project.source.kind,
        hasThumbnail,
      }
    }),
  )
  return summaries
    .filter((s): s is ProjectSummary => s !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Bản chỉnh sửa đã lưu, đã kiểm tra hợp lệ theo bản quay. Null nếu chưa có hoặc dự án lỗi. */
export async function readEdit(projectsDir: string, folder: string): Promise<EditState | null> {
  const project = await readProject(projectsDir, folder)
  const file = safeJoin(projectsDir, folder, EDIT_FILE)
  if (!project || !file) return null
  try {
    return parseEditState(JSON.parse(await readFile(file, 'utf8')), project)
  } catch {
    return null
  }
}

export async function writeEdit(
  projectsDir: string,
  folder: string,
  edit: unknown,
): Promise<EditState> {
  const project = await readProject(projectsDir, folder)
  const file = safeJoin(projectsDir, folder, EDIT_FILE)
  if (!project || !file) throw new Error('Dự án không hợp lệ')
  const parsed = parseEditState(edit, project)
  await writeJsonFile(file, parsed)
  return parsed
}

export async function readEvents(projectsDir: string, folder: string): Promise<InputEvent[]> {
  if (!isProjectFolderName(folder)) return []
  const file = safeJoin(projectsDir, folder, EVENTS_FILE)
  if (!file) return []
  try {
    return parseEvents(await readFile(file, 'utf8'))
  } catch {
    return []
  }
}

/** Đổi tên hiển thị của dự án (thư mục giữ nguyên). Trả về dự án mới. */
export async function renameProject(
  projectsDir: string,
  folder: string,
  name: string,
): Promise<Project> {
  const project = await readProject(projectsDir, folder)
  const file = safeJoin(projectsDir, folder, PROJECT_FILE)
  // Bỏ ký tự điều khiển (xuống dòng, tab…) khỏi tên.
  const clean = [...name]
    .filter((c) => c.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 120)
  if (!project || !file) throw new Error('Không tìm thấy dự án')
  if (!clean) throw new Error('name_empty')
  const next = { ...project, name: clean }
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

/**
 * Nhân đôi dự án (bản quay + bản chỉnh sửa, không chép video đã xuất) thành dự án mới tên
 * "… (bản sao)". Trả về tên thư mục mới.
 */
export async function duplicateProject(
  projectsDir: string,
  folder: string,
  copySuffix: string,
): Promise<string> {
  const project = await readProject(projectsDir, folder)
  const from = safeJoin(projectsDir, folder)
  if (!project || !from) throw new Error('Không tìm thấy dự án')
  // Tên thư mục theo thời điểm nhân đôi; trùng thì lùi thêm 1 giây.
  let when = Date.now()
  let target = projectFolderName(new Date(when))
  while (
    await stat(join(projectsDir, target)).then(
      () => true,
      () => false,
    )
  ) {
    when += 1000
    target = projectFolderName(new Date(when))
  }
  const to = join(projectsDir, target)
  await cp(from, to, {
    recursive: true,
    filter: (src) =>
      !src
        .slice(from.length)
        .replace(/^[\\/]/, '')
        .startsWith('exports'),
  })
  const copy = { ...project, id: randomUUID(), name: `${project.name} ${copySuffix}`.slice(0, 120) }
  await writeFile(join(to, PROJECT_FILE), `${JSON.stringify(copy, null, 2)}\n`)
  return target
}
