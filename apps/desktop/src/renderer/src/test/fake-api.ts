import { vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  maskSecret,
  type AppSettings,
  type LiveComment,
  type Project,
  type SecretKey,
  SECRET_KEYS,
} from '@lumora/core'
import type {
  LocalAiProgress,
  MusicTrack,
  CaptureSources,
  LiveConfig,
  LiveEnded,
  LiveStatus,
  LumoraApi,
  ProjectSummary,
  RecordingCommand,
  SecretsStatus,
  UpdateState,
} from '@shared/ipc'

export const sampleProject: Project = {
  version: 1,
  id: 'p1',
  name: '2026-10-12 09.30.00',
  createdAt: '2026-10-12T02:30:00.000Z',
  source: {
    kind: 'display',
    name: 'Dell',
    captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  },
  engine: 'ffmpeg',
  encoder: 'h264_nvenc',
  fps: 60,
  cursorHidden: true,
  segments: [
    {
      index: 0,
      startedAt: 1000,
      endedAt: 6000,
      tracks: {
        screen: { file: 'seg0-screen.mkv', startedAt: 1000 },
        camera: { file: 'seg0-camera.mkv', startedAt: 1100 },
        mic: { file: 'seg0-mic.webm', startedAt: 1050 },
      },
    },
    {
      index: 1,
      startedAt: 9000,
      endedAt: 11000,
      tracks: { screen: { file: 'seg1-screen.mkv', startedAt: 9000 } },
    },
  ],
  hasEvents: true,
  inputMode: 'hook',
  durationMs: 7000,
}

export const sampleTranscript = {
  language: 'vi',
  words: [
    { text: 'Xin', start: 0, end: 300 },
    { text: 'chào', start: 350, end: 700 },
    { text: 'ừm', start: 800, end: 1000 },
    { text: 'các', start: 1100, end: 1300 },
    { text: 'bạn.', start: 1350, end: 1700 },
    { text: 'Hôm', start: 4100, end: 4300 },
    { text: 'nay', start: 4350, end: 4600 },
  ],
}

export const sampleSummary: ProjectSummary = {
  folder: '2026-10-12 09.30.00.lumora',
  id: 'p1',
  name: sampleProject.name,
  createdAt: sampleProject.createdAt,
  durationMs: 7000,
  sourceKind: 'display',
  hasThumbnail: true,
}

