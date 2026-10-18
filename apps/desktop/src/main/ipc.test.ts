import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Project } from '@lumora/core'
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
const pickVideo = vi.fn(async () => null as string | null)
const importVideo = vi.fn(async (_dir: string, project: Project, source: string) => ({
  ...project,
  name: `${project.name}+${source}`,
}))
const editCaptions = vi.fn(async (lines: { id: string; text: string }[]) => lines)
const planZooms = vi.fn(async () => [])
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
let ai: Parameters<typeof registerIpc>[1]['ai']
const speechStatus = {
  supported: true,
  platform: 'win32',
  whisper: { installed: true, models: ['small' as const] },
  piper: { installed: false, voices: [] },
}
const sendProgress = vi.fn()
const localSpeech = {
  status: vi.fn(async () => speechStatus),
  catalog: vi.fn(() => ({
    models: [{ id: 'small' as const, label: 'Small', sizeMb: 488 }],
    voices: [{ id: 'vi_VN-vais1000-medium', language: 'vi' as const, label: 'Vais', sizeMb: 63 }],
  })),
  install: vi.fn(async (_tool: string, onProgress: (c: number, t: number) => void) => {
    onProgress(3, 4)
  }),
  download: vi.fn(
    async (_kind: string, _id: string, onProgress: (c: number, t: number) => void) => {
      onProgress(5, 6)
    },
  ),
  remove: vi.fn(async () => {}),
}

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
    pixabay: vi.fn<Validators['pixabay']>(async () => ({ ok: true })),
    jamendo: vi.fn<Validators['jamendo']>(async () => ({ ok: true })),
  }
  ai = {
    highlights: vi.fn(async () => [{ start: 1000, end: 21_000, hook: 'Mẹo hay', title: 'Mẹo' }]),
    transcribe: vi.fn(async () => ({ language: 'vi', words: [] })),
    getTranscript: vi.fn(async () => null),
    suggestCuts: vi.fn(async () => []),
    plan: vi.fn(async () => [{ kind: 'captions' as const }]),
    direct: vi.fn(async () => ({
      summary: 'ok',
      questions: [],
      commands: [{ kind: 'captions' as const }],
    })),
    listLocalModels: vi.fn(async (url: string) => [`${url}:llama3.2`]),
    benchmarkLocalModel: vi.fn(async () => ({
      loadMs: 100,
      tokensPerSecond: 20,
      totalMs: 900,
    })),
    pullLocalModel: vi.fn(
      async (_url: string, _model: string, onProgress: (p: unknown) => void) => {
        onProgress({ status: 'pulling', completed: 5, total: 10 })
      },
    ),
    summarize: vi.fn(async () => ({ titles: [], description: '', hashtags: [], chapters: [] })),
    translate: vi.fn(async (lines: { id: string; text: string }[]) => lines),
    editCaptions,
    captionEmojis: vi.fn(async (lines: { id: string; text: string }[]) =>
      lines.map((l) => ({ id: l.id, emoji: '🔥' })),
    ),
    captionKeywords: vi.fn(async (lines: { id: string; text: string }[]) =>
      lines.map((l) => ({ id: l.id, keywords: [l.text.split(' ')[0]!] })),
    ),
    planZooms,
    voices: vi.fn(async () => [{ id: 'v1', name: 'Anna' }]),
    speak: vi.fn(async (_dir: string, text: string) => ({
      file: 'asset-tts-x.mp3',
      name: text,
      durationMs: 800,
    })),
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
      music: {
        find: vi.fn(async (q: { mood: string }) => ({
          file: 'music-jam.mp3',
          name: `Found ${q.mood}`,
          durationMs: 90_000,
          addedAt: 1,
          source: 'jamendo' as const,
          credit: '"Found" by Artist — CC BY 3.0 (Jamendo)',
          origin: { source: 'jamendo' as const, id: '1' },
        })),
        list: vi.fn(async () => []),
        pickAndAdd: vi.fn(async () => []),
        add: vi.fn(async (paths: string[], source: 'youtube' | 'file') =>
          paths.map((p, i) => ({
            file: `music-${i}.mp3`,
            name: p,
            durationMs: 1000,
            addedAt: 1,
            source,
          })),
        ),
        remove: vi.fn(async () => []),
        useInProject: vi.fn(async (file: string) => ({
          file: `asset-${file}`,
          name: 'x',
          durationMs: 1000,
        })),
        recentDownloads: vi.fn(async () => []),
        openYouTube: vi.fn(async () => {}),
      },
      localAi: {
        sendProgress,
        installOllama: vi.fn(async (onProgress: (c: number, t: number) => void) => {
          onProgress(1, 2)
        }),
      },
      localSpeech,
      window: {
        minimize: vi.fn(),
        toggleMaximize: vi.fn(() => true),
        close: vi.fn(),
        isMaximized: vi.fn(() => false),
      },
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
      ai,
      online: {
        search: vi.fn(async () => ({ items: [], next: null, attribution: 'Video từ Pixabay' })),
        download: vi.fn(async (_source: string, id: string) => ({
          file: `meme-${id}.mp4`,
          name: id,
          width: 1,
          height: 1,
          kind: 'video' as const,
          durationMs: 1000,
          hasAudio: false,
          thumb: '',
        })),
      },
      cache: { size: vi.fn(async () => 1234), clear: vi.fn(async () => {}) },
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
        importImage: vi.fn(async () => null),
        pickVideo,
        importVideo,
        mergeProject: vi.fn(async (_d: string, project: Project) => project),
        voiceover: vi.fn(async (_dir: string, data: Uint8Array) => ({
          file: 'asset-voice-1.m4a',
          name: 'voice',
          durationMs: data.byteLength,
        })),
        processAudio: vi.fn(async (_dir: string, file: string) => `fx-${file}`),
        reverseClip: vi.fn(async () => ({ screen: 'rev-s0-0-1000-screen.mp4' })),
        trash: async (path: string) => {
          trashed.push(path)
        },
        reveal: () => {},
      },
      updates,
      memes: {
        list: vi.fn(async () => []),
        pickAndAdd: vi.fn(async () => []),
        add: vi.fn(async () => []),
        remove: vi.fn(async () => []),
        useInProject: vi.fn(async (file: string) => ({
          file: `asset-${file}`,
          name: 'm',
          width: 10,
          height: 10,
          kind: 'image' as const,
          durationMs: 0,
          hasAudio: false,
        })),
      },
      openLogs: vi.fn(async () => {}),
      appInfo: () => ({
        name: 'Lumora',
        version: '0.0.0',
        platform: 'win32',
        encryptionAvailable: true,
        frameless: true,
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

  it('meme: kiểm tra tham số, chép vào đúng dự án', async () => {
    await expect(call(IPC.memesRemove, 5)).rejects.toThrow('Tên file không hợp lệ')
    await expect(call(IPC.memesUse, '../x', 'meme-a.png')).rejects.toThrow(
      'Thư mục dự án không hợp lệ',
    )
    expect(await call(IPC.memesUse, 'A.lumora', 'meme-a.png')).toMatchObject({
      file: 'asset-meme-a.png',
    })
    expect(await call(IPC.memesList)).toEqual([])
    // Kéo thả: chỉ nhận danh sách đường dẫn dạng chữ.
    await expect(call(IPC.memesAddPaths, 'C:/a.mp4')).rejects.toThrow('image_unsupported')
    await expect(call(IPC.memesAddPaths, [1])).rejects.toThrow('image_unsupported')
    expect(await call(IPC.memesAddPaths, ['/tmp/a.mp4'])).toEqual([])
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

  it('nhập video làm clip chính: dùng file kéo thả hoặc hộp thoại; hủy thì null', async () => {
    const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
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
    expect(await call(IPC.projectImportVideo, 'a.lumora')).toBeNull()
    expect(pickVideo).toHaveBeenCalled()
    const r = (await call(IPC.projectImportVideo, 'a.lumora', '/tmp/clip.mov')) as Project
    expect(r.name).toBe('A+/tmp/clip.mov')
    expect(importVideo).toHaveBeenCalledWith(
      join(dir, 'a.lumora'),
      expect.objectContaining({ id: 'a' }),
      '/tmp/clip.mov',
    )
    await expect(call(IPC.projectImportVideo, '../x.lumora', 'a.mp4')).rejects.toThrow()
    await expect(call(IPC.projectImportVideo, 'a.lumora', 42)).rejects.toThrow('import_no_video')
  })

  it('AI sửa phụ đề và chỉnh zoom: lọc dữ liệu trước khi gọi dịch vụ', async () => {
    const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
    await mk(join(dir, 'z.lumora'))
    await wf(
      join(dir, 'z.lumora', 'project.json'),
      JSON.stringify({
        version: 1,
        id: 'z',
        name: 'Z',
        createdAt: 'x',
        source: { kind: 'display' },
        engine: 'ffmpeg',
        segments: [{ index: 0, startedAt: 0, endedAt: 10_000, tracks: {} }],
      }),
    )
    await call(IPC.aiEditCaptions, [{ id: 'l0', text: 'a' }, { bad: 1 }], 'viết hoa', 'vi')
    expect(editCaptions).toHaveBeenCalledWith([{ id: 'l0', text: 'a' }], 'viết hoa', 'vi')
    await expect(call(IPC.aiEditCaptions, 'x', '', '')).rejects.toThrow(/không hợp lệ/)

    await call(IPC.aiPlanZooms, 'z.lumora', {
      instruction: 'đặt 2.5×',
      zooms: [{ id: 'a', start: 0, end: 2000, scale: 9, mode: 'fixed', x: 0.2, y: 0.3 }, 'rác'],
      durationMs: 999_999,
      clicks: [500, 'x', NaN],
    })
    expect(planZooms).toHaveBeenCalledWith(join(dir, 'z.lumora'), {
      instruction: 'đặt 2.5×',
      zooms: [{ id: 'a', start: 0, end: 2000, scale: 5, mode: 'fixed', x: 0.2, y: 0.3 }],
      durationMs: 10_000,
      clicks: [500],
    })
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

  it('kho nhạc: thêm đường dẫn với nguồn, từ chối dữ liệu lạ, dùng trong dự án', async () => {
    expect(await call(IPC.musicAddPaths, ['C:/a.mp3'], 'youtube')).toMatchObject([
      { name: 'C:/a.mp3', source: 'youtube' },
    ])
    expect(await call(IPC.musicAddPaths, ['C:/b.mp3'], 'bogus')).toMatchObject([{ source: 'file' }])
    await expect(call(IPC.musicAddPaths, 'C:/a.mp3', 'file')).rejects.toThrow('audio_unsupported')
    expect(await call(IPC.musicUse, 'a.lumora', 'music-1.mp3')).toMatchObject({
      file: 'asset-music-1.mp3',
    })
    expect(await call(IPC.musicRecentDownloads)).toEqual([])
    await call(IPC.musicOpenYouTube)
    expect(await call(IPC.musicList)).toEqual([])
  })

  it('trợ lý AI: chuyển lời yêu cầu và ngữ cảnh đã kiểm tra tới dịch vụ AI', async () => {
    expect(
      await call(IPC.aiPlan, 'thêm phụ đề', { language: 'vi', durationMs: 5000, hasTranscript: 1 }),
    ).toEqual([{ kind: 'captions' }])
    await expect(call(IPC.aiPlan, 42, {})).rejects.toThrow('plan_input')
    // Địa chỉ Ollama được chuẩn hóa trước khi gọi.
    expect(await call(IPC.aiLocalModels, 'http://localhost:11434/')).toEqual([
      'http://localhost:11434:llama3.2',
    ])
    expect(await call(IPC.aiLocalModels, 'junk')).toEqual(['http://127.0.0.1:11434:llama3.2'])
    // Tải model: tiến độ được chuyển xuống giao diện; tên model lạ bị từ chối.
    await call(IPC.aiPullModel, 'http://127.0.0.1:11434', 'llama3.2')
    await expect(call(IPC.aiPullModel, 'http://127.0.0.1:11434', 'bad model!')).rejects.toThrow(
      'ollama_model',
    )
    await call(IPC.aiInstallOllama)
    expect(await call(IPC.aiBenchmark, 'http://127.0.0.1:11434', 'llama3.2')).toEqual({
      loadMs: 100,
      tokensPerSecond: 20,
      totalMs: 900,
    })
  })

  it('giọng nói cục bộ: trạng thái, danh mục, cài và tải báo tiến độ kind speech, từ chối tham số lạ', async () => {
    expect(await call(IPC.aiSpeechStatus)).toEqual(speechStatus)
    expect(await call(IPC.aiSpeechCatalog)).toMatchObject({
      models: [{ id: 'small' }],
      voices: [{ id: 'vi_VN-vais1000-medium', language: 'vi' }],
    })
    // Cài công cụ: tiến độ chuyển xuống giao diện với item là tên công cụ.
    await call(IPC.aiSpeechInstall, 'whisper')
    expect(localSpeech.install).toHaveBeenCalledWith('whisper', expect.any(Function))
    expect(sendProgress).toHaveBeenCalledWith({
      kind: 'speech',
      status: 'download',
      item: 'whisper',
      completed: 3,
      total: 4,
    })
    await expect(call(IPC.aiSpeechInstall, 'ollama')).rejects.toThrow('speech_input')
    // Tải model / giọng: item là tên model hoặc giọng; loại và tên lạ bị từ chối.
    await call(IPC.aiSpeechDownload, 'model', 'large-v3-turbo-q5_0')
    expect(localSpeech.download).toHaveBeenCalledWith(
      'model',
      'large-v3-turbo-q5_0',
      expect.any(Function),
    )
    expect(sendProgress).toHaveBeenCalledWith({
      kind: 'speech',
      status: 'download',
      item: 'large-v3-turbo-q5_0',
      completed: 5,
      total: 6,
    })
    await call(IPC.aiSpeechDownload, 'voice', 'vi_VN-vais1000-medium')
    await expect(call(IPC.aiSpeechDownload, 'font', 'small')).rejects.toThrow('speech_input')
    await expect(call(IPC.aiSpeechDownload, 'model', '../etc')).rejects.toThrow('speech_input')
    await expect(call(IPC.aiSpeechDownload, 'model', 42)).rejects.toThrow('speech_input')
    await expect(call(IPC.aiSpeechDownload, 'voice', '')).rejects.toThrow('speech_input')
    await call(IPC.aiSpeechRemove, 'voice', 'vi_VN-vais1000-medium')
    expect(localSpeech.remove).toHaveBeenCalledWith('voice', 'vi_VN-vais1000-medium')
    await expect(call(IPC.aiSpeechRemove, 'model', 'a b')).rejects.toThrow('speech_input')
    expect(localSpeech.remove).toHaveBeenCalledTimes(1)
  })

  it('đạo diễn AI: kiểm tra câu yêu cầu, chuẩn hóa ngữ cảnh lộn xộn rồi gọi dịch vụ AI', async () => {
    const direct = ai.direct as Mock
    expect(
      await call(IPC.aiDirect, 'làm cho hay', {
        language: 'vi-VN-extra-long',
        durationMs: 'nope',
        hasTranscript: 1,
        hasCursor: true,
        musicTracks: ['Lofi chill', 42, null],
        projects: 'not-a-list',
        memory: 'Quy tắc: luôn dùng phụ đề tiktok',
        history: [
          { role: 'user', text: 'thêm nhạc', at: 5 },
          { role: 'robot', text: 'bỏ qua' },
          { role: 'ai', text: 'Đã thêm nhạc.', at: 'x' },
          'junk',
        ],
        transcript: '[0:00.0] Xin chào',
        clicks: [1500, 'x', -5, 4200],
        edit: 'duration 7 s',
      }),
    ).toEqual({ summary: 'ok', questions: [], commands: [{ kind: 'captions' }] })
    expect(direct).toHaveBeenCalledWith('làm cho hay', {
      language: 'vi-VN-extr',
      durationMs: 0,
      hasTranscript: false,
      hasCursor: true,
      musicTracks: ['Lofi chill'],
      projects: [],
      memory: 'Quy tắc: luôn dùng phụ đề tiktok',
      history: [
        { role: 'user', text: 'thêm nhạc', at: 5 },
        { role: 'ai', text: 'Đã thêm nhạc.', at: 0 },
      ],
      transcript: '[0:00.0] Xin chào',
      clicks: [1500, 4200],
      edit: 'duration 7 s',
    })
    // Ngữ cảnh không phải object: dùng giá trị mặc định.
    await call(IPC.aiDirect, 'x', null)
    expect(direct).toHaveBeenLastCalledWith(
      'x',
      expect.objectContaining({ memory: '', history: [], transcript: '', clicks: [], edit: '' }),
    )
    await expect(call(IPC.aiDirect, 42, {})).rejects.toThrow('direct_input')
    await expect(call(IPC.aiDirect, 'x'.repeat(2001), {})).rejects.toThrow('direct_input')
  })

  it('cửa sổ không viền: thu nhỏ, phóng to / thu về, đóng, hỏi trạng thái', async () => {
    await call(IPC.windowMinimize)
    expect(await call(IPC.windowToggleMaximize)).toBe(true)
    expect(await call(IPC.windowIsMaximized)).toBe(false)
    await call(IPC.windowClose)
  })

  it('kho online: chỉ nhận nguồn đã biết, từ khóa ngắn; tải theo mã; bộ nhớ đệm', async () => {
    expect(await call(IPC.onlineSearch, 'pixabayVideo', 'bruh', null)).toMatchObject({
      items: [],
    })
    await expect(call(IPC.onlineSearch, 'giphy', 'x', null)).rejects.toThrow('online_unknown')
    // Tenor đã ngừng hoạt động: không còn là nguồn hợp lệ.
    await expect(call(IPC.onlineSearch, 'tenor', 'x', null)).rejects.toThrow('online_unknown')
    await expect(call(IPC.onlineSearch, 'pixabayVideo', 'x'.repeat(101), null)).rejects.toThrow(
      'online_query',
    )
    await expect(call(IPC.onlineSearch, 'pixabayVideo', 'x', 5)).rejects.toThrow('online_query')
    expect(await call(IPC.onlineDownload, 'pixabay', '42')).toMatchObject({ file: 'meme-42.mp4' })
    await expect(call(IPC.onlineDownload, 'http://evil', '42')).rejects.toThrow('online_unknown')
    await expect(call(IPC.onlineDownload, 'tenor', '42')).rejects.toThrow('online_unknown')
    expect(await call(IPC.cacheInfo)).toBe(1234)
    expect(await call(IPC.cacheClear)).toBe(1234)
  })

  it('giọng đọc AI: danh sách giọng, đọc câu vào dự án hợp lệ', async () => {
    const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
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
    expect(await call(IPC.aiVoices)).toEqual([{ id: 'v1', name: 'Anna' }])
    expect(await call(IPC.aiSpeak, 'a.lumora', 'Bruh', 'v1')).toMatchObject({ name: 'Bruh' })
    await expect(call(IPC.aiSpeak, 'a.lumora', 5, 'v1')).rejects.toThrow('speech_empty')
    await expect(call(IPC.aiSpeak, '../a', 'x', 'v1')).rejects.toThrow()
  })

  it('âm thanh: lưu lồng tiếng (nhận ArrayBuffer), xử lý hiệu ứng chỉ với tên file an toàn', async () => {
    const { mkdir: mk } = await import('node:fs/promises')
    await mk(join(dir, 'b.lumora'))
    expect(await call(IPC.assetsVoiceover, 'b.lumora', new ArrayBuffer(300))).toMatchObject({
      durationMs: 300,
    })
    await expect(call(IPC.assetsVoiceover, 'b.lumora', 'x')).rejects.toThrow('audio_unreadable')
    expect(await call(IPC.audioProcess, 'b.lumora', 'seg0-mic.webm', { noise: 'strong' })).toBe(
      'fx-seg0-mic.webm',
    )
    await expect(call(IPC.audioProcess, 'b.lumora', '../x', {})).rejects.toThrow('audio_unreadable')
  })

  it('phát ngược clip: chỉ nhận khoảng thời gian hợp lệ', async () => {
    const { mkdir: mk } = await import('node:fs/promises')
    await mk(join(dir, 'r.lumora'))
    expect(await call(IPC.clipReverse, 'r.lumora', 0, 1000)).toEqual({
      screen: 'rev-s0-0-1000-screen.mp4',
    })
    for (const bad of [
      [1000, 500],
      [-1, 10],
      ['0', 10],
      [0, Infinity],
    ])
      await expect(call(IPC.clipReverse, 'r.lumora', ...bad)).rejects.toThrow('reverse_failed')
  })
})
