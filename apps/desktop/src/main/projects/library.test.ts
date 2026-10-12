import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isProjectFolderName, listProjects, readProject, safeJoin } from './library'

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
