import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, desktopCapturer, globalShortcut, screen, type Display } from 'electron'
import {
  projectFolderName,
  PROJECT_FOLDER_SUFFIX,
  scaleRect,
  type Rect,
  type RecordingOptions,
  type TrackKind,
} from '@lumora/core'
import {
  EVENTS,
  type ActiveSession,
  type CaptureSources,
  type RecorderCapabilities,
  type RecordingCommand,
  type SegmentStart,
} from '@shared/ipc'
import { buildRemuxArgs, buildScreenCaptureArgs, buildThumbnailArgs } from '../ffmpeg/args'
import {
  detectCaptureCapabilities,
  NO_CAPTURE,
  type CaptureCapabilities,
} from '../ffmpeg/capabilities'
import { launchCapture, runFfmpeg } from '../ffmpeg/runner'
import { createRecordingBar, createRegionPicker } from '../windows'
import { InputTracker, loadUiohook } from './input-tracker'
import { planRecording, type DisplayInfo, type RecordingPlan } from './planner'
import { RecordingSession } from './session'

const SHORTCUT_STOP = 'CommandOrControl+Shift+R'
const SHORTCUT_PAUSE = 'CommandOrControl+Shift+P'

/** Đổi vùng DIP tuyệt đối sang pixel vật lý trên màn hình ảo. */
function toPhysical(rect: Rect): Rect {
  if (process.platform === 'win32') return screen.dipToScreenRect(null, rect)
  const display = screen.getDisplayMatching(rect)
  return scaleRect(rect, display.scaleFactor)
}

function displayInfo(display: Display): DisplayInfo {
  return {
    id: String(display.id),
    label: display.label,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
    physicalBounds: toPhysical(display.bounds),
  }
}

async function ffmpegOk(args: string[]): Promise<void> {
  const result = await runFfmpeg(args, 120_000)
  if (result.code !== 0) throw new Error(result.stderr.slice(-500))
}

export interface ControllerContext {
  mainWindow(): BrowserWindow | null
  projectsDir(): Promise<string>
}

/** Điều phối việc quay giữa main process, ffmpeg và cửa sổ thanh điều khiển. */
export class RecordingController {
  private capsPromise: Promise<CaptureCapabilities> | null = null
  private session: RecordingSession | null = null
  private active: ActiveSession | null = null
  private bar: BrowserWindow | null = null
  private regionPicker: { window: BrowserWindow; resolve: (r: Rect | null) => void } | null = null

  constructor(private readonly ctx: ControllerContext) {}

  private captureCapabilities(): Promise<CaptureCapabilities> {
    if (process.env.LUMORA_DISABLE_FFMPEG === '1') return Promise.resolve(NO_CAPTURE)
    this.capsPromise ??= detectCaptureCapabilities(runFfmpeg, process.platform, {
      display: process.env.DISPLAY,
    }).catch(() => NO_CAPTURE)
    return this.capsPromise
  }

  async capabilities(): Promise<RecorderCapabilities> {
    const caps = await this.captureCapabilities()
    const best = caps.ddagrab
      ? { backend: 'ddagrab', ...caps.ddagrab }
      : caps.gdigrab
        ? { backend: 'gdigrab', ...caps.gdigrab }
        : caps.x11grab
          ? { backend: 'x11grab', ...caps.x11grab }
          : null
    return {
      screenEngine: best ? 'ffmpeg' : 'browser',
      backend: best?.backend ?? null,
      encoder: best?.encoder ?? null,
      systemAudio: process.platform === 'win32',
    }
  }

