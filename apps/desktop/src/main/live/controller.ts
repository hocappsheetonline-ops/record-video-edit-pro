import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  mergeComments,
  PROJECT_FILE,
  PROJECT_FOLDER_SUFFIX,
  projectFolderName,
  streamUrl,
  THUMBNAIL_FILE,
  type LiveComment,
  type Project,
} from '@lumora/core'
import {
  EVENTS,
  type GuestRoom,
  type LiveConfig,
  type LiveEnded,
  type LiveSecretName,
  type LiveSecretsStatus,
  type LiveStatus,
} from '@shared/ipc'
import { transcribeFile } from '../ai/elevenlabs'
import {
  buildLiveArgs,
  buildThumbnailArgs,
  type LiveOutput,
  type VideoEncoder,
} from '../ffmpeg/args'
import { parseDurationMs } from '../ffmpeg/parse'
import type { FfmpegRunner } from '../ffmpeg/runner'
import { readJsonFile, writeJsonFile } from '../json-file'
import type { Vault } from '../vault'
import { pollFacebook, pollYouTube } from './comments'
import { parseLiveConfig } from './config'
import type { SignalingServer } from './signaling'
import { LiveStreamer } from './streamer'

export interface LiveDeps {
  configPath: string
  vault: Vault
  signaling: SignalingServer
  projectsDir(): Promise<string>
  encoder(): Promise<VideoEncoder>
  run: FfmpegRunner
  send(channel: string, payload: unknown): void
  elevenLabsKey(): Promise<string | undefined>
}

export class LiveError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'LiveError'
  }
}

interface Recording {
  dir: string
  name: string
  file: string
  startedAt: number
}

/** Điều phối buổi phát trực tiếp phía main: cấu hình, stream key, phát RTMP, khách mời, bình luận. */
export class LiveController {
  private streamer: LiveStreamer | null = null
  private status: LiveStatus = { seconds: 0, bitrate: 0, fps: 0, destinations: {} }
  private recording: Recording | null = null
  private endedReason: string | null = null
  private comments: AbortController | null = null
  private seenComments: LiveComment[] = []
  private captionBusy = false

  constructor(private readonly deps: LiveDeps) {}

  async getConfig(): Promise<LiveConfig> {
    return parseLiveConfig(await readJsonFile(this.deps.configPath))
  }

  async updateConfig(patch: unknown): Promise<LiveConfig> {
    const current = await this.getConfig()
    const next = parseLiveConfig({
      ...current,
      ...(typeof patch === 'object' && patch !== null ? patch : {}),
    })
    await writeJsonFile(this.deps.configPath, next)
    return next
  }

  async secrets(): Promise<LiveSecretsStatus> {
    const config = await this.getConfig()
    const streamKeys: Record<string, boolean> = {}
    for (const d of config.destinations)
      streamKeys[d.id] = await this.deps.vault.has(`stream:${d.id}`)
    return {
      streamKeys,
      youtubeApiKey: await this.deps.vault.has('youtube-api-key'),
      facebookToken: await this.deps.vault.has('facebook-token'),
    }
  }

  async setSecret(name: LiveSecretName, value: string): Promise<LiveSecretsStatus> {
    if (!/^(stream:[\w-]{1,40}|youtube-api-key|facebook-token)$/.test(name))
      throw new Error('Tên khóa không hợp lệ')
    await this.deps.vault.set(name, value.slice(0, 500))
    return this.secrets()
  }

  async openRoom(): Promise<GuestRoom> {
    const port = await this.deps.signaling.start()
    const { room, hostKey } = this.deps.signaling.openRoom()
    const config = await this.getConfig()
    return {
      room,
      hostKey,
      port,
      inviteUrls: this.deps.signaling.inviteUrls(config.publicUrl || undefined),
    }
  }

  closeRoom(): void {
    this.deps.signaling.closeRoom()
  }

  get isLive(): boolean {
    return this.streamer?.running ?? false
  }

  private emitStatus() {
    this.deps.send(EVENTS.liveStatus, this.status)
  }

  async start(video: { width: number; height: number; fps: number }): Promise<void> {
    if (this.streamer?.running) throw new LiveError('already_live')
    const config = await this.getConfig()
    const destinations: { id: string; url: string }[] = []
    for (const d of config.destinations.filter((x) => x.enabled)) {
      const key = await this.deps.vault.get(`stream:${d.id}`)
      if (!key && d.platform !== 'custom') throw new LiveError(`missing_stream_key:${d.name}`)
      destinations.push({ id: d.id, url: streamUrl(d.server, key ?? '') })
    }
    const outputs: LiveOutput[] = destinations.map((d) => ({ kind: 'rtmp', url: d.url }))
    this.recording = null
    if (config.recordLocally) {
      const root = await this.deps.projectsDir()
      const base = `Live ${projectFolderName(new Date()).slice(0, -PROJECT_FOLDER_SUFFIX.length)}`
      const dir = join(root, `${base}${PROJECT_FOLDER_SUFFIX}`)
      await mkdir(dir, { recursive: true })
      this.recording = { dir, name: base, file: 'live.mkv', startedAt: Date.now() }
      outputs.push({ kind: 'file', path: join(dir, 'live.mkv') })
    }
    if (outputs.length === 0) throw new LiveError('no_outputs')

    this.status = { seconds: 0, bitrate: 0, fps: 0, destinations: {} }
    this.endedReason = null
    const fps = Math.min(60, Math.max(15, Math.round(video.fps)))
    const streamer = new LiveStreamer(
      destinations,
      {
        onStats: (stats) => {
          this.status = { ...this.status, ...stats }
          this.emitStatus()
        },
        onDestination: (id, state, message) => {
          this.status = {
            ...this.status,
            destinations: { ...this.status.destinations, [id]: { state, message } },
          }
          this.emitStatus()
          // Mọi kênh đều lỗi và không ghi trong máy: không còn nơi nào nhận luồng → dừng hẳn.
          const states = destinations.map((d) => this.status.destinations[d.id]?.state)
          if (!this.recording && this.streamer === streamer && states.every((x) => x === 'error')) {
            this.endedReason ??= message ?? 'all_destinations_failed'
            void this.stop()
          }
        },
        onExit: (code, tail) => {
          const unexpected = this.streamer === streamer
          if ((unexpected || (code !== 0 && code !== null)) && !this.endedReason)
            this.endedReason = tail.slice(-400) || 'ffmpeg_exited'
          // FFmpeg dừng ngoài ý muốn (mất mạng, sai key…): tự kết thúc buổi phát và báo giao diện.
          if (unexpected) void this.stop()
        },
      },
      fps,
    )
    streamer.start(
      buildLiveArgs(outputs, {
        encoder: await this.deps.encoder(),
        fps,
        videoBitrate: config.videoBitrate,
        audioBitrate: 160,
      }),
    )
    this.streamer = streamer
    if (this.recording) this.recording.startedAt = Date.now()
  }

