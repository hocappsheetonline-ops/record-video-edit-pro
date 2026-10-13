import { useEffect, useState } from 'react'
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
import type { TFunction } from 'i18next'
import type {
  LocalAiProgress,
  LocalSpeechCatalog,
  LocalSpeechStatus,
  SpeechAssetKind,
  SpeechTool,
} from '@shared/ipc'
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

/** Model gợi ý: cân bằng chất lượng tiếng Việt, kích thước và tốc độ trên máy phổ thông. */
const LOCAL_AI_PICKS = [
  { model: 'qwen2.5:7b', key: 'balanced' },
  { model: 'qwen2.5:3b', key: 'light' },
  { model: 'gemma3:4b', key: 'gemma' },
  { model: 'llama3.2:3b', key: 'llama' },
  { model: 'qwen2.5:14b', key: 'big' },
] as const

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
  const [progress, setProgress] = useState<LocalAiProgress | null>(null)
  useEffect(() => lumora().onLocalAiProgress(setProgress), [])
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
  /** Tải model ngay trong app (thay cho lệnh `ollama pull`), rồi tải lại danh sách. */
  const pull = async () => {
    setBusy(true)
    setStatus(null)
    setProgress({ kind: 'pull', status: '', completed: 0, total: 0 })
    try {
      await lumora().pullLocalModel(local.baseUrl, local.model)
      setStatus({ tone: 'ok', text: t('settings.localAi.pulled', { model: local.model }) })
      setModels(
        await lumora()
          .listLocalModels(local.baseUrl)
          .catch(() => null),
      )
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setStatus({
        tone: 'error',
        text: m.includes('ollama_model')
          ? t('settings.localAi.pullNotFound', { model: local.model })
          : t('settings.localAi.offline'),
      })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  /** Tải bộ cài Ollama về máy rồi mở nó. */
  const install = async () => {
    setBusy(true)
    setStatus(null)
    setProgress({ kind: 'install', status: 'download', completed: 0, total: 0 })
    try {
      await lumora().installOllama()
      setStatus({ tone: 'ok', text: t('settings.localAi.installerOpened') })
    } catch {
      setStatus({ tone: 'error', text: t('settings.localAi.installFailed') })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  const percent =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null
  /** Chạy thử để đo tốc độ model trên máy này (đồng thời nạp sẵn model). */
  const benchmark = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const r = await lumora().benchmarkLocalModel(local.baseUrl, local.model)
      const verdict = r.tokensPerSecond >= 15 ? 'fast' : r.tokensPerSecond >= 5 ? 'ok' : 'slow'
      setStatus({
        tone: verdict === 'slow' ? 'error' : 'ok',
        text: t('settings.localAi.benchmarkResult', {
          load: (r.loadMs / 1000).toFixed(1),
          tps: r.tokensPerSecond.toFixed(1),
          verdict: t(`settings.localAi.verdict.${verdict}`),
        }),
      })
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setStatus({
        tone: 'error',
        text: m.includes('ollama_model')
          ? t('settings.localAi.pullNotFound', { model: local.model })
          : t('settings.localAi.offline'),
      })
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
      <div className="flex flex-wrap gap-1 sm:col-span-2" data-testid="local-ai-picks">
        {LOCAL_AI_PICKS.map((pick) => (
          <button
            key={pick.model}
            type="button"
            data-testid={`local-ai-pick-${pick.model}`}
            aria-pressed={local.model === pick.model}
            data-tooltip={t(`settings.localAi.picks.${pick.key}`)}
            onClick={() => patch({ model: pick.model })}
            className={`rounded-md border px-2.5 py-0.5 text-[11px] ${
              local.model === pick.model
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {pick.model}
          </button>
        ))}
      </div>
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
        <button
          type="button"
          data-testid="local-ai-pull"
          disabled={busy}
          onClick={() => void pull()}
          className="rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {t('settings.localAi.pull', { model: local.model })}
        </button>
        <button
          type="button"
          data-testid="local-ai-benchmark"
          disabled={busy}
          onClick={() => void benchmark()}
          className="rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {t('settings.localAi.benchmark')}
        </button>
        <button
          type="button"
          data-testid="local-ai-install"
          disabled={busy}
          onClick={() => void install()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110 disabled:opacity-50"
        >
          {t('settings.localAi.install')}
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
      </div>
      {progress && (
        <div
          className="flex flex-col gap-1 text-xs text-muted sm:col-span-2"
          data-testid="local-ai-progress"
        >
          <span>
            {progress.kind === 'pull'
              ? t('settings.localAi.pulling', { status: progress.status })
              : t('settings.localAi.downloading')}
            {percent !== null && ` · ${percent}%`}
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full bg-accent ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
        </div>
      )}
      <p className="text-xs text-muted sm:col-span-2">{t('settings.localAi.models')}</p>
    </div>
  )
}

const speechButton =
  'rounded-lg border border-border bg-surface-2/70 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-surface-2 disabled:opacity-50'
const speechPrimary =
  'rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110 disabled:opacity-50'

/** Lỗi của bước cài / tải trong thẻ giọng nói cục bộ → câu ngắn dễ hiểu. */
function localSpeechActionError(t: TFunction, e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  const code = /local_speech_download:(\d+)/.exec(message)?.[1]
  if (code) return t('settings.localSpeech.errors.download', { code })
  if (message.includes('local_speech_unsupported'))
    return t('settings.localSpeech.errors.unsupported')
  return t('settings.localSpeech.errors.generic', { message })
}

const toMb = (bytes: number) => (bytes / 1_000_000).toFixed(0)

/** Chip chọn model Whisper / giọng Piper: tên, cỡ file, dấu check khi đã tải. */
function SpeechChip({
  id,
  label,
  sizeMb,
  installed,
  selected,
  testId,
  onClick,
}: {
  id: string
  label: string
  sizeMb: number
  installed: boolean
  selected: boolean
  testId: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      data-installed={installed || undefined}
      data-tooltip={id}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-0.5 text-[11px] ${
        selected
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border text-muted hover:text-text'
      }`}
    >
      {installed && <span aria-label={t('settings.localSpeech.ready')}>✓ </span>}
      {label} · {t('settings.localSpeech.sizeMb', { size: sizeMb })}
    </button>
  )
}

/**
 * Giọng nói cục bộ: phụ đề bằng whisper.cpp và giọng đọc bằng Piper, cài và tải ngay trong app (như
 * Ollama) để không cần key ElevenLabs. Mọi tiến độ tải đi qua `onLocalAiProgress` với kind 'speech'.
 */
function LocalSpeechCard() {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [status, setStatus] = useState<LocalSpeechStatus | null>(null)
  const [catalog, setCatalog] = useState<LocalSpeechCatalog>({ models: [], voices: [] })
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<LocalAiProgress | null>(null)
  useEffect(
    () =>
      lumora().onLocalAiProgress((p) => {
        if (p.kind === 'speech') setProgress(p)
      }),
    [],
  )
  /** Đọc lại trạng thái cài đặt và danh mục (không đụng cờ bận, để gọi được từ effect). */
  const load = () =>
    Promise.all([lumora().localSpeechStatus(), lumora().localSpeechCatalog()])
      .then(([s, c]) => {
        setStatus(s)
        setCatalog(c)
      })
      .catch((e: unknown) => setNote({ tone: 'error', text: localSpeechActionError(t, e) }))
  const refresh = async () => {
    setBusy(true)
    try {
      await load()
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tải lúc gắn thẻ; "Làm mới" gọi lại bằng tay
  }, [])
  if (!settings) return null
  const local = settings.localSpeech
  const patch = (p: Partial<typeof local>) =>
    void updateSettings({ localSpeech: { ...local, ...p } })
  /** Chạy một bước cài / tải / xóa: hiện tiến độ, báo kết quả rồi tải lại trạng thái. */
  const run = async (item: string, action: () => Promise<void>, doneText: string) => {
    setBusy(true)
    setNote(null)
    setProgress({ kind: 'speech', status: 'download', item, completed: 0, total: 0 })
    try {
      await action()
      setNote({ tone: 'ok', text: doneText })
    } catch (e) {
      setNote({ tone: 'error', text: localSpeechActionError(t, e) })
    } finally {
      setProgress(null)
      setBusy(false)
      await load()
    }
  }
  const install = (tool: SpeechTool) =>
    run(
      tool,
      () => lumora().installLocalSpeech(tool),
      t('settings.localSpeech.done.installed', {
        tool: tool === 'whisper' ? 'whisper.cpp' : 'Piper',
      }),
    )
  const download = (kind: SpeechAssetKind, id: string) =>
    run(
      id,
      () => lumora().downloadLocalSpeech(kind, id),
      t('settings.localSpeech.done.downloaded', { id }),
    )
  const remove = (kind: SpeechAssetKind, id: string) =>
    run(
      id,
      () => lumora().removeLocalSpeech(kind, id),
      t('settings.localSpeech.done.removed', { id }),
    )
  const supported = status?.supported !== false
  const modelInstalled = status?.whisper.models.includes(local.whisperModel) ?? false
  const voiceInstalled = status?.piper.voices.includes(local.piperVoice) ?? false
  const percent =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null
  const toolStatus = (tool: SpeechTool) => {
    const installed = tool === 'whisper' ? status?.whisper.installed : status?.piper.installed
    const name = tool === 'whisper' ? 'whisper.cpp' : 'Piper'
    return (
      <span
        data-testid={`local-speech-${tool}-status`}
        className={`text-xs ${installed ? 'text-success' : 'text-muted'}`}
      >
        {installed
          ? t('settings.localSpeech.installed', { tool: name })
          : t('settings.localSpeech.notInstalled', { tool: name })}
      </span>
    )
  }
  // Giọng Piper gộp theo ngôn ngữ, tiếng Việt trước.
  const voiceGroups = (['vi', 'en'] as const)
    .map((lang) => ({ lang, voices: catalog.voices.filter((v) => v.language === lang) }))
    .filter((g) => g.voices.length > 0)
  return (
    <div className={group} data-testid="local-speech-card">
      <div className="sm:col-span-2">
        <Toggle
          label={t('settings.localSpeech.enable')}
          hint={t('settings.localSpeech.hint')}
          checked={local.enabled}
          testId="local-speech-enable"
          onChange={(enabled) => patch({ enabled })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        <p className="text-xs text-muted">{t('settings.localSpeech.steps')}</p>
        <button
          type="button"
          data-testid="local-speech-refresh"
          disabled={busy}
          onClick={() => void refresh()}
          className={speechButton}
        >
          {busy ? t('settings.localSpeech.refreshing') : t('settings.localSpeech.refresh')}
        </button>
      </div>
      {status && !supported && (
        <p
          role="alert"
          data-testid="local-speech-unsupported"
          className="rounded-lg bg-danger/10 p-3 text-sm text-danger sm:col-span-2"
        >
          {t('settings.localSpeech.unsupported', { platform: status.platform })}
        </p>
      )}

      {/* Nhận dạng giọng nói (whisper.cpp) */}
      <div className="flex flex-col gap-2 sm:col-span-2" data-testid="local-speech-whisper">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t('settings.localSpeech.whisper.title')}</span>
          {toolStatus('whisper')}
        </div>
        <div className="flex flex-wrap gap-1" data-testid="local-speech-models">
          {catalog.models.map((m) => (
            <SpeechChip
              key={m.id}
              id={m.id}
              label={m.label}
              sizeMb={m.sizeMb}
              installed={status?.whisper.models.includes(m.id) ?? false}
              selected={local.whisperModel === m.id}
              testId={`local-speech-model-${m.id}`}
              onClick={() => patch({ whisperModel: m.id })}
            />
          ))}
        </div>
        {supported && (
          <div className="flex flex-wrap items-center gap-3">
            {!status?.whisper.installed && (
              <button
                type="button"
                data-testid="local-speech-install-whisper"
                disabled={busy}
                onClick={() => void install('whisper')}
                className={speechPrimary}
              >
                {t('settings.localSpeech.whisper.install')}
              </button>
            )}
            {modelInstalled ? (
              <button
                type="button"
                data-testid="local-speech-remove-model"
                disabled={busy}
                onClick={() => void remove('model', local.whisperModel)}
                className={speechButton}
              >
                {t('settings.localSpeech.removeModel', { id: local.whisperModel })}
              </button>
            ) : (
              <button
                type="button"
                data-testid="local-speech-download-model"
                disabled={busy}
                onClick={() => void download('model', local.whisperModel)}
                className={status?.whisper.installed ? speechPrimary : speechButton}
              >
                {t('settings.localSpeech.downloadModel', { id: local.whisperModel })}
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-muted">{t('settings.localSpeech.whisper.hint')}</p>
      </div>

      {/* Giọng đọc (Piper) */}
      <div className="flex flex-col gap-2 sm:col-span-2" data-testid="local-speech-piper">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t('settings.localSpeech.piper.title')}</span>
          {toolStatus('piper')}
        </div>
        {voiceGroups.map((g) => (
          <div
            key={g.lang}
            className="flex flex-wrap items-center gap-1"
            data-testid={`local-speech-voices-${g.lang}`}
          >
            <span className="mr-1 text-[11px] text-muted">
              {t(`settings.localSpeech.languages.${g.lang}`)}
            </span>
            {g.voices.map((v) => (
              <SpeechChip
                key={v.id}
                id={v.id}
                label={v.label}
                sizeMb={v.sizeMb}
                installed={status?.piper.voices.includes(v.id) ?? false}
                selected={local.piperVoice === v.id}
                testId={`local-speech-voice-${v.id}`}
                onClick={() => patch({ piperVoice: v.id })}
              />
            ))}
          </div>
        ))}
        {supported && (
          <div className="flex flex-wrap items-center gap-3">
            {!status?.piper.installed && (
              <button
                type="button"
                data-testid="local-speech-install-piper"
                disabled={busy}
                onClick={() => void install('piper')}
                className={speechPrimary}
              >
                {t('settings.localSpeech.piper.install')}
              </button>
            )}
            {voiceInstalled ? (
              <button
                type="button"
                data-testid="local-speech-remove-voice"
                disabled={busy}
                onClick={() => void remove('voice', local.piperVoice)}
                className={speechButton}
              >
                {t('settings.localSpeech.removeVoice', { id: local.piperVoice })}
              </button>
            ) : (
              <button
                type="button"
                data-testid="local-speech-download-voice"
                disabled={busy}
                onClick={() => void download('voice', local.piperVoice)}
                className={status?.piper.installed ? speechPrimary : speechButton}
              >
                {t('settings.localSpeech.downloadVoice', { id: local.piperVoice })}
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-muted">{t('settings.localSpeech.piper.hint')}</p>
      </div>

      {note && (
        <span
          role="status"
          data-testid="local-speech-status"
          className={`text-sm sm:col-span-2 ${note.tone === 'ok' ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </span>
      )}
      {progress && (
        <div
          className="flex flex-col gap-1 text-xs text-muted sm:col-span-2"
          data-testid="local-speech-progress"
        >
          <span>
            {t('settings.localSpeech.downloading', { item: progress.item ?? '' })}
            {progress.total > 0 &&
              ` ${t('settings.localSpeech.progressMb', {
                done: toMb(progress.completed),
                total: toMb(progress.total),
              })}`}
            {percent !== null && ` · ${percent}%`}
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full bg-accent ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
        </div>
      )}
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

      <h2 className={groupTitle}>{t('settings.localSpeech.title')}</h2>
      <LocalSpeechCard />

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
