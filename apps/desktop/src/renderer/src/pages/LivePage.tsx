import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Radio, Square } from 'lucide-react'
import { STUDIO_LAYOUTS } from '@lumora/core'
import type { CaptureSources } from '@shared/ipc'
import { lumora } from '../api'
import { aiErrorText } from '../editor/ai-errors'
import { CommentsPanel } from '../live/CommentsPanel'
import { DestinationsPanel } from '../live/DestinationsPanel'
import { GuestsPanel } from '../live/GuestsPanel'
import { LiveSettingsPanel } from '../live/LiveSettingsPanel'
import { subscribeLiveEvents, useLiveStore } from '../live/store'
import { useAppStore } from '../store/app'

const TABS = ['destinations', 'guests', 'comments', 'settings'] as const
type Tab = (typeof TABS)[number]

const select = 'w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm'

/** Đổi mã lỗi phát trực tiếp thành câu dễ hiểu. */
export function liveErrorText(t: TFunction, message: string): string {
  const missing = /missing_stream_key:(.*)$/.exec(message)
  if (missing) return t('live.errors.missingKey', { name: missing[1] })
  if (message.includes('no_outputs')) return t('live.errors.noOutputs')
  if (message.includes('already_live')) return t('live.errors.alreadyLive')
  if (message.includes('missing_key:')) return aiErrorText(t, message)
  return t('live.errors.generic', { message })
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

function ProgramPreview() {
  const ref = useRef<HTMLDivElement>(null)
  const engine = useLiveStore((s) => s.engine)
  useEffect(() => {
    if (!ref.current || !engine) return
    return engine.attach(ref.current)
  }, [engine])
  return <div ref={ref} className="aspect-video w-full overflow-hidden rounded-lg bg-black" />
}

function HostControls() {
  const { t } = useTranslation()
  const cameraId = useLiveStore((s) => s.cameraId)
  const micId = useLiveStore((s) => s.micId)
  const hostOnStage = useLiveStore((s) => s.hostOnStage)
  const hostName = useLiveStore((s) => s.hostName)
  const sharing = useLiveStore((s) => s.sharing)
  const engine = useLiveStore((s) => s.engine)
  const { setDevices, setHostOnStage, setHostName, shareScreen } = useLiveStore.getState()
  const [devices, setDeviceList] = useState<MediaDeviceInfo[]>([])
  const [sources, setSources] = useState<CaptureSources | null>(null)
  const [screenId, setScreenId] = useState('')

  useEffect(() => {
    if (!engine) return
    let cancelled = false
    void (navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? Promise.resolve([])).then(
      (list) => {
        if (cancelled) return
        setDeviceList(list)
        // Lần đầu: tự chọn webcam và micro đầu tiên để host có mặt trên sóng ngay.
        const state = useLiveStore.getState()
        if (state.cameraId === null && state.micId === null) {
          const cam = list.find((d) => d.kind === 'videoinput' && d.deviceId)?.deviceId ?? null
          const mic = list.find((d) => d.kind === 'audioinput' && d.deviceId)?.deviceId ?? null
          if (cam || mic) void setDevices(cam, mic)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [engine, setDevices])

  const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId)
  const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId)
  const screens = [
    ...(sources?.displays ?? [])
      .filter((d) => d.sourceId)
      .map((d, i) => ({
        id: d.sourceId!,
        name: d.label || t('live.studio.display', { n: i + 1 }),
      })),
    ...(sources?.windows ?? []).map((w) => ({ id: w.id, name: w.name })),
  ]

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 text-sm lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.studio.name')}</span>
        <input
          className={select}
          value={hostName}
          data-testid="host-name"
          onChange={(e) => setHostName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.studio.camera')}</span>
        <select
          className={select}
          value={cameraId ?? ''}
          data-testid="host-camera"
          onChange={(e) => void setDevices(e.target.value || null, micId)}
        >
          <option value="">{t('live.studio.off')}</option>
          {cameras.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.studio.mic')}</span>
        <select
          className={select}
          value={micId ?? ''}
          data-testid="host-mic"
          onChange={(e) => void setDevices(cameraId, e.target.value || null)}
        >
          <option value="">{t('live.studio.off')}</option>
          {mics.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Mic ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.studio.screen')}</span>
        <select
          className={select}
          value={sharing ? screenId : ''}
          data-testid="host-screen"
          onFocus={() => void lumora().getCaptureSources().then(setSources)}
          onChange={(e) => {
            setScreenId(e.target.value)
            void shareScreen(e.target.value || null)
          }}
        >
          <option value="">{t('live.studio.noScreen')}</option>
          {screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 flex items-center gap-2 lg:col-span-4">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={hostOnStage}
          data-testid="host-on-stage"
          onChange={(e) => setHostOnStage(e.target.checked)}
        />
        {t('live.studio.hostOnStage')}
      </label>
    </div>
  )
}

function SceneControls() {
  const { t } = useTranslation()
  const layout = useLiveStore((s) => s.layout)
  const banner = useLiveStore((s) => s.banner)
  const showBanner = useLiveStore((s) => s.showBanner)
  const showNames = useLiveStore((s) => s.showNames)
  const setStudio = useLiveStore((s) => s.setStudio)
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex gap-1" role="group" aria-label={t('live.studio.layout')}>
        {STUDIO_LAYOUTS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={layout === l}
            data-testid={`layout-${l}`}
            onClick={() => setStudio({ layout: l })}
            className={`rounded-md border px-3 py-1.5 ${layout === l ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-2'}`}
          >
            {t(`live.layouts.${l}`)}
          </button>
        ))}
      </div>
      <input
        className="min-w-48 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5"
        placeholder={t('live.studio.bannerPlaceholder')}
        value={banner}
        data-testid="banner-text"
        onChange={(e) => setStudio({ banner: e.target.value })}
      />
      <button
        type="button"
        aria-pressed={showBanner}
        data-testid="banner-toggle"
        onClick={() => setStudio({ showBanner: !showBanner })}
        className={`rounded-md border px-3 py-1.5 ${showBanner ? 'border-accent bg-accent/10 text-accent' : 'border-border'}`}
      >
        {showBanner ? t('live.studio.hideBanner') : t('live.studio.showBanner')}
      </button>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={showNames}
          onChange={(e) => setStudio({ showNames: e.target.checked })}
        />
        {t('live.studio.names')}
      </label>
    </div>
  )
}

function LiveStatusBar() {
  const { t } = useTranslation()
  const phase = useLiveStore((s) => s.phase)
  const status = useLiveStore((s) => s.status)
  const config = useLiveStore((s) => s.config)
  const { goLive, stopLive } = useLiveStore.getState()
  const enabled = config?.destinations.filter((d) => d.enabled).length ?? 0

  return (
    <div className="flex items-center gap-3">
      {phase === 'live' && (
        <div className="flex items-center gap-3 text-sm" data-testid="live-status">
          <span className="flex items-center gap-1.5 rounded bg-danger px-2 py-0.5 text-xs font-bold text-white">
            <span className="size-2 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
          <span className="font-mono" data-testid="live-clock">
            {formatClock(status?.seconds ?? 0)}
          </span>
          {status && status.bitrate > 0 && (
            <span className="text-muted">{Math.round(status.bitrate)} kbps</span>
          )}
        </div>
      )}
      {phase === 'idle' || phase === 'starting' ? (
        <button
          type="button"
          data-testid="live-go"
          disabled={phase === 'starting'}
          onClick={() => void goLive()}
          className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Radio size={16} aria-hidden />
          {phase === 'starting'
            ? t('live.starting')
            : enabled > 0
              ? t('live.goLive', { count: enabled })
              : t('live.recordOnly')}
        </button>
      ) : (
        <button
          type="button"
          data-testid="live-stop"
          disabled={phase === 'stopping'}
          onClick={() => void stopLive()}
          className="flex items-center gap-2 rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60"
        >
          <Square size={14} aria-hidden />
          {phase === 'stopping' ? t('live.stopping') : t('live.stop')}
        </button>
      )}
    </div>
  )
}

function Notices() {
  const { t } = useTranslation()
  const error = useLiveStore((s) => s.error)
  const ended = useLiveStore((s) => s.ended)
  const showProject = useAppStore((s) => s.showProject)
  const openEditor = useAppStore((s) => s.openEditor)
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
          data-testid="live-error"
        >
          {liveErrorText(t, error)}
        </p>
      )}
      {ended && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
          data-testid="live-ended"
        >
          <span className={ended.error ? 'text-danger' : ''}>
            {ended.error ? liveErrorText(t, ended.error) : t('live.ended')}
          </span>
          {ended.folder && (
            <>
              <span className="text-muted">{t('live.savedProject')}</span>
              <button
                type="button"
                className="text-accent hover:underline"
                data-testid="live-open-project"
                onClick={() => showProject(ended.folder)}
              >
                {t('live.openProject')}
              </button>
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => openEditor(ended.folder!)}
              >
                {t('live.openEditor')}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

export function LivePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('destinations')
  const guests = useLiveStore((s) => s.guests.length)
  const comments = useLiveStore((s) => s.comments.length)
  const ready = useLiveStore((s) => s.config !== null && s.engine !== null)

  useEffect(() => {
    void useLiveStore.getState().init()
    return subscribeLiveEvents()
  }, [])

  return (
    <div className="flex h-full min-h-0" data-testid="live-page">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('live.title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('live.description')}</p>
          </div>
          {ready && <LiveStatusBar />}
        </div>
        <Notices />
        {ready && (
          <>
            <ProgramPreview />
            <SceneControls />
            <HostControls />
          </>
        )}
      </section>
      <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex border-b border-border" role="tablist">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`live-tab-${id}`}
              onClick={() => setTab(id)}
              className={`flex-1 px-2 py-3 text-sm ${tab === id ? 'border-b-2 border-accent font-medium text-text' : 'text-muted hover:text-text'}`}
            >
              {t(`live.tabs.${id}`)}
              {id === 'guests' && guests > 0 && ` (${guests})`}
              {id === 'comments' && comments > 0 && ` (${comments})`}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'destinations' && <DestinationsPanel />}
          {tab === 'guests' && <GuestsPanel />}
          {tab === 'comments' && <CommentsPanel />}
          {tab === 'settings' && <LiveSettingsPanel />}
        </div>
      </aside>
    </div>
  )
}
