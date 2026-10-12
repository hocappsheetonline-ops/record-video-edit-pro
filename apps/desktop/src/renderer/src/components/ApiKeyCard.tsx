import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { checkKeyFormat, type KeyValidationResult, type SecretKey } from '@lumora/core'
import { lumora } from '../api'
import { useAppStore } from '../store/app'

const KEY_URLS: Record<SecretKey, string> = {
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  tenor: 'https://developers.google.com/tenor/guides/quickstart',
  pixabay: 'https://pixabay.com/api/docs/',
}

type Feedback = { tone: 'ok' | 'error' | 'info'; text: string } | null

export function ApiKeyCard({ secretKey, disabled }: { secretKey: SecretKey; disabled?: boolean }) {
  const { t } = useTranslation()
  const status = useAppStore((s) => s.secrets?.[secretKey])
  const saveSecret = useAppStore((s) => s.saveSecret)
  const deleteSecret = useAppStore((s) => s.deleteSecret)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const describe = (result: KeyValidationResult): Feedback => {
    if (result.ok) return { tone: 'ok', text: t('keys.valid') }
    if (result.reason === 'format')
      return { tone: 'error', text: t(`keys.errors.${result.message}`) }
    return {
      tone: 'error',
      text: t(`keys.errors.${result.reason}`, { message: result.message ?? '' }),
    }
  }

  const run = async (action: () => Promise<Feedback>) => {
    setBusy(true)
    try {
      setFeedback(await action())
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: t('keys.errors.saveFailed', { message: (error as Error).message }),
      })
    } finally {
      setBusy(false)
    }
  }

  const onSave = () =>
    run(async () => {
      const secret = value.trim()
      const formatError = checkKeyFormat(secretKey, secret)
      if (formatError) return { tone: 'error', text: t(`keys.errors.${formatError}`) }
      await saveSecret(secretKey, secret)
      setValue('')
      return { tone: 'ok', text: t('keys.savedOk') }
    })

  const onTest = () =>
    run(async () => {
      setFeedback({ tone: 'info', text: t('keys.testing') })
      return describe(await lumora().testSecret(secretKey, value.trim() || undefined))
    })

  const onRemove = () =>
    run(async () => {
      await deleteSecret(secretKey)
      return { tone: 'info', text: t('keys.removedOk') }
    })

  const saved = status?.state === 'saved'
  const canTest = !disabled && !busy && (value.trim().length > 0 || saved)

  return (
    <section
      data-testid={`key-card-${secretKey}`}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">{t(`keys.${secretKey}.name`)}</h3>
          <p className="text-sm text-muted">{t(`keys.${secretKey}.purpose`)}</p>
        </div>
        <a
          href={KEY_URLS[secretKey]}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm text-accent hover:underline"
        >
          {t('keys.getKey')}
        </a>
      </div>

      <p className="mt-3 text-sm" data-testid={`key-status-${secretKey}`}>
        {saved ? (
          <span className="font-mono text-success">
            {t('keys.saved', { masked: status.masked })}
          </span>
        ) : (
          <span className="text-muted">{t('keys.notSet')}</span>
        )}
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={t(`keys.${secretKey}.name`)}
          placeholder={t('keys.placeholder')}
          value={value}
          disabled={disabled || busy}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={!canTest}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {t('keys.test')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || busy || value.trim().length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {t('keys.save')}
        </button>
        {saved && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-surface-2 disabled:opacity-50"
          >
            {t('keys.remove')}
          </button>
        )}
      </div>

      {feedback && (
        <p
          role="status"
          data-testid={`key-feedback-${secretKey}`}
          className={`mt-2 text-sm ${
            feedback.tone === 'ok'
              ? 'text-success'
              : feedback.tone === 'error'
                ? 'text-danger'
                : 'text-muted'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  )
}
