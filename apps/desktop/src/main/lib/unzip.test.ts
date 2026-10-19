import { createWriteStream } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractZip } from './unzip'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-unzip-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function makeZip(entries: Record<string, string>): Promise<string> {
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) zip.addEmptyDirectory(name)
    else zip.addBuffer(Buffer.from(content), name)
  }
  zip.end()
  const path = join(dir, 'in.zip')
  await pipeline(zip.outputStream, createWriteStream(path))
  return path
}

describe('extractZip', () => {
  it('chỉ ghi các mục được chọn, giữ cấu trúc thư mục con', async () => {
    const zip = await makeZip({
      'piper/piper.exe': 'exe',
      'piper/espeak-ng-data/': '',
      'piper/espeak-ng-data/vi_dict': 'dict',
      'README.md': 'skip',
    })
    const out = join(dir, 'out')
    const written = await extractZip(zip, out, (name) =>
      name.startsWith('piper/') ? name.slice('piper/'.length) : null,
    )
    expect(written.sort()).toEqual(['espeak-ng-data/vi_dict', 'piper.exe'])
    expect(await readFile(join(out, 'piper.exe'), 'utf8')).toBe('exe')
    expect(await readFile(join(out, 'espeak-ng-data', 'vi_dict'), 'utf8')).toBe('dict')
    expect(await readdir(out)).not.toContain('README.md')
  })

  it('cho phép đổi tên / làm phẳng đường dẫn', async () => {
    const zip = await makeZip({ 'Release/a.dll': 'a', 'Release/whisper-cli.exe': 'w' })
    const out = join(dir, 'flat')
    const written = await extractZip(zip, out, (name) => name.split('/').pop() ?? null)
    expect(written.sort()).toEqual(['a.dll', 'whisper-cli.exe'])
    expect((await readdir(out)).sort()).toEqual(['a.dll', 'whisper-cli.exe'])
  })

  it('từ chối đường dẫn thoát khỏi thư mục đích', async () => {
    const zip = await makeZip({ 'x.txt': 'x' })
    await expect(extractZip(zip, join(dir, 'o'), () => '../escape.txt')).rejects.toThrow(
      /unzip_unsafe_path/,
    )
  })
})
