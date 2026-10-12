import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runFfmpeg } from '../ffmpeg/runner'
import { importImageFile, MemeLibrary } from './images'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-img-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function makeImage(name: string, size = '320x180', frames = 1) {
  const path = join(dir, name)
  const r = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${size}:rate=5:duration=${frames / 5}`,
    ...(frames === 1 ? ['-frames:v', '1'] : []),
    path,
  ])
  expect(r.code).toBe(0)
  return path
}

describe('ảnh / GIF meme', () => {
  it('thêm ảnh vào dự án: tên an toàn, đọc đúng kích thước', async () => {
    const project = join(dir, 'p')
    await mkdir(project)
    const asset = await importImageFile(await makeImage('Mèo cười.png'), project, runFfmpeg)
    expect(asset).toMatchObject({ name: 'Mèo cười', width: 320, height: 180 })
    expect(asset.file).toMatch(/^asset-[0-9a-f]{12}\.png$/)
    expect(existsSync(join(project, asset.file))).toBe(true)
  })

  it('từ chối đuôi lạ và file hỏng', async () => {
    await writeFile(join(dir, 'x.bmp'), 'x')
    await expect(importImageFile(join(dir, 'x.bmp'), dir, runFfmpeg)).rejects.toThrow(
      'image_unsupported',
    )
    await writeFile(join(dir, 'fake.png'), 'not an image')
    await expect(importImageFile(join(dir, 'fake.png'), dir, runFfmpeg)).rejects.toThrow(
      'image_unreadable',
    )
  })

  it('thư viện meme: thêm (cả GIF động), có ảnh thu nhỏ, dùng trong dự án, xóa', async () => {
    const lib = new MemeLibrary(join(dir, 'memes'), runFfmpeg)
    expect(await lib.list()).toEqual([])
    const gif = await makeImage('dance.gif', '200x200', 6)
    const png = await makeImage('wow.png')
    const items = await lib.add([gif, png])
    expect(items.map((m) => [m.name, m.width, m.height])).toEqual([
      ['dance', 200, 200],
      ['wow', 320, 180],
    ])
    expect(items[0]!.thumb).toMatch(/^data:image\/jpeg;base64,.{100,}/)

    const project = join(dir, 'p')
    await mkdir(project)
    const used = await lib.useInProject(items[0]!.file, project)
    expect(used.file).toBe(`asset-${items[0]!.file}`)
    expect(existsSync(join(project, used.file))).toBe(true)
    // Dùng lại không chép thêm bản mới.
    expect(await lib.useInProject(items[0]!.file, project)).toEqual(used)
    await expect(lib.useInProject('meme-nope.png', project)).rejects.toThrow('meme_missing')

    const left = await lib.remove(items[0]!.file)
    expect(left.map((m) => m.name)).toEqual(['wow'])
    expect(existsSync(join(dir, 'memes', items[0]!.file))).toBe(false)
  }, 60_000)
})