  async sources(): Promise<CaptureSources> {
    const ownWindows = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()))
    const captured = await desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
      .catch(() => [])
    const primaryId = screen.getPrimaryDisplay().id
    return {
      displays: screen.getAllDisplays().map((d) => ({
        id: String(d.id),
        label: d.label,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
        primary: d.id === primaryId,
        thumbnail:
          captured
            .find((s) => s.id.startsWith('screen:') && s.display_id === String(d.id))
            ?.thumbnail.toDataURL() ?? '',
      })),
      windows: captured
        .filter((s) => s.id.startsWith('window:') && !ownWindows.has(s.id) && s.name.trim())
        .map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() })),
    }
  }

  pickRegion(displayId: string): Promise<Rect | null> {
    const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    if (!display) return Promise.resolve(null)
    this.regionPicker?.resolve(null)
    this.regionPicker?.window.close()
    return new Promise((resolve) => {
      const window = createRegionPicker(display.bounds)
      const picker = { window, resolve }
      this.regionPicker = picker
      window.on('closed', () => {
        if (this.regionPicker === picker) {
          this.regionPicker = null
          resolve(null)
        }
      })
    })
  }

  submitRegion(region: Rect | null): void {
    const picker = this.regionPicker
    if (!picker) return
    this.regionPicker = null
    picker.resolve(region)
    picker.window.close()
  }

  get isRecording(): boolean {
    return this.session !== null
  }

  private async createProjectDir(): Promise<{ dir: string; name: string }> {
    const root = await this.ctx.projectsDir()
    await mkdir(root, { recursive: true })
    const base = projectFolderName(new Date()).slice(0, -PROJECT_FOLDER_SUFFIX.length)
    for (let n = 0; ; n++) {
      const name = n === 0 ? base : `${base} (${n + 1})`
      const dir = join(root, `${name}${PROJECT_FOLDER_SUFFIX}`)
      const exists = await stat(dir).then(
        () => true,
        () => false,
      )
      if (!exists) {
        await mkdir(dir)
        return { dir, name }
      }
    }
  }

  private browserSourceId(
    plan: RecordingPlan,
    sources: Electron.DesktopCapturerSource[],
  ): string | null {
    const target = plan.browserSource
    if (!target) return null
    if (target.kind === 'window') return target.sourceId
    return (
      sources.find((s) => s.id.startsWith('screen:') && s.display_id === target.displayId)?.id ??
      null
    )
  }

  async start(options: RecordingOptions): Promise<void> {
    if (this.session) throw new Error('Đang có một phiên quay khác')
    const displays = screen.getAllDisplays()
    const caps = await this.captureCapabilities()
    const plan = planRecording(options, displays.map(displayInfo), caps, {
      toPhysical,
      x11Display: process.env.DISPLAY,
    })

    let screenSourceId: string | null = null
    if (plan.browserSource) {
      const sources = await desktopCapturer.getSources({
        types: [plan.browserSource.kind === 'window' ? 'window' : 'screen'],
        thumbnailSize: { width: 0, height: 0 },
      })
      screenSourceId = this.browserSourceId(plan, sources)
      if (!screenSourceId) throw new Error('Không tìm thấy nguồn quay')
    }

    const { dir, name } = await this.createProjectDir()
    const screenPlan = plan.screen
    const tracker = new InputTracker({
      loadHook: loadUiohook,
      cursorPosition: () => {
        const point = screen.getCursorScreenPoint()
        if (process.platform === 'win32') return screen.dipToScreenPoint(point)
        const scale = screen.getDisplayNearestPoint(point).scaleFactor
        return { x: Math.round(point.x * scale), y: Math.round(point.y * scale) }
      },
      now: Date.now,
    })

    this.session = new RecordingSession(
      {
        id: randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        source: plan.source,
        engine: plan.engine,
        encoder: screenPlan?.spec.encoder ?? null,
        fps: options.fps,
        cursorHidden: plan.engine === 'ffmpeg',
        rendererTracks: plan.rendererTracks,
      },
      {
        dir,
        now: Date.now,
        tracker,
        startScreen: screenPlan
          ? async (output) => {
              const capture = launchCapture(
                buildScreenCaptureArgs(screenPlan.spec, { kind: 'file', path: output }),
              )
              capture.onUnexpectedExit((result) =>
                this.sendToBar(EVENTS.recordingError, result.stderr.slice(-300)),
              )
              const startedAt = await capture.started
              return { startedAt, stop: async () => void (await capture.stop()) }
            }
          : undefined,
        remux: async (input, output) => {
          const tmp = `${output}.tmp${output.slice(output.lastIndexOf('.'))}`
          await ffmpegOk(buildRemuxArgs(input, tmp))
          await rename(tmp, output)
        },
        thumbnail: (input, output) => ffmpegOk(buildThumbnailArgs(input, output)),
      },
    )
    this.active = { options, rendererTracks: plan.rendererTracks, screenSourceId }

    const barDisplay =
      displays.find((d) => String(d.id) === plan.barDisplayId) ?? screen.getPrimaryDisplay()
    this.bar = createRecordingBar(barDisplay.workArea)
    this.bar.on('closed', () => {
      this.bar = null
      // Thanh điều khiển bị đóng ngoài ý muốn: giữ lại phần đã quay.
      if (this.session) void this.finish().catch(() => undefined)
    })
    globalShortcut.register(SHORTCUT_STOP, () => this.command('stop'))
    globalShortcut.register(SHORTCUT_PAUSE, () => this.command('toggle-pause'))
    this.ctx.mainWindow()?.minimize()
  }

  private command(command: RecordingCommand) {
    this.sendToBar(EVENTS.recordingCommand, command)
  }

  private sendToBar(channel: string, payload: unknown) {
    if (this.bar && !this.bar.isDestroyed()) this.bar.webContents.send(channel, payload)
  }

  activeSession(): ActiveSession | null {
    return this.active
  }

  private requireSession(): RecordingSession {
    if (!this.session) throw new Error('Không có phiên quay nào')
    return this.session
  }

  beginSegment(): Promise<SegmentStart> {
    return this.requireSession().beginSegment()
  }

  trackStarted(index: number, kind: TrackKind, startedAt: number): Promise<void> {
    return this.requireSession().trackStarted(index, kind, startedAt)
  }

  writeChunk(index: number, kind: TrackKind, data: Uint8Array): Promise<void> {
    return this.requireSession().writeChunk(index, kind, data)
  }

  endSegment(): Promise<void> {
    return this.requireSession().endSegment()
  }

  private teardown() {
    this.session = null
    this.active = null
    globalShortcut.unregister(SHORTCUT_STOP)
    globalShortcut.unregister(SHORTCUT_PAUSE)
    const bar = this.bar
    this.bar = null
    if (bar && !bar.isDestroyed()) bar.close()
    const main = this.ctx.mainWindow()
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
    }
  }

  async finish(): Promise<void> {
    const session = this.requireSession()
    try {
      await session.finish()
      this.ctx
        .mainWindow()
        ?.webContents.send(EVENTS.recordingFinished, session.dir.split(/[\\/]/).pop())
    } finally {
      this.teardown()
    }
  }

  async cancel(): Promise<void> {
    const session = this.session
    if (!session) return
    try {
      await session.cancel()
    } finally {
      await rm(session.dir, { recursive: true, force: true }).catch(() => undefined)
      this.teardown()
    }
  }
}
