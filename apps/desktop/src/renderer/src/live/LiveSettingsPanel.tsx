import { useTranslation } from 'react-i18next'
import { useLiveStore } from './store'

const input = 'w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm'
const BITRATES = [2500, 4500, 6000, 8000]
const CAPTION_LANGUAGES = ['', 'vi', 'en']

export function LiveSettingsPanel() {
  const { t } = useTranslation()
  const config = useLiveStore((s) => s.config)
  const phase = useLiveStore((s) => s.phase)
  const captionsOn = useLiveStore((s) => s.captionsOn)
  const captionLanguage = useLiveStore((s) => s.captionLanguage)
  const { setConfig, setCaptions } = useLiveStore.getState()
  if (!config) return null
  const locked = phase !== 'idle'

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="live-settings">
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.settings.resolution')}</span>
        <div className="flex gap-2">
          {([720, 1080] as const).map((r) => (
            <button
              key={r}
              type="button"
              disabled={locked}
              aria-pressed={config.resolution === r}
              data-testid={`live-res-${r}`}
              onClick={() => void setConfig({ resolution: r })}
              className={`flex-1 rounded-md border px-2 py-1.5 disabled:opacity-50 ${config.resolution === r ? 'border-accent bg-accent/10' : 'border-border'}`}
            >
              {r}p
            </button>
          ))}
        </div>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.settings.bitrate')}</span>
        <select
          className={input}
          disabled={locked}
          value={config.videoBitrate}
          data-testid="live-bitrate"
          onChange={(e) => void setConfig({ videoBitrate: Number(e.target.value) })}
        >
          {[...new Set([...BITRATES, config.videoBitrate])]
            .sort((a, b) => a - b)
            .map((b) => (
              <option key={b} value={b}>
                {(b / 1000).toFixed(1)} Mbps
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-accent"
          disabled={locked}
          checked={config.recordLocally}
          data-testid="live-record-locally"
          onChange={(e) => void setConfig({ recordLocally: e.target.checked })}
        />
        <span>
          {t('live.settings.recordLocally')}
          <span className="block text-xs text-muted">{t('live.settings.recordLocallyHint')}</span>
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('live.settings.publicUrl')}</span>
        <input
          className={input}
          placeholder="https://…"
          defaultValue={config.publicUrl}
          data-testid="live-public-url"
          onBlur={(e) => void setConfig({ publicUrl: e.target.value.trim() })}
        />
        <span className="text-xs text-muted">{t('live.settings.publicUrlHint')}</span>
      </label>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={captionsOn}
            data-testid="live-captions"
            onChange={(e) => setCaptions(e.target.checked)}
          />
          {t('live.settings.captions')}
        </label>
        <select
          className={input}
          value={captionLanguage}
          data-testid="live-caption-language"
          onChange={(e) => setCaptions(captionsOn, e.target.value)}
        >
          {CAPTION_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t(`live.settings.languages.${l || 'auto'}`)}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">{t('live.settings.captionsHint')}</span>
      </div>
    </div>
  )
}
