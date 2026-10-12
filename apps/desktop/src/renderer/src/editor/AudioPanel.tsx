import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, Trash2 } from 'lucide-react'
import { SOUND_EFFECT_IDS, type SoundEffectId } from '@lumora/core'
import { ipcErrorMessage } from '../lib/prefs'
import { useEditorStore } from './store'

const pct = (v: number) => `${Math.round(v * 100)}%`
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

function Range(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  testId: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">
        {props.label}: {props.format(props.value)}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        data-testid={props.testId}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="accent-accent"
      />
    </label>
  )
}

/** Nhạc nền và hiệu ứng âm thanh: thêm từ máy hoặc chọn hiệu ứng có sẵn, chỉnh đoạn đang chọn. */
export function AudioPanel() {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const clip = useEditorStore((s) =>
    s.selection?.kind === 'audio'
      ? s.edit?.audioClips.find((c) => c.id === s.selection!.id)
      : undefined,
  )
  const { addMusic, addSoundEffect, updateAudioClip, deleteSelection } = useEditorStore.getState()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await task()
    } catch (e) {
      const code = ipcErrorMessage(e)
      setError(
        ['audio_unsupported', 'audio_unreadable'].includes(code)
          ? t(`editor.music.errors.${code}`)
          : t('editor.music.errors.generic', { message: code }),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <button
        type="button"
        data-testid="add-music"
        disabled={busy !== null}
        onClick={() => void run('music', addMusic)}
        className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        <Music size={16} aria-hidden />
        {busy === 'music' ? t('editor.music.adding') : t('editor.music.add')}
      </button>
      <p className="text-xs text-muted">{t('editor.music.hint')}</p>

      <div>
        <span className="mb-2 block text-sm text-muted">{t('editor.music.sfx')}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {SOUND_EFFECT_IDS.map((id: SoundEffectId) => (
            <button
              key={id}
              type="button"
              data-testid={`sfx-${id}`}
              disabled={busy !== null}
              onClick={() => void run(id, () => addSoundEffect(id))}
              className="rounded-md bg-surface-2 px-2 py-1.5 text-xs hover:bg-accent/20 disabled:opacity-50"
            >
              {t(`editor.music.effects.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {clip && selection && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
          data-testid="audio-clip-panel"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{clip.name}</span>
            <button
              type="button"
              aria-label={t('editor.music.remove')}
              data-testid="audio-remove"
              onClick={deleteSelection}
              className="text-danger"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
          <Range
            label={t('editor.music.volume')}
            value={clip.volume}
            min={0}
            max={2}
            step={0.05}
            format={pct}
            testId="audio-volume"
            onChange={(v) => updateAudioClip(clip.id, { volume: v }, `vol-${clip.id}`)}
          />
          <Range
            label={t('editor.music.fadeIn')}
            value={clip.fadeIn}
            min={0}
            max={5000}
            step={100}
            format={secs}
            testId="audio-fade-in"
            onChange={(v) => updateAudioClip(clip.id, { fadeIn: v }, `fin-${clip.id}`)}
          />
          <Range
            label={t('editor.music.fadeOut')}
            value={clip.fadeOut}
            min={0}
            max={5000}
            step={100}
            format={secs}
            testId="audio-fade-out"
            onChange={(v) => updateAudioClip(clip.id, { fadeOut: v }, `fout-${clip.id}`)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={clip.loop}
              data-testid="audio-loop"
              onChange={(e) => updateAudioClip(clip.id, { loop: e.target.checked })}
            />
            {t('editor.music.loop')}
          </label>
        </div>
      )}
    </div>
  )
}
