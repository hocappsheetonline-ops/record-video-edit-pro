import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import {
  parseProject,
  PROJECT_FILE,
  PROJECT_FOLDER_SUFFIX,
  THUMBNAIL_FILE,
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