  write(data: Uint8Array): Promise<void> {
    return this.streamer?.write(data) ?? Promise.resolve()
  }

  /** Kết thúc buổi phát; nếu có bản ghi thì tạo dự án để chỉnh sửa, làm phụ đề, chương bằng AI. */
  async stop(): Promise<LiveEnded> {
    const streamer = this.streamer
    this.streamer = null
    if (streamer) await streamer.stop()
    const recording = this.recording
    this.recording = null
    let folder: string | null = null
    if (recording) folder = await this.saveRecording(recording).catch(() => null)
    const ended = { error: this.endedReason, folder }
    this.deps.send(EVENTS.liveEnded, ended)
    return ended
  }

  private async saveRecording(rec: Recording): Promise<string | null> {
    const file = join(rec.dir, rec.file)
    const probe = await this.deps.run(['-hide_banner', '-i', file], 30_000)
    const duration = parseDurationMs(probe.stderr)
    if (!duration || duration < 500) {
      await rm(rec.dir, { recursive: true, force: true })
      return null
    }
    const project: Project = {
      version: 1,
      id: randomUUID(),
      name: rec.name,
      createdAt: new Date(rec.startedAt).toISOString(),
      source: { kind: 'display', name: 'Livestream', captureRect: null, scaleFactor: 1 },
      engine: 'browser',
      encoder: null,
      fps: 30,
      cursorHidden: false,
      segments: [
        {
          index: 0,
          startedAt: rec.startedAt,
          endedAt: rec.startedAt + duration,
          tracks: {
            screen: { file: rec.file, startedAt: rec.startedAt },
            system: { file: rec.file, startedAt: rec.startedAt },
          },
        },
      ],
      hasEvents: false,
      inputMode: null,
      durationMs: duration,
    }
    await writeJsonFile(join(rec.dir, PROJECT_FILE), project)
    await this.deps.run(buildThumbnailArgs(file, join(rec.dir, THUMBNAIL_FILE)), 60_000)
    return rec.dir.split(/[\\/]/).pop() ?? null
  }

  async startComments(platforms: ('youtube' | 'facebook')[]): Promise<void> {
    this.stopComments()
    const config = await this.getConfig()
    const controller = new AbortController()
    this.comments = controller
    this.seenComments = []
    const sink = {
      onComments: (incoming: LiveComment[]) => {
        const before = new Set(this.seenComments.map((c) => c.id))
        this.seenComments = mergeComments(this.seenComments, incoming, 1000)
        const fresh = incoming.filter((c) => !before.has(c.id))
        if (fresh.length > 0) this.deps.send(EVENTS.liveComments, fresh)
      },
      onError: (message: string) => this.deps.send(EVENTS.liveCommentError, message),
    }
    if (platforms.includes('youtube')) {
      const apiKey = await this.deps.vault.get('youtube-api-key')
      if (!apiKey || !config.youtubeVideoId) sink.onError('YouTube: thiếu API key hoặc ID video')
      else void pollYouTube({ apiKey, videoId: config.youtubeVideoId }, sink, controller.signal)
    }
    if (platforms.includes('facebook')) {
      const token = await this.deps.vault.get('facebook-token')
      if (!token || !config.facebookVideoId)
        sink.onError('Facebook: thiếu access token hoặc ID video')
      else void pollFacebook({ token, videoId: config.facebookVideoId }, sink, controller.signal)
    }
  }

  stopComments(): void {
    this.comments?.abort()
    this.comments = null
  }

  /** Phụ đề trực tiếp: nhận dạng một đoạn âm thanh vài giây. Bỏ qua nếu đoạn trước chưa xong. */
  async caption(data: Uint8Array, language: string): Promise<string> {
    if (this.captionBusy) return ''
    const apiKey = await this.deps.elevenLabsKey()
    if (!apiKey) throw new Error('missing_key:elevenlabs')
    this.captionBusy = true
    const file = join(tmpdir(), `lumora-caption-${randomUUID()}.webm`)
    try {
      await writeFile(file, data)
      const transcript = await transcribeFile(file, apiKey, {
        language: language || undefined,
        mimeType: 'audio/webm',
      })
      return transcript.words.map((w) => w.text).join(' ')
    } finally {
      this.captionBusy = false
      await rm(file, { force: true })
    }
  }

  async shutdown(): Promise<void> {
    this.stopComments()
    if (this.streamer) await this.stop()
    await this.deps.signaling.stop()
  }
}
