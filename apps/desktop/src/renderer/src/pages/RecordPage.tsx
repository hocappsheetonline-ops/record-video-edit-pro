import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppWindow, Crop, Monitor, RefreshCw, Video } from 'lucide-react'
import {
  COUNTDOWNS,
  FRAME_RATES,
  type Countdown,
  type FrameRate,
  type Rect,
  type RecordingOptions,
} from '@lumora/core'
import type { CaptureSources, RecorderCapabilities } from '@shared/ipc'
import { lumora } from '../api'
import { CameraPreview } from '../components/CameraPreview'
import { MicMeter } from '../components/MicMeter'
import { PageHeader } from '../components/PageHeader'
import { ipcErrorMessage, loadPrefs, savePrefs } from '../lib/prefs'

type Mode = 'display' | 'region' | 'window'

interface Prefs {
  mode: Mode
  displayId: string | null
  cameraId: string | null
  micId: string | null
  systemAudio: boolean
  fps: FrameRate
  countdown: Countdown
}

const PREFS_KEY = 'lumora.record'
const DEFAULT_PREFS: Prefs = {
  mode: 'display',
  displayId: null,
  cameraId: null,
  micId: null,
  systemAudio: false,
  fps: 60,
  countdown: 3,
}

const KNOWN_ERRORS = ['region_requires_ffmpeg', 'region_outside_display', 'display_not_found']

const card = 'rounded-xl border border-border bg-surface p-5'
const select =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent'
const heading = 'mb-3 text-sm font-medium uppercase tracking-wide text-muted'

function loadSources(): Promise<[CaptureSources, MediaDeviceInfo[]]> {
  return Promise.all([
    lumora().getCaptureSources(),
    navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? Promise.resolve([]),
  ])
}

function SourceCard({
  selected,
  onClick,
  thumbnail,
  title,
  subtitle,
  testId,
}: {
  selected: boolean
  onClick: () => void
  thumbnail: string
  title: string
  subtitle?: string
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={`flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors ${
        selected ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2'
      }`}
    >
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        {thumbnail && <img src={thumbnail} alt="" className="h-full w-full object-contain" />}
      </div>
      <div className="min-w-0 px-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
    </button>
  )
}

