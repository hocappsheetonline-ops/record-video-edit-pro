import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  duplicateProject,
  isProjectFolderName,
  listProjects,
  readProject,
  renameProject,
  safeJoin,
} from './library'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-lib-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function makeProject(folder: string, createdAt: string, thumbnail = false) {
  await mkdir(join(dir, folder))
  await writeFile(
    join(dir, folder, 'project.json'),
    JSON.stringify({
      version: 1,
      id: folder,
      name: `Video ${folder}`,
      createdAt,
      source: { kind: 'display', name: 'A', captureRect: null, scaleFactor: 1 },
      engine: 'ffmpeg',
      encoder: null,
      fps: 30,
      cursorHidden: true,
      segments: [{ index: 0, startedAt: 0, endedAt: 4000, tracks: {} }],
      hasEvents: false,
    }),
  )
  if (thumbnail) await writeFile(join(dir, folder, 'thumbnail.jpg'), 'x')
}

describe('listProjects', () => {
  it('liệt kê dự án mới nhất trước, bỏ thư mục hỏng', async () => {
    await makeProject('a.lumora', '2026-10-01T00:00:00.000Z')
    await makeProject('b.lumora', '2026-10-05T00:00:00.000Z', true)
    await mkdir(join(dir, 'broken.lumora'))
    await mkdir(join(dir, 'not-a-project'))
    const list = await listProjects(dir)
    expect(list.map((p) => p.folder)).toEqual(['b.lumora', 'a.lumora'])
    expect(list[0]).toMatchObject({ durationMs: 4000, hasThumbnail: true, sourceKind: 'display' })
    expect(list[1]?.hasThumbnail).toBe(false)
  })

  it('trả về rỗng khi thư mục chưa tồn tại', async () => {
    expect(await listProjects(join(dir, 'missing'))).toEqual([])
  })
})

describe('an toàn đường dẫn', () => {
  it('chỉ chấp nhận tên thư mục dự án', () => {
    expect(isProjectFolderName('2026-10-12 09.00.00.lumora')).toBe(true)
    expect(isProjectFolderName('../x.lumora')).toBe(false)
    expect(isProjectFolderName('a\\b.lumora')).toBe(false)
    expect(isProjectFolderName('.lumora')).toBe(false)
    expect(isProjectFolderName('video')).toBe(false)
  })

  it('safeJoin chặn thoát ra ngoài thư mục gốc', () => {
    expect(safeJoin(dir, 'a.lumora', 'x.mkv')).toBe(join(dir, 'a.lumora', 'x.mkv'))
    expect(safeJoin(dir, '..', 'etc')).toBeNull()
  })

  it('readProject từ chối tên thư mục lạ', async () => {
    expect(await readProject(dir, '../outside.lumora')).toBeNull()
  })
})

describe('đổi tên / nhân đôi dự án', () => {
  it('đổi tên chỉ sửa project.json; tên rỗng thì báo lỗi', async () => {
    await makeProject('a.lumora', '2026-10-01T00:00:00.000Z')
    const next = await renameProject(dir, 'a.lumora', '  Hướng dẫn Excel \n ')
    expect(next.name).toBe('Hướng dẫn Excel')
    expect((await readProject(dir, 'a.lumora'))?.name).toBe('Hướng dẫn Excel')
    await expect(renameProject(dir, 'a.lumora', '   ')).rejects.toThrow('name_empty')
    await expect(renameProject(dir, 'missing.lumora', 'x')).rejects.toThrow()
  })

  it('nhân đôi: chép bản quay và bản chỉnh sửa, bỏ video đã xuất, id và tên mới', async () => {
    await makeProject('a.lumora', '2026-10-01T00:00:00.000Z')
    await writeFile(join(dir, 'a.lumora', 'edit.json'), '{"x":1}')
    await writeFile(join(dir, 'a.lumora', 'seg0-screen.mp4'), 'video')
    await mkdir(join(dir, 'a.lumora', 'exports'))
    await writeFile(join(dir, 'a.lumora', 'exports', 'out.mp4'), 'big')
    const copy = await duplicateProject(dir, 'a.lumora', '(bản sao)')
    const again = await duplicateProject(dir, 'a.lumora', '(bản sao)')
    expect(copy).not.toBe(again)
    const p = await readProject(dir, copy)
    expect(p?.name).toBe('Video a.lumora (bản sao)')
    expect(p?.id).not.toBe('a.lumora')
    expect(readFileSync(join(dir, copy, 'edit.json'), 'utf8')).toBe('{"x":1}')
    expect(existsSync(join(dir, copy, 'seg0-screen.mp4'))).toBe(true)
    expect(existsSync(join(dir, copy, 'exports'))).toBe(false)
    expect((await listProjects(dir)).length).toBe(3)
  })
})
