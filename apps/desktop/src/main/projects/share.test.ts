import { randomBytes } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultEdit, type Project } from '@lumora/core'
import { exportPack, importPack, packFileName } from './share'

let root: string
let alice: string
let bob: string
const FOLDER = 'Demo 2026.lumora'

const project: Project = {
  version: 1,
  id: 'proj-123',
  name: 'Demo 2026',
  createdAt: '2026-10-12T00:00:00.000Z',
  source: { kind: 'display', name: 'x', captureRect: null, scaleFactor: 1 },
  engine: 'ffmpeg',
  encoder: null,
  fps: 30,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 0,
      endedAt: 4000,
      tracks: { screen: { file: 'seg0-screen.mkv', startedAt: 0 } },
    },
  ],
  hasEvents: true,
  inputMode: 'hook',
  durationMs: 4000,
}
const media = randomBytes(2 * 1024 * 1024)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lumora-share-'))
  alice = join(root, 'alice')
  bob = join(root, 'bob')
  const dir = join(alice, FOLDER)
  await mkdir(join(dir, 'exports'), { recursive: true })
  await writeFile(join(dir, 'project.json'), JSON.stringify(project))
  await writeFile(join(dir, 'seg0-screen.mkv'), media)
  await writeFile(join(dir, 'events.jsonl'), '{"type":"move","t":1,"x":1,"y":1}\n')
  await writeFile(join(dir, 'edit.json'), JSON.stringify(createDefaultEdit(project)))
  await writeFile(join(dir, 'transcript.json'), JSON.stringify({ language: 'vi', words: [] }))
  await writeFile(join(dir, 'waveform.json'), '{}')
  await writeFile(join(dir, 'filmstrip-0.jpg'), 'x')
  await writeFile(join(dir, '.speech.mp3'), 'tmp')
  await writeFile(join(dir, 'exports', 'final.mp4'), 'big video')
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('chia sẻ dự án (.lumorapack)', () => {
  it('gửi gói đầy đủ → người nhận mở được; gửi lại bản chỉnh sửa → người gửi nhận cập nhật', async () => {
    // Alice gửi gói đầy đủ cho Bob.
    const full = join(root, packFileName(project, 'full'))
    expect(full).toMatch(/Demo 2026\.lumorapack$/)
    const sent = await exportPack(join(alice, FOLDER), project, 'full', full)
    expect(sent.bytes).toBeGreaterThan(media.length)

    const received = await importPack(full, bob)
    expect(received).toEqual({ folder: FOLDER, status: 'created', mode: 'full' })
    const bobDir = join(bob, FOLDER)
    expect((await readFile(join(bobDir, 'seg0-screen.mkv'))).equals(media)).toBe(true)
    expect(JSON.parse(await readFile(join(bobDir, 'project.json'), 'utf8')).id).toBe('proj-123')
    // Không gửi file xuất, file tạm, ảnh/sóng tính lại được.
    const names = await readdir(bobDir)
    expect(names.sort()).toEqual(
      ['edit.json', 'events.jsonl', 'project.json', 'seg0-screen.mkv', 'transcript.json'].sort(),
    )

    // Bob chỉnh sửa rồi gửi lại bản chỉnh sửa (rất nhẹ).
    const edited = createDefaultEdit(project)
    edited.frame.aspect = '9:16'
    await writeFile(join(bobDir, 'edit.json'), JSON.stringify(edited))
    const back = join(root, packFileName(project, 'edits'))
    const reply = await exportPack(bobDir, project, 'edits', back)
    expect(reply.bytes).toBeLessThan(20_000)

    const updated = await importPack(back, alice)
    expect(updated).toEqual({ folder: FOLDER, status: 'updated', mode: 'edits' })
    const aliceDir = join(alice, FOLDER)
    expect(JSON.parse(await readFile(join(aliceDir, 'edit.json'), 'utf8')).frame.aspect).toBe(
      '9:16',
    )
    // Bản cũ được sao lưu, video và file xuất của Alice vẫn nguyên.
    const backups = (await readdir(aliceDir)).filter((n) => n.startsWith('edit.backup-'))
    expect(backups).toHaveLength(1)
    expect(JSON.parse(await readFile(join(aliceDir, backups[0]!), 'utf8')).frame.aspect).toBe(
      '16:9',
    )
    expect((await stat(join(aliceDir, 'seg0-screen.mkv'))).size).toBe(media.length)
    expect(existsSync(join(aliceDir, 'exports', 'final.mp4'))).toBe(true)
  })

  it('nhập gói đầy đủ lần nữa không tạo bản trùng; gói chỉ bản chỉnh sửa cần đã có dự án', async () => {
    const full = join(root, 'a.lumorapack')
    await exportPack(join(alice, FOLDER), project, 'full', full)
    await importPack(full, bob)
    expect((await importPack(full, bob)).status).toBe('updated')
    expect(await readdir(bob)).toEqual([FOLDER])

    const edits = join(root, 'b.lumorapack')
    await exportPack(join(alice, FOLDER), project, 'edits', edits)
    await expect(importPack(edits, join(root, 'carol'))).rejects.toThrow('pack_needs_full')
  })

  it('từ chối file không phải gói Lumora và gói có tên file nguy hiểm', async () => {
    const junk = join(root, 'junk.lumorapack')
    await writeFile(junk, 'not a zip')
    await expect(importPack(junk, bob)).rejects.toThrow('pack_invalid')

    const evil = join(root, 'evil.lumorapack')
    const zip = new yazl.ZipFile()
    zip.addBuffer(
      Buffer.from(
        JSON.stringify({
          format: 'lumora-pack',
          version: 1,
          mode: 'full',
          projectId: 'x',
          name: 'x',
        }),
      ),
      'lumora-pack.json',
    )
    zip.addBuffer(Buffer.from(JSON.stringify(project)), 'project.json')
    zip.addBuffer(Buffer.from('pwned'), 'sub/evil.txt')
    zip.end()
    await pipeline(zip.outputStream, createWriteStream(evil))
    await expect(importPack(evil, bob)).rejects.toThrow('pack_invalid')
    expect(existsSync(join(bob, 'sub'))).toBe(false)
    expect(existsSync(join(bob, 'evil.txt'))).toBe(false)
  })
})