export function RecordPage() {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(PREFS_KEY, DEFAULT_PREFS))
  const [sources, setSources] = useState<CaptureSources | null>(null)
  const [caps, setCaps] = useState<RecorderCapabilities | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [region, setRegion] = useState<Rect | null>(null)
  const [windowId, setWindowId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch }
      savePrefs(PREFS_KEY, next)
      return next
    })

  const refresh = useCallback(
    () =>
      loadSources().then(([nextSources, list]) => {
        setSources(nextSources)
        setDevices(list)
      }),
    [],
  )

  useEffect(() => {
    let cancelled = false
    void loadSources().then(([nextSources, list]) => {
      if (cancelled) return
      setSources(nextSources)
      setDevices(list)
    })
    void lumora()
      .getRecorderCapabilities()
      .then((c) => !cancelled && setCaps(c))
    return () => {
      cancelled = true
    }
  }, [])

  const displays = sources?.displays ?? []
  const displayId =
    displays.find((d) => d.id === prefs.displayId)?.id ??
    displays.find((d) => d.primary)?.id ??
    displays[0]?.id ??
    null
  const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId)
  const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId)
  const cameraId = cameras.some((d) => d.deviceId === prefs.cameraId) ? prefs.cameraId : null
  const micId = mics.some((d) => d.deviceId === prefs.micId) ? prefs.micId : null
  const systemAudio = prefs.systemAudio && (caps?.systemAudio ?? false)
  const displayName = (id: string) => {
    const index = displays.findIndex((d) => d.id === id)
    return displays[index]?.label || t('record.displayName', { n: index + 1 })
  }

  const chooseRegion = async () => {
    if (!displayId) return
    setError(null)
    const picked = await lumora().pickRegion(displayId)
    if (picked) setRegion(picked)
  }

  const start = async () => {
    setError(null)
    let source: RecordingOptions['source']
    if (prefs.mode === 'window') {
      const win = sources?.windows.find((w) => w.id === windowId)
      if (!win) return setError(t('record.errors.noWindow'))
      source = { kind: 'window', sourceId: win.id, name: win.name }
    } else if (!displayId) {
      return setError(t('record.errors.display_not_found'))
    } else if (prefs.mode === 'region') {
      if (!region) return setError(t('record.errors.noRegion'))
      source = { kind: 'region', displayId, region }
    } else {
      source = { kind: 'display', displayId }
    }
    setStarting(true)
    try {
      await lumora().startRecording({
        source,
        fps: prefs.fps,
        countdown: prefs.countdown,
        cameraId,
        micId,
        systemAudio,
      })
    } catch (e) {
      const message = ipcErrorMessage(e)
      setError(
        KNOWN_ERRORS.includes(message)
          ? t(`record.errors.${message}`)
          : t('record.errors.generic', { message }),
      )
    } finally {
      setStarting(false)
    }
  }

  const modes: { mode: Mode; icon: typeof Monitor }[] = [
    { mode: 'display', icon: Monitor },
    { mode: 'region', icon: Crop },
    { mode: 'window', icon: AppWindow },
  ]
  const regionDisabled = caps?.screenEngine === 'browser'

  return (
    <div className="max-w-5xl p-8">
      <PageHeader title={t('record.title')} description={t('record.description')} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className={card}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
              {modes.map(({ mode, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={prefs.mode === mode}
                  data-testid={`mode-${mode}`}
                  disabled={mode === 'region' && regionDisabled}
                  onClick={() => update({ mode })}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm disabled:opacity-40 ${
                    prefs.mode === mode
                      ? 'bg-surface text-text shadow'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <Icon size={16} aria-hidden />
                  {t(`record.modes.${mode}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text"
            >
              <RefreshCw size={14} aria-hidden />
              {t('record.refresh')}
            </button>
          </div>

          {prefs.mode !== 'window' && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {displays.map((d) => (
                <SourceCard
                  key={d.id}
                  testId={`display-${d.id}`}
                  selected={d.id === displayId}
                  onClick={() => {
                    update({ displayId: d.id })
                    setRegion(null)
                  }}
                  thumbnail={d.thumbnail}
                  title={displayName(d.id)}
                  subtitle={`${Math.round(d.bounds.width * d.scaleFactor)} × ${Math.round(
                    d.bounds.height * d.scaleFactor,
                  )}${d.primary ? ` · ${t('record.primary')}` : ''}`}
                />
              ))}
            </div>
          )}

          {prefs.mode === 'region' && (
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void chooseRegion()}
                data-testid="pick-region"
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
              >
                {region ? t('record.repickRegion') : t('record.pickRegion')}
              </button>
              <span className="text-sm text-muted" data-testid="region-info">
                {region
                  ? t('record.regionSelected', {
                      w: Math.round(region.width),
                      h: Math.round(region.height),
                    })
                  : t('record.regionHint')}
              </span>
            </div>
          )}

          {prefs.mode === 'window' &&
            (sources && sources.windows.length === 0 ? (
              <p className="text-sm text-muted">{t('record.noWindows')}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                  {sources?.windows.map((w) => (
                    <SourceCard
                      key={w.id}
                      testId={`window-${w.id}`}
                      selected={w.id === windowId}
                      onClick={() => setWindowId(w.id)}
                      thumbnail={w.thumbnail}
                      title={w.name}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">{t('record.windowCursorNote')}</p>
              </>
            ))}
        </section>

        <div className="flex flex-col gap-6">
          <section className={card}>
            <h2 className={heading}>{t('record.devices')}</h2>
            <label className="mb-3 flex flex-col gap-1.5 text-sm">
              {t('record.camera')}
              <select
                className={select}
                data-testid="camera-select"
                value={cameraId ?? ''}
                onChange={(e) => update({ cameraId: e.target.value || null })}
              >
                <option value="">{t('record.none')}</option>
                {cameras.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `${t('record.camera')} ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            {cameraId && (
              <div className="mb-3">
                <CameraPreview key={cameraId} deviceId={cameraId} />
              </div>
            )}
            <label className="mb-2 flex flex-col gap-1.5 text-sm">
              {t('record.mic')}
              <select
                className={select}
                data-testid="mic-select"
                value={micId ?? ''}
                onChange={(e) => update({ micId: e.target.value || null })}
              >
                <option value="">{t('record.none')}</option>
                {mics.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `${t('record.mic')} ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            {micId && <MicMeter deviceId={micId} />}
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={systemAudio}
                disabled={!caps?.systemAudio}
                onChange={(e) => update({ systemAudio: e.target.checked })}
                className="size-4 accent-accent"
              />
              {t('record.systemAudio')}
              {caps && !caps.systemAudio && (
                <span className="text-xs text-muted">({t('record.systemAudioUnsupported')})</span>
              )}
            </label>
          </section>

          <section className={card}>
            <h2 className={heading}>{t('record.options')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                {t('record.fps')}
                <select
                  className={select}
                  value={prefs.fps}
                  onChange={(e) => update({ fps: Number(e.target.value) as FrameRate })}
                >
                  {FRAME_RATES.map((fps) => (
                    <option key={fps} value={fps}>
                      {fps} fps
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                {t('record.countdown')}
                <select
                  className={select}
                  data-testid="countdown-select"
                  value={prefs.countdown}
                  onChange={(e) => update({ countdown: Number(e.target.value) as Countdown })}
                >
                  {COUNTDOWNS.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t('record.noCountdown') : t('record.seconds', { n })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm text-muted" data-testid="engine-info">
          {!caps
            ? t('record.checking')
            : caps.screenEngine === 'ffmpeg'
              ? t('record.engineFfmpeg', { encoder: caps.encoder })
              : t('record.engineBrowser')}
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void start()}
            disabled={starting || !caps || !sources}
            data-testid="start-recording"
            className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            <Video size={18} aria-hidden />
            {starting ? t('record.starting') : t('record.start')}
          </button>
          <span className="text-xs text-muted">{t('record.shortcuts')}</span>
        </div>
      </div>
    </div>
  )
}
