import { useTranslation } from 'react-i18next'
import {
  ACCENT_PRESETS,
  LANGUAGES,
  PREVIEW_QUALITIES,
  PROJECT_TEMPLATES,
  SECRET_KEYS,
  THEMES,
  type Language,
  type PreviewQuality,
  type ProjectTemplate,
  type Theme,
} from '@lumora/core'
import { AboutCard } from '../components/AboutCard'
import { ApiKeyCard } from '../components/ApiKeyCard'
import { CacheCard } from '../components/CacheCard'
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

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
        {t('settings.editor')}
      </h2>
      <div className="mb-8 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          {t('settings.previewQuality')}
          <select
            className={selectClass}
            data-testid="settings-preview-quality"
            value={settings.previewQuality}
            onChange={(e) =>
              void updateSettings({ previewQuality: e.target.value as PreviewQuality })
            }
          >
            {PREVIEW_QUALITIES.map((q) => (
              <option key={q} value={q}>
                {t(`settings.previewQualities.${q}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t('settings.projectTemplate')}
          <select
            className={selectClass}
            data-testid="settings-template"
            value={settings.projectTemplate}
            onChange={(e) =>
              void updateSettings({ projectTemplate: e.target.value as ProjectTemplate })
            }
          >
            {PROJECT_TEMPLATES.map((p) => (
              <option key={p} value={p}>
                {t(`settings.projectTemplates.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
          <span className="text-muted">{t('settings.onboardingHint')}</span>
          <button
            type="button"
            data-testid="settings-onboarding"
            disabled={!settings.onboardingDone}
            onClick={() => void updateSettings({ onboardingDone: false })}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            {t('settings.onboardingReplay')}
          </button>
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

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
        {t('settings.storage')}
      </h2>
      <div className="mb-8">
        <CacheCard />
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
