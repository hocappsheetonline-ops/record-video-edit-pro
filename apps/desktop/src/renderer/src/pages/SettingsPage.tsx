import { useState } from 'react'
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
import { Toggle } from '../editor/ui'
import { lumora } from '../api'
import { useAppStore } from '../store/app'

const LANGUAGE_NAMES: Record<Language, string> = { vi: 'Tiếng Việt', en: 'English' }

const selectClass =
  'rounded-lg border border-border bg-surface-2 py-2 pl-3 text-sm shadow-sm outline-none focus:border-accent'
/** Tiêu đề nhóm (kiểu Cài đặt hệ thống macOS: chữ nhỏ đậm, không in hoa). */
const groupTitle = 'mb-2 text-[13px] font-semibold text-text'
/** Khối nhóm: thẻ bo góc lớn, viền hairline. */
const group = 'mb-8 grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2'

/**
 * AI cục bộ (Ollama): bật để trợ lý AI, cắt từ thừa, tóm tắt và dịch chạy trên máy bằng model mở,
 * miễn phí và không gửi dữ liệu đi đâu. Người dùng cài Ollama rồi tải một model (ollama pull).
 */
function LocalAiCard() {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [models, setModels] = useState<string[] | null>(null)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!settings) return null
  const local = settings.localAi
  const patch = (p: Partial<typeof local>) => void updateSettings({ localAi: { ...local, ...p } })
  const check = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const list = await lumora().listLocalModels(local.baseUrl)
      setModels(list)
      if (list.length === 0) setStatus({ tone: 'error', text: t('settings.localAi.noModels') })
      else {
        setStatus({ tone: 'ok', text: t('settings.localAi.connected', { count: list.length }) })
        if (!list.includes(local.model)) patch({ model: list[0]! })
      }
    } catch {
      setModels(null)
      setStatus({ tone: 'error', text: t('settings.localAi.offline') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={group} data-testid="local-ai-card">
      <div className="sm:col-span-2">
        <Toggle
          label={t('settings.localAi.enable')}
          hint={t('settings.localAi.hint')}
          checked={local.enabled}
          testId="local-ai-enabled"
          onChange={(enabled) => patch({ enabled })}
        />
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        {t('settings.localAi.url')}
        <input
          type="text"
          data-testid="local-ai-url"
          value={local.baseUrl}
          spellCheck={false}
          onChange={(e) => patch({ baseUrl: e.target.value })}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        {t('settings.localAi.model')}
        {models && models.length > 0 ? (
          <select
            className={selectClass}
            data-testid="local-ai-model"
            value={models.includes(local.model) ? local.model : models[0]}
            onChange={(e) => patch({ model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            data-testid="local-ai-model"
            value={local.model}
            spellCheck={false}
            onChange={(e) => patch({ model: e.target.value })}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        )}
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="button"
          data-testid="local-ai-check"
          disabled={busy}
          onClick={() => void check()}
          className="rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {busy ? t('settings.localAi.checking') : t('settings.localAi.check')}
        </button>
        {status && (
          <span
            role="status"
            data-testid="local-ai-status"
            className={`text-sm ${status.tone === 'ok' ? 'text-success' : 'text-danger'}`}
          >
            {status.text}
          </span>
        )}
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-accent hover:underline"
        >
          {t('settings.localAi.install')}
        </a>
      </div>
      <p className="text-xs text-muted sm:col-span-2">{t('settings.localAi.models')}</p>
    </div>
  )
}

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

      <h2 className={groupTitle}>{t('settings.general')}</h2>
      <div className={group}>
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
                className={`size-6 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.25)] transition-transform hover:scale-110 ${
                  settings.accent === color
                    ? 'ring-2 ring-text ring-offset-2 ring-offset-surface'
                    : ''
                }`}
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
                className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Toggle
            label={t('settings.reduceTransparency')}
            hint={t('settings.reduceTransparencyHint')}
            checked={settings.reduceTransparency}
            testId="settings-reduce-transparency"
            onChange={(v) => void updateSettings({ reduceTransparency: v })}
          />
        </div>
      </div>

      <h2 className={groupTitle}>{t('settings.editor')}</h2>
      <div className={group}>
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
            className="shrink-0 rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50 disabled:shadow-none"
          >
            {t('settings.onboardingReplay')}
          </button>
        </div>
      </div>

      <h2 className={groupTitle}>{t('settings.localAi.title')}</h2>
      <LocalAiCard />

      <h2 className={groupTitle.replace('mb-2', 'mb-1')}>{t('settings.apiKeys')}</h2>
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

      <h2 className={groupTitle}>{t('settings.storage')}</h2>
      <div className="mb-8">
        <CacheCard />
      </div>

      {appInfo && (
        <>
          <h2 className={groupTitle}>{t('settings.about')}</h2>
          <AboutCard appInfo={appInfo} />
        </>
      )}
    </div>
  )
}
