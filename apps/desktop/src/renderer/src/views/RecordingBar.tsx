import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Pause, Play, Square, Trash2 } from 'lucide-react'
import { formatDuration } from '@lumora/core'
import { lumora } from '../api'
import { BarController, defaultBarDeps, type BarDeps, type BarState } from '../lib/bar-controller'
import { useViewLanguage } from './useViewLanguage'

const iconButton =
  'flex size-9 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40'

export function RecordingBar({ deps }: { deps?: BarDeps }) {
  const { t } = useTranslation()
  useViewLanguage()
  const controller = useMemo(() => new BarController(deps ?? defaultBarDeps(lumora())), [deps])
  const [state, setState] = useState<BarState>(controller.state)
  const [elapsed, setElapsed] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    const api = lumora()
    const offCommand = api.onRecordingCommand((command) => {
      if (command === 'stop') void controller.stop()
      else void controller.togglePause()
    })
    const offError = api.onRecordingError((message) => void controller.handleError(message))
    void controller.init()
    const timer = setInterval(() => setElapsed(controller.elapsedMs()), 250)
    return () => {
      unsubscribe()
      offCommand()
      offError()
      clearInterval(timer)
    }
  }, [controller])

  useEffect(() => {
    if (!confirmCancel) return
    const timer = setTimeout(() => setConfirmCancel(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmCancel])

  const onCancel = () => {
    if (confirmCancel) void controller.cancel()
    else setConfirmCancel(true)
  }

  const { phase } = state
  const active = phase === 'recording' || phase === 'paused'
  const warning =
    state.failedTracks.length > 0
      ? state.failedTracks
          .map((k) => t('bar.deviceFailed', { device: t(`projects.tracks.${k}`) }))
          .join(', ')
      : null

  return (
    <div
      data-testid="recording-bar"
      data-phase={phase}
      className="flex h-full items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/95 px-3 text-white shadow-2xl [-webkit-app-region:drag]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {phase === 'countdown' && (
          <span
            data-testid="countdown"
            className="w-8 text-center text-2xl font-semibold tabular-nums"
          >
            {state.countdown}
          </span>
        )}
        {active && (
          <span
            className={`size-3 shrink-0 rounded-full ${
              phase === 'recording' ? 'animate-pulse bg-red-500' : 'bg-amber-400'
            }`}
            aria-hidden
          />
        )}
        {active && (
          <span data-testid="elapsed" className="font-mono text-lg tabular-nums">
            {formatDuration(elapsed)}
          </span>
        )}
        <span
          className="truncate text-sm text-white/70"
          title={state.error ?? warning ?? undefined}
        >
          {phase === 'preparing' && t('bar.preparing')}
          {phase === 'paused' && t('bar.paused')}
          {phase === 'saving' && t('bar.saving')}
          {phase === 'error' && t('bar.error', { message: state.error })}
          {phase === 'countdown' && confirmCancel && t('bar.confirmCancel')}
          {active && confirmCancel && t('bar.confirmCancel')}
        </span>
        {warning && (
          <AlertTriangle size={16} className="shrink-0 text-amber-400" aria-label={warning} />
        )}
      </div>

      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {active && (
          <button
            type="button"
            className={`${iconButton} text-white/80 hover:text-white`}
            onClick={() => void controller.togglePause()}
            title={phase === 'recording' ? t('bar.pause') : t('bar.resume')}
            aria-label={phase === 'recording' ? t('bar.pause') : t('bar.resume')}
            data-testid="bar-pause"
          >
            {phase === 'recording' ? <Pause size={18} /> : <Play size={18} />}
          </button>
        )}
        {(active || phase === 'error') && (
          <button
            type="button"
            className={`${iconButton} text-red-400`}
            onClick={() => void controller.stop()}
            title={t('bar.stop')}
            aria-label={t('bar.stop')}
            data-testid="bar-stop"
          >
            <Square size={18} fill="currentColor" />
          </button>
        )}
        {phase !== 'saving' && (
          <button
            type="button"
            className={`${iconButton} ${confirmCancel ? 'bg-red-500/30 text-red-300' : 'text-white/80 hover:text-white'}`}
            onClick={onCancel}
            title={t('bar.cancel')}
            aria-label={t('bar.cancel')}
            data-testid="bar-cancel"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