export const sampleSources: CaptureSources = {
  displays: [
    {
      id: '1',
      label: '',
      bounds: { x: 0, y: 0, width: 1536, height: 864 },
      scaleFactor: 1.25,
      primary: true,
      thumbnail: '',
    },
    {
      id: '2',
      label: 'LG UltraFine',
      bounds: { x: 1536, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1,
      primary: false,
      thumbnail: '',
    },
  ],
  windows: [{ id: 'window:7:0', name: 'Visual Studio Code', thumbnail: '' }],
}

/** API giả thay cho main process, giữ trạng thái trong bộ nhớ. */
export function createFakeApi(
  options: { encryptionAvailable?: boolean; screenEngine?: 'ffmpeg' | 'browser' } = {},
) {
  let settings: AppSettings = { ...DEFAULT_SETTINGS }
  let maximized = false
  const localAiListeners = new Set<(p: LocalAiProgress) => void>()
  let music: MusicTrack[] = []
  const secrets: Partial<Record<SecretKey, string>> = {}
  let projects = [sampleSummary]
  const commandListeners = new Set<(c: RecordingCommand) => void>()
  const commentListeners = new Set<(c: LiveComment[]) => void>()
  const updateListeners = new Set<(s: UpdateState) => void>()
  const statusListeners = new Set<(s: LiveStatus) => void>()
  const endedListeners = new Set<(e: LiveEnded) => void>()
  let liveConfig: LiveConfig = {
    destinations: [],
    resolution: 720,
    videoBitrate: 4500,
    recordLocally: true,
    publicUrl: '',
    youtubeVideoId: '',
    facebookVideoId: '',
  }
  const secretNames = new Set<string>()
  const liveSecrets = () => ({
    streamKeys: Object.fromEntries(
      liveConfig.destinations.map((d) => [d.id, secretNames.has(`stream:${d.id}`)]),
    ),
    youtubeApiKey: secretNames.has('youtube-api-key'),
    facebookToken: secretNames.has('facebook-token'),
  })
  const finishedListeners = new Set<(folder: string) => void>()
  const status = (): SecretsStatus =>
    Object.fromEntries(
      SECRET_KEYS.map((key) => [
        key,
        secrets[key] ? { state: 'saved', masked: maskSecret(secrets[key]) } : { state: 'missing' },
      ]),
    ) as SecretsStatus
  const api = {
    getAppInfo: async () => ({
      name: 'Lumora',
      version: '0.1.0',
      platform: 'win32',
      encryptionAvailable: options.encryptionAvailable ?? true,
      frameless: true,
    }),
    minimizeWindow: vi.fn<LumoraApi['minimizeWindow']>(async () => {}),
    toggleMaximizeWindow: vi.fn<LumoraApi['toggleMaximizeWindow']>(async () => {
      maximized = !maximized
      return maximized
    }),
    closeWindow: vi.fn<LumoraApi['closeWindow']>(async () => {}),
    isWindowMaximized: vi.fn<LumoraApi['isWindowMaximized']>(async () => maximized),
    onWindowMaximized: vi.fn<LumoraApi['onWindowMaximized']>(() => () => {}),
    getUpdateState: vi.fn<LumoraApi['getUpdateState']>(async () => ({ state: 'idle' })),
    checkForUpdates: vi.fn<LumoraApi['checkForUpdates']>(async () => ({ state: 'none' })),
    installUpdate: vi.fn<LumoraApi['installUpdate']>(async () => {}),
    onUpdateState: (l: (s: UpdateState) => void) => {
      updateListeners.add(l)
      return () => updateListeners.delete(l)
    },
    openLogs: vi.fn<LumoraApi['openLogs']>(async () => {}),
    getSettings: async () => settings,
    updateSettings: async (patch: Partial<AppSettings>) => (settings = { ...settings, ...patch }),
    getSecretsStatus: async () => status(),
    saveSecret: async (key: SecretKey, value: string) => {
      secrets[key] = value
      return status()
    },
    deleteSecret: async (key: SecretKey) => {
      delete secrets[key]
      return status()
    },
    testSecret: vi.fn<LumoraApi['testSecret']>(async () => ({ ok: true })),

    getCaptureSources: vi.fn<LumoraApi['getCaptureSources']>(async () => sampleSources),
    getRecorderCapabilities: vi.fn<LumoraApi['getRecorderCapabilities']>(async () => ({
      screenEngine: options.screenEngine ?? 'ffmpeg',
      backend: options.screenEngine === 'browser' ? null : 'ddagrab',
      encoder: options.screenEngine === 'browser' ? null : 'h264_nvenc',
      systemAudio: true,
    })),
    pickRegion: vi.fn<LumoraApi['pickRegion']>(async () => ({
      x: 10,
      y: 20,
      width: 800,
      height: 450,
    })),
    submitRegion: vi.fn<LumoraApi['submitRegion']>(async () => {}),
    startRecording: vi.fn<LumoraApi['startRecording']>(async () => {}),
    getActiveSession: vi.fn<LumoraApi['getActiveSession']>(async () => null),
    beginSegment: vi.fn<LumoraApi['beginSegment']>(async () => ({ index: 0, rendererTracks: [] })),
    trackStarted: vi.fn<LumoraApi['trackStarted']>(async () => {}),
    writeChunk: vi.fn<LumoraApi['writeChunk']>(async () => {}),
    endSegment: vi.fn<LumoraApi['endSegment']>(async () => {}),
    finishRecording: vi.fn<LumoraApi['finishRecording']>(async () => {}),
    cancelRecording: vi.fn<LumoraApi['cancelRecording']>(async () => {}),
    onRecordingCommand: (l: (c: RecordingCommand) => void) => {
      commandListeners.add(l)
      return () => commandListeners.delete(l)
    },
    onRecordingFinished: (l: (folder: string) => void) => {
      finishedListeners.add(l)
      return () => finishedListeners.delete(l)
    },
    onRecordingError: () => () => {},

    listProjects: vi.fn<LumoraApi['listProjects']>(async () => projects),
    getProject: vi.fn<LumoraApi['getProject']>(async (folder: string) =>
      folder === sampleSummary.folder ? sampleProject : null,
    ),
    deleteProject: vi.fn<LumoraApi['deleteProject']>(
      async (folder: string) => (projects = projects.filter((p) => p.folder !== folder)),
    ),
    revealProject: vi.fn<LumoraApi['revealProject']>(async () => {}),
    getEdit: vi.fn<LumoraApi['getEdit']>(async () => null),
    saveEdit: vi.fn<LumoraApi['saveEdit']>(async () => {}),
    getEvents: vi.fn<LumoraApi['getEvents']>(async () => []),
    getWaveform: vi.fn<LumoraApi['getWaveform']>(async () => null),
    getFilmstrip: vi.fn<LumoraApi['getFilmstrip']>(async () => null),
    sharePack: vi.fn<LumoraApi['sharePack']>(async (_folder, mode) => ({
      path: `/x/Demo${mode === 'edits' ? ' (bản chỉnh sửa)' : ''}.lumorapack`,
      bytes: mode === 'edits' ? 4096 : 52_428_800,
    })),
    addAudioFile: vi.fn<LumoraApi['addAudioFile']>(async () => ({
      file: 'asset-abc.mp3',
      name: 'Nhạc nền',
      durationMs: 3000,
    })),
    addSoundEffect: vi.fn<LumoraApi['addSoundEffect']>(async (_folder, id) => ({
      file: `asset-sfx-${id}.m4a`,
      name: id,
      durationMs: 800,
    })),
    getAssetPeaks: vi.fn<LumoraApi['getAssetPeaks']>(async () => ({
      bucketMs: 20,
      peaks: Array.from({ length: 150 }, (_, i) => (i * 7) % 255),
    })),
    addImageFile: vi.fn<LumoraApi['addImageFile']>(async () => ({
      file: 'asset-img.png',
      name: 'cat',
      width: 400,
      height: 200,
      kind: 'image',
      durationMs: 0,
      hasAudio: false,
    })),
    listMemes: vi.fn<LumoraApi['listMemes']>(async () => [
      {
        file: 'meme-a.gif',
        name: 'Mèo cười',
        width: 300,
        height: 300,
        kind: 'image',
        durationMs: 0,
        hasAudio: false,
        thumb: 'data:image/jpeg;base64,',
      },
      {
        file: 'meme-b.mp4',
        name: 'Bruh',
        width: 640,
        height: 360,
        kind: 'video',
        durationMs: 2500,
        hasAudio: true,
        thumb: 'data:image/jpeg;base64,',
      },
    ]),
    importMemes: vi.fn<LumoraApi['importMemes']>(async () => []),
    listMusic: vi.fn<LumoraApi['listMusic']>(async () => music),
    findMusic: vi.fn<LumoraApi['findMusic']>(async (q) => {
      const track = {
        file: `music-jamendo-${music.length + 1}.mp3`,
        name: `Found ${q.mood || q.tempo} – Artist`,
        durationMs: 120_000,
        addedAt: music.length + 1,
        source: 'jamendo' as const,
        credit: `"Found ${q.mood || q.tempo}" by Artist — CC BY 3.0 (Jamendo)`,
        origin: { source: 'jamendo' as const, id: String(music.length + 1) },
      }
      music.unshift(track)
      return track
    }),
    importMusic: vi.fn<LumoraApi['importMusic']>(async () => music),
    addMusicPaths: vi.fn<LumoraApi['addMusicPaths']>(async (paths, source) => {
      for (const p of paths)
        music.unshift({
          file: `music-${music.length + 1}.mp3`,
          name: p.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''),
          durationMs: 30_000,
          addedAt: music.length + 1,
          source,
        })
      return [...music]
    }),
    removeMusic: vi.fn<LumoraApi['removeMusic']>(async (file) => {
      music = music.filter((m) => m.file !== file)
      return [...music]
    }),
    useMusic: vi.fn<LumoraApi['useMusic']>(async (_folder, file) => {
      const track = music.find((m) => m.file === file)
      if (!track) throw new Error('music_missing')
      return { file: `asset-${file}`, name: track.name, durationMs: track.durationMs }
    }),
    recentAudioDownloads: vi.fn<LumoraApi['recentAudioDownloads']>(async () => [
      {
        path: 'C:\\Users\\me\\Downloads\\Sunny Day.mp3',
        name: 'Sunny Day',
        modifiedAt: 1,
        bytes: 3_000_000,
      },
    ]),
    openYouTubeAudioLibrary: vi.fn<LumoraApi['openYouTubeAudioLibrary']>(async () => {}),
    addMemePaths: vi.fn<LumoraApi['addMemePaths']>(async () => []),
    pathForFile: vi.fn<LumoraApi['pathForFile']>((file) => `C:/drop/${file.name}`),
    removeMeme: vi.fn<LumoraApi['removeMeme']>(async () => []),
    useMeme: vi.fn<LumoraApi['useMeme']>(async (_folder, file) =>
      file.endsWith('.mp4')
        ? {
            file: `asset-${file}`,
            name: 'Bruh',
            width: 640,
            height: 360,
            kind: 'video',
            durationMs: 2500,
            hasAudio: true,
          }
        : {
            file: `asset-${file}`,
            name: 'Mèo cười',
            width: 300,
            height: 300,
            kind: 'image',
            durationMs: 0,
            hasAudio: false,
          },
    ),
    importPack: vi.fn<LumoraApi['importPack']>(async () => ({
      folder: sampleSummary.folder,
      status: 'created',
      mode: 'full',
    })),
    startExport: vi.fn<LumoraApi['startExport']>(async () => 'e1'),
    writeExport: vi.fn<LumoraApi['writeExport']>(async () => {}),
    finishExport: vi.fn<LumoraApi['finishExport']>(async () => ({
      path: '/x/out.mp4',
      fileName: 'out.mp4',
    })),
    cancelExport: vi.fn<LumoraApi['cancelExport']>(async () => {}),
    revealFile: vi.fn<LumoraApi['revealFile']>(async () => {}),
    saveSnapshot: vi.fn<LumoraApi['saveSnapshot']>(async () => ({
      path: '/x/snapshot.png',
      fileName: 'snapshot.png',
    })),
    transcribe: vi.fn<LumoraApi['transcribe']>(async () => sampleTranscript),
    getTranscript: vi.fn<LumoraApi['getTranscript']>(async () => null),
    suggestCuts: vi.fn<LumoraApi['suggestCuts']>(async () => [
      { id: 'ai0', kind: 'filler', start: 800, end: 1100, text: 'ừm', reason: 'Từ đệm' },
      { id: 's0', kind: 'silence', start: 2500, end: 4000, text: '', reason: '' },
    ]),
    planEdits: vi.fn<LumoraApi['planEdits']>(async () => []),
    directEdits: vi.fn<LumoraApi['directEdits']>(async () => ({
      summary: '',
      questions: [],
      commands: [],
    })),
    highlights: vi.fn<LumoraApi['highlights']>(async (_folder, count) =>
      [
        { start: 0, end: 20_000, hook: 'Mẹo 1', title: 'Mở đầu' },
        { start: 30_000, end: 55_000, hook: 'Mẹo 2', title: 'Phần giữa' },
        { start: 60_000, end: 85_000, hook: 'Mẹo 3', title: 'Kết' },
      ].slice(0, count),
    ),
    listLocalModels: vi.fn<LumoraApi['listLocalModels']>(async () => ['llama3.2', 'qwen2.5:7b']),
    pullLocalModel: vi.fn<LumoraApi['pullLocalModel']>(async (_url, model) => {
      localAiListeners.forEach((l) =>
        l({ kind: 'pull', status: `pulling ${model}`, completed: 50, total: 100 }),
      )
      localAiListeners.forEach((l) =>
        l({ kind: 'pull', status: 'success', completed: 0, total: 0 }),
      )
    }),
    benchmarkLocalModel: vi.fn<LumoraApi['benchmarkLocalModel']>(async () => ({
      loadMs: 1200,
      tokensPerSecond: 24.5,
      totalMs: 4000,
    })),
    installOllama: vi.fn<LumoraApi['installOllama']>(async () => {
      localAiListeners.forEach((l) =>
        l({ kind: 'install', status: 'download', completed: 10, total: 100 }),
      )
    }),
    onLocalAiProgress: vi.fn<LumoraApi['onLocalAiProgress']>((l) => {
      localAiListeners.add(l)
      return () => localAiListeners.delete(l)
    }),
    localSpeechStatus: vi.fn<LumoraApi['localSpeechStatus']>(async () => ({
      supported: true,
      platform: 'win32',
      whisper: { installed: false, models: [] },
      piper: { installed: false, voices: [] },
    })),
    localSpeechCatalog: vi.fn<LumoraApi['localSpeechCatalog']>(async () => ({
      models: [
        { id: 'small', label: 'Small', sizeMb: 488 },
        { id: 'large-v3-turbo-q5_0', label: 'Large v3 Turbo (q5)', sizeMb: 574 },
      ],
      voices: [
        { id: 'vi_VN-vais1000-medium', language: 'vi', label: 'Vais 1000 (nữ)', sizeMb: 63 },
        { id: 'en_US-lessac-medium', language: 'en', label: 'Lessac (nữ)', sizeMb: 63 },
      ],
    })),
    installLocalSpeech: vi.fn<LumoraApi['installLocalSpeech']>(async (tool) => {
      localAiListeners.forEach((l) =>
        l({
          kind: 'speech',
          status: 'download',
          item: tool,
          completed: 2_000_000,
          total: 4_000_000,
        }),
      )
    }),
    downloadLocalSpeech: vi.fn<LumoraApi['downloadLocalSpeech']>(async (_kind, id) => {
      localAiListeners.forEach((l) =>
        l({
          kind: 'speech',
          status: 'download',
          item: id,
          completed: 50_000_000,
          total: 100_000_000,
        }),
      )
    }),
    removeLocalSpeech: vi.fn<LumoraApi['removeLocalSpeech']>(async () => {}),
    summarize: vi.fn<LumoraApi['summarize']>(async () => ({
      titles: ['Hướng dẫn Lumora', 'Lumora trong 5 phút', 'Quay màn hình đẹp'],
      description: 'Video hướng dẫn.',
      hashtags: ['#lumora'],
      chapters: [
        { start: 0, title: 'Mở đầu' },
        { start: 5500, title: 'Phần 2' },
      ],
    })),
    addVoiceover: vi.fn<LumoraApi['addVoiceover']>(async (_folder, data) => ({
      file: 'asset-voice-1.m4a',
      name: 'voice',
      durationMs: Math.max(500, data.byteLength),
    })),
    processAudio: vi.fn<LumoraApi['processAudio']>(
      async (_folder, file) => `fx-${file.replace(/\.[^.]+$/, '')}-test.m4a`,
    ),
    importVideo: vi.fn<LumoraApi['importVideo']>(async () => null),
    lockProject: vi.fn<LumoraApi['lockProject']>(async () => ({ recovered: false })),
    unlockProject: vi.fn<LumoraApi['unlockProject']>(async () => {}),
    reportError: vi.fn<LumoraApi['reportError']>(async () => {}),
    renameProject: vi.fn<LumoraApi['renameProject']>(async (_folder, name) => ({
      ...sampleProject,
      name,
    })),
    duplicateProject: vi.fn<LumoraApi['duplicateProject']>(async () => 'copy.lumora'),
    mergeProject: vi.fn<LumoraApi['mergeProject']>(async () => sampleProject),
    reverseClip: vi.fn<LumoraApi['reverseClip']>(async (_folder, start, end) => ({
      screen: `rev-s0-${Math.round(start)}-${Math.round(end)}-screen.mp4`,
      mic: `rev-s0-${Math.round(start)}-${Math.round(end)}-mic.m4a`,
    })),
    listVoices: vi.fn<LumoraApi['listVoices']>(async () => [
      { id: 'voice-anna', name: 'Anna' },
      { id: 'voice-bao', name: 'Bao' },
    ]),
    speak: vi.fn<LumoraApi['speak']>(async (_folder, text) => ({
      file: 'asset-tts-1.mp3',
      name: text,
      durationMs: 900,
    })),
    onlineSearch: vi.fn<LumoraApi['onlineSearch']>(async (source, q, next) => ({
      items: Array.from({ length: next ? 1 : 2 }, (_, i) => ({
        id: `${next ? 'p2-' : ''}${i}`,
        source: 'pixabay' as const,
        kind: source === 'pixabayImage' ? ('image' as const) : ('video' as const),
        title: `${q || 'hot'} ${i + 1}`,
        thumbUrl: `https://media.example/${i}.gif`,
        previewUrl: `https://media.example/${i}.mp4`,
        downloadUrl: `https://media.example/${i}-full.mp4`,
        width: 320,
        height: 180,
        durationMs: 2000,
      })),
      next: next ? null : '2',
      attribution: source === 'pixabayImage' ? 'Ảnh từ Pixabay' : 'Video từ Pixabay',
    })),
    onlineDownload: vi.fn<LumoraApi['onlineDownload']>(async (source, id) => ({
      file: `meme-dl-${id}.mp4`,
      name: `dl ${id}`,
      width: 320,
      height: 180,
      kind: 'video',
      durationMs: 2000,
      hasAudio: true,
      thumb: 'data:image/jpeg;base64,',
      origin: { source, id },
    })),
    cacheInfo: vi.fn<LumoraApi['cacheInfo']>(async () => 5 * 1024 * 1024),
    cacheClear: vi.fn<LumoraApi['cacheClear']>(async () => 0),
    translateLines: vi.fn<LumoraApi['translateLines']>(async (lines) =>
      lines.map((l) => ({ id: l.id, text: `EN: ${l.text}` })),
    ),
    captionEmojis: vi.fn<LumoraApi['captionEmojis']>(async (lines) =>
      lines.map((l) => ({ id: l.id, emoji: '🔥' })),
    ),
    captionKeywords: vi.fn<LumoraApi['captionKeywords']>(async (lines) =>
      lines.map((l) => ({ id: l.id, keywords: l.text.split(/\s+/).slice(0, 1) })),
    ),
    editCaptions: vi.fn<LumoraApi['editCaptions']>(async (lines) =>
      lines.map((l) => ({ id: l.id, text: l.text.replace(/ ừm/g, '') })),
    ),
    planZooms: vi.fn<LumoraApi['planZooms']>(async (_folder, input) =>
      input.zooms.map((z) => ({ ...z, scale: 3 })),
    ),
    saveExportText: vi.fn<LumoraApi['saveExportText']>(async (_folder, fileName) => ({
      path: `/x/${fileName}`,
      fileName,
    })),
    getLiveConfig: vi.fn<LumoraApi['getLiveConfig']>(async () => liveConfig),
    updateLiveConfig: vi.fn<LumoraApi['updateLiveConfig']>(
      async (patch) => (liveConfig = { ...liveConfig, ...patch }),
    ),
    getLiveSecrets: vi.fn<LumoraApi['getLiveSecrets']>(async () => liveSecrets()),
    setLiveSecret: vi.fn<LumoraApi['setLiveSecret']>(async (name, value) => {
      if (value) secretNames.add(name)
      else secretNames.delete(name)
      return liveSecrets()
    }),
    openGuestRoom: vi.fn<LumoraApi['openGuestRoom']>(async () => ({
      room: 'r1',
      hostKey: 'k1',
      port: 47800,
      inviteUrls: ['http://192.168.1.5:47800/join/r1'],
    })),
    closeGuestRoom: vi.fn<LumoraApi['closeGuestRoom']>(async () => {}),
    startLive: vi.fn<LumoraApi['startLive']>(async () => {}),
    writeLive: vi.fn<LumoraApi['writeLive']>(async () => {}),
    stopLive: vi.fn<LumoraApi['stopLive']>(async () => ({
      error: null,
      folder: 'Live 2026.lumora',
    })),
    startComments: vi.fn<LumoraApi['startComments']>(async () => {}),
    stopComments: vi.fn<LumoraApi['stopComments']>(async () => {}),
    transcribeLiveChunk: vi.fn<LumoraApi['transcribeLiveChunk']>(async () => ''),
    onLiveStatus: (l: (s: LiveStatus) => void) => {
      statusListeners.add(l)
      return () => statusListeners.delete(l)
    },
    onLiveEnded: (l: (e: LiveEnded) => void) => {
      endedListeners.add(l)
      return () => endedListeners.delete(l)
    },
    onLiveComments: (l: (c: LiveComment[]) => void) => {
      commentListeners.add(l)
      return () => commentListeners.delete(l)
    },
    onLiveCommentError: () => () => {},
  } satisfies LumoraApi
  return {
    api,
    emitCommand: (c: RecordingCommand) => commandListeners.forEach((l) => l(c)),
    emitFinished: (folder: string) => finishedListeners.forEach((l) => l(folder)),
    emitComments: (comments: LiveComment[]) => commentListeners.forEach((l) => l(comments)),
    emitUpdate: (state: UpdateState) => updateListeners.forEach((l) => l(state)),
    emitLocalAiProgress: (p: LocalAiProgress) => localAiListeners.forEach((l) => l(p)),
    emitLiveStatus: (status: LiveStatus) => statusListeners.forEach((l) => l(status)),
    emitLiveEnded: (ended: LiveEnded) => endedListeners.forEach((l) => l(ended)),
  }
}
