import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc'
import type { Validators } from './key-validation'
import { SecretStore, type Cipher } from './secret-store'
import { SettingsStore } from './settings-store'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const cipher: Cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
}

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234'

let dir: string
let handlers: Map<string, Handler>
let trashed: string[]
const recording = {
  capabilities: vi.fn(),
  sources: vi.fn(),
  pickRegion: vi.fn(),
  submitRegion: vi.fn(),
  start: vi.fn(async () => {}),
  activeSession: vi.fn(() => null),
  beginSegment: vi.fn(),
  trackStarted: vi.fn(async () => {}),
  writeChunk: vi.fn(async () => {}),
  endSegment: vi.fn(),
  finish: vi.fn(),
  cancel: vi.fn(),
}
const updates = {
  state: { state: 'none' } as const,
  check: vi.fn(async () => ({ state: 'checking' }) as const),
  install: vi.fn(),
}
let validators: { [K in keyof Validators]: Mock<Validators[K]> }

// Electron biến lỗi ném ra trong handler (kể cả đồng bộ) thành promise bị từ chối.
const call = async (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lumora-ipc-'))
  handlers = new Map()
  trashed = []
  vi.clearAllMocks()
  validators = {
    elevenlabs: vi.fn<Validators['elevenlabs']>(async () => ({ ok: true })),
    anthropic: vi.fn<Validators['anthropic']>(async () => ({ ok: true })),
  }
  registerIpc(
    {
      handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
    } as unknown as Pick<IpcMain, 'handle'>,
    {
      settings: new SettingsStore(join(dir, 'settings.json')),
      secrets: new SecretStore(join(dir, 'secrets.json'), cipher),
      validators,
      recording,
      live: {
        getConfig: vi.fn(),
        updateConfig: vi.fn(),
        secrets: vi.fn(),
        setSecret: vi.fn(),
        openRoom: vi.fn(),
        closeRoom: vi.fn(),
        start: vi.fn(async () => {}),
        write: vi.fn(async () => {}),
        stop: vi.fn(),
        startComments: vi.fn(async () => {}),
        stopComments: vi.fn(),
        caption: vi.fn(async () => ''),
      },
      ai: {
        transcribe: vi.fn(async () => ({ language: 'vi', words: [] })),
        getTranscript: vi.fn(async () => null),
        suggestCuts: vi.fn(async () => []),
        summarize: vi.fn(async () => ({ titles: [], description: '', hashtags: [], chapters: [] })),
        translate: vi.fn(async (lines: { id: string; text: string }[]) => lines),
      },
      exports: {
        start: vi.fn(async () => 'e1'),
        write: vi.fn(async () => {}),
        finish: vi.fn(async () => ({ path: 'x', fileName: 'x' })),
        cancel: vi.fn(async () => {}),
      },
      projects: {
        dir: async () => dir,
        waveform: vi.fn(async () => ({ bucketMs: 20, peaks: [1, 2] })),
        filmstrip: vi.fn(async () => null),
        pickPackSavePath: vi.fn(async () => null),
        pickPackToImport: vi.fn(async () => null),
        importAudio: vi.fn(async () => null),
        soundEffect: vi.fn(async (_dir: string, id: string) => ({
          file: `asset-sfx-${id}.m4a`,
          name: id,
          durationMs: 500,
        })),
        assetPeaks: vi.fn(async () => null),
        trash: async (path: string) => {
          trashed.push(path)
        },
        reveal: () => {},
      },
      updates,
      openLogs: vi.fn(async () => {}),
      appInfo: () => ({
        name: 'Lumora',
        version: '0.0.0',
        platform: 'win32',
        encryptionAvailable: true,
      }),
    },
  )
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('registerIpc', () => {
  it('đăng ký đủ các kênh', () => {
    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC).sort())
  })

  it('cập nhật app: đọc trạng thái, kiểm tra, cài đặt', async () => {
    expect(await call(IPC.updateState)).toEqual({ state: 'none' })
    expect(await call(IPC.updateCheck)).toEqual({ state: 'checking' })
    await call(IPC.updateInstall)
    expect(updates.install).toHaveBeenCalled()
  })

  it('dạng sóng: kiểm tra tên thư mục, dự án không tồn tại thì null', async () => {
    await expect(call(IPC.projectsWaveform, '../x')).rejects.toThrow('Thư mục dự án không hợp lệ')
    expect(await call(IPC.projectsWaveform, 'Missing.lumora')).toBeNull()
    await expect(call(IPC.projectsFilmstrip, '..\\x')).rejects.toThrow('Thư mục dự án không hợp lệ')
  })

  it('chia sẻ: kiểm tra kiểu gói, hủy hộp thoại thì trả null', async () => {
    await expect(call(IPC.projectsSharePack, 'A.lumora', 'everything')).rejects.toThrow(
      'Kiểu gói không hợp lệ',
    )
    await expect(call(IPC.projectsSharePack, 'Missing.lumora', 'full')).rejects.toThrow(
      'Không tìm thấy dự án',
    )
    expect(await call(IPC.projectsImportPack)).toBeNull()
  })

  it('âm thanh: kiểm tra thư mục và tham số', async () => {
    await expect(call(IPC.assetsAddAudio, '../x')).rejects.toThrow('Thư mục dự án không hợp lệ')
    await expect(call(IPC.assetsAddSfx, 'A.lumora', 42)).rejects.toThrow('sfx_unknown')
    expect(await call(IPC.assetsAddSfx, 'A.lumora', 'pop')).toMatchObject({
      file: 'asset-sfx-pop.m4a',
    })
    await expect(call(IPC.assetsPeaks, 'A.lumora', null)).rejects.toThrow('Tên file không hợp lệ')
  })

  it('cập nhật settings', async () => {
    expect(await call(IPC.settingsUpdate, { language: 'en' })).toMatchObject({ language: 'en' })
    expect(await call(IPC.settingsGet)).toMatchObject({ language: 'en' })
  })

  it('bỏ qua patch settings không phải object', async () => {
    expect(await call(IPC.settingsUpdate, 'oops')).toMatchObject({ language: 'vi' })
  })

  it('lưu key và chỉ trả về dạng rút gọn', async () => {
    const status = await call(IPC.secretsSave, 'anthropic', `  ${KEY}  `)
    expect(status).toMatchObject({ anthropic: { state: 'saved', masked: 'sk-a••••••••1234' } })
  })

  it('từ chối loại key lạ', async () => {
    await expect(call(IPC.secretsSave, 'openai', KEY)).rejects.toThrow(/không hợp lệ/)
  })

  it('từ chối key sai định dạng', async () => {
    await expect(call(IPC.secretsSave, 'anthropic', 'abc')).rejects.toThrow(/too_short/)
  })

  it('kiểm tra key đã lưu khi không truyền giá trị', async () => {
    await call(IPC.secretsSave, 'anthropic', KEY)
    expect(await call(IPC.secretsTest, 'anthropic')).toEqual({ ok: true })
    expect(validators.anthropic).toHaveBeenCalledWith(KEY)
  })

  it('kiểm tra key mới khi có truyền giá trị', async () => {
    await call(IPC.secretsTest, 'elevenlabs', 'y'.repeat(30))
    expect(validators.elevenlabs).toHaveBeenCalledWith('y'.repeat(30))
  })

  it('báo lỗi định dạng khi chưa có key nào', async () => {
    expect(await call(IPC.secretsTest, 'anthropic')).toEqual({
      ok: false,
      reason: 'format',
      message: 'empty',
    })
  })

  it('xóa key', async () => {
    await call(IPC.secretsSave, 'anthropic', KEY)
    expect(await call(IPC.secretsDelete, 'anthropic')).toMatchObject({
      anthropic: { state: 'missing' },
    })
  })

  it('kiểm tra tùy chọn quay trước khi bắt đầu', async () => {
    await expect(call(IPC.startRecording, { source: { kind: 'tv' } })).rejects.toThrow(
      /không hợp lệ/,
    )
    await call(IPC.startRecording, { source: { kind: 'display', displayId: '1' }, fps: 30 })
    expect(recording.start).toHaveBeenCalledWith(expect.objectContaining({ fps: 30 }))
  })

  it('kiểm tra chỉ số đoạn, loại track và dữ liệu ghi', async () => {
    await expect(call(IPC.writeChunk, -1, 'mic', new ArrayBuffer(1))).rejects.toThrow(/Chỉ số/)
    await expect(call(IPC.writeChunk, 0, 'video', new ArrayBuffer(1))).rejects.toThrow(/Loại track/)
    await expect(call(IPC.writeChunk, 0, 'mic', 'text')).rejects.toThrow(/Dữ liệu/)
    await call(IPC.writeChunk, 0, 'mic', new Uint8Array([1, 2]).buffer)
    expect(recording.writeChunk).toHaveBeenCalledWith(0, 'mic', new Uint8Array([1, 2]))
    await expect(call(IPC.trackStarted, 0, 'mic', 'now')).rejects.toThrow(/Thời điểm/)
  })

  it('bỏ vùng chọn không hợp lệ', async () => {
    await call(IPC.submitRegion, { x: 0, y: 0, width: -5, height: 10 })
    expect(recording.submitRegion).toHaveBeenCalledWith(null)
    await call(IPC.submitRegion, { x: 1, y: 2, width: 3, height: 4 })
    expect(recording.submitRegion).toHaveBeenLastCalledWith({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('xóa dự án chỉ trong thư mục dự án', async () => {
    await expect(call(IPC.projectsDelete, '../evil.lumora')).rejects.toThrow(/không hợp lệ/)
    await call(IPC.projectsDelete, 'a.lumora')
    expect(trashed).toEqual([join(dir, 'a.lumora')])
  })

  it('lưu phụ đề vào thư mục exports, chỉ cho phép đuôi văn bản', async () => {
    const { mkdir: mk, writeFile: wf, readFile: rf } = await import('node:fs/promises')
    await mk(join(dir, 'a.lumora'))
    await wf(
      join(dir, 'a.lumora', 'project.json'),
      JSON.stringify({
        version: 1,
        id: 'a',
        name: 'A',
        createdAt: 'x',
        source: { kind: 'display' },
        engine: 'ffmpeg',
        segments: [],
      }),
    )
    const saved = (await call(IPC.saveExportText, 'a.lumora', 'Phụ đề: A.srt', '1\n')) as {
      path: string
      fileName: string
    }
    expect(saved.fileName).toBe('Phụ đề A.srt')
    expect(await rf(saved.path, 'utf8')).toBe('1\n')
    await expect(call(IPC.saveExportText, 'a.lumora', 'virus.exe', 'x')).rejects.toThrow(
      /không được phép/,
    )
  })
})
