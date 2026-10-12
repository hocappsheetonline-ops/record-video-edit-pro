import { useTranslation } from 'react-i18next'
import {
  ACCENT_PRESETS,
  LANGUAGES,
  SECRET_KEYS,
  THEMES,
  type Language,
  type Theme,
} from '@lumora/core'
import { AboutCard } from '../components/AboutCard'
import { ApiKeyCard } from '../components/ApiKeyCard'
import { PageHeader } from '../components/PageHeader'
import { useAppStore } from '../store/app'

const LANGUAGE_NAMES: Record<Language, string> = { vi: 'Tiếng Việt', en: 'English' }

const selectClass =
  'rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent'

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const updateSettings = useAppStore((s) => s.updateSettings)
  if (!settings) return null
  const encryptionAvailable = appInfo?.encryptionAvailable ?? false

  return (
    <div className="max-w-3xl p-8">
      <PageHeader title={t('settings.title')} />

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
        {t('settings.general')}
      </h2>
      <div className="mb-8 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          {t('settings.language')}
          <select
            className={selectClass}
            value={settings.language}
            onChange={(e) => void updateSettings({ language: e.target.value as Language })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGE_NAMES[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t('settings.theme')}
          <select
            className={selectClass}
            value={settings.theme}
            onChange={(e) => void updateSettings({ theme: e.target.value as Theme })}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {t(`settings.themes.${theme}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          {t('settings.accent')}
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                data-testid={`accent-${color}`}
                aria-label={color}
                aria-pressed={settings.accent === color}
                onClick={() => void updateSettings({ accent: color })}
                className={`size-7 rounded-full border-2 ${settings.accent === color ? 'border-text' : 'border-transparent'}`}
                style={{ background: color }}
              />
            ))}
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('settings.accentCustom')}
              <input
                type="color"
                data-testid="accent-custom"
                value={settings.accent}
                onChange={(e) => void updateSettings({ accent: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>

      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
        {t('settings.apiKeys')}
      </h2>
      <p className="mb-3 text-sm text-muted">{t('settings.apiKeysHint')}</p>
      {!encryptionAvailable && (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {t('settings.encryptionUnavailable')}
        </p>
      )}
      <div className="mb-8 flex flex-col gap-4">
        {SECRET_KEYS.map((key) => (
          <ApiKeyCard key={key} secretKey={key} disabled={!encryptionAvailable} />
        ))}
      </div>

      {appInfo && (
        <>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            {t('settings.about')}
          </h2>
          <AboutCard appInfo={appInfo} />
        </>
      )}
    </div>
  )
}
