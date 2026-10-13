import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Circle, CircleAlert, LoaderCircle } from 'lucide-react'
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
  type WhisperModel,
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
import { useAiStatus } from '../ai/status'

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

/** Sáu việc cần có để AI chạy hoàn toàn trên máy, theo đúng thứ tự thiết lập. */
const SETUP_STEPS = [
  'ollama',
  'ollamaModel',
  'whisper',
  'whisperModel',
  'piper',
  'piperVoice',
] as const
type SetupStep = (typeof SETUP_STEPS)[number]
type SetupStepState = 'done' | 'missing' | 'busy' | 'error'
type SetupDone = Record<SetupStep, boolean>
/** Những gì cần có trên máy, lấy từ cài đặt (model Ollama, model Whisper, giọng Piper). */
interface SetupTargets {
  baseUrl: string
  model: string
  whisperModel: WhisperModel
  piperVoice: string
}

const OLLAMA_POLL_MS = 3_000
const OLLAMA_WAIT_MS = 10 * 60_000
/** Ném ra khi người dùng bấm Dừng trong lúc đang chờ Ollama. */
const SETUP_CANCELLED = 'local_setup_cancelled'

/** Model đã có trong Ollama chưa (bỏ qua tag như `:latest`, giống store trạng thái AI). */
const hasModel = (models: string[], model: string) =>
  models.some((m) => m === model || m.split(':')[0] === model.split(':')[0])

/** Hỏi Ollama và bộ giọng nói xem từng việc đã xong chưa; Ollama tắt thì thiếu cả hai việc đầu. */
async function checkSetup(targets: SetupTargets): Promise<SetupDone> {
  const api = lumora()
  const [models, speech] = await Promise.all([
    api.listLocalModels(targets.baseUrl).catch(() => null),
    api.localSpeechStatus().catch(() => null),
  ])
  return {
    ollama: models !== null,
    ollamaModel: models !== null && hasModel(models, targets.model),
    whisper: speech?.whisper.installed ?? false,
    whisperModel: speech?.whisper.models.includes(targets.whisperModel) ?? false,
    piper: speech?.piper.installed ?? false,
    piperVoice: speech?.piper.voices.includes(targets.piperVoice) ?? false,
  }
}

/** Đợi Ollama lên sau khi người dùng chạy bộ cài: hỏi mỗi 3 giây, tối đa 10 phút. */
async function waitForOllama(baseUrl: string, cancelled: () => boolean): Promise<void> {
  const deadline = Date.now() + OLLAMA_WAIT_MS
  for (;;) {
    try {
      await lumora().listLocalModels(baseUrl)
      return
    } catch {
      if (cancelled()) throw new Error(SETUP_CANCELLED)
      if (Date.now() >= deadline) throw new Error('ollama_timeout')
      await new Promise((resolve) => setTimeout(resolve, OLLAMA_POLL_MS))
    }
  }
}

/** Lỗi của một bước thiết lập → câu ngắn dễ hiểu (gom các câu báo lỗi của hai thẻ cũ). */
function localSetupError(t: TFunction, step: SetupStep, e: unknown, model: string): string {
  const message = e instanceof Error ? e.message : String(e)
  if (step === 'ollama')
    return message.includes('ollama_timeout')
      ? t('settings.localSetup.errors.ollamaTimeout')
      : t('settings.localAi.installFailed')
  if (step === 'ollamaModel')
    return message.includes('ollama_model')
      ? t('settings.localAi.pullNotFound', { model })
      : t('settings.localAi.offline')
  return localSpeechActionError(t, e)
}

/** Sự kiện tiến độ nào thuộc về bước nào (để không lẫn tiến độ bước trước). */
const progressKindOf = (step: SetupStep): LocalAiProgress['kind'] =>
  step === 'ollama' ? 'install' : step === 'ollamaModel' ? 'pull' : 'speech'

/**
 * Thiết lập AI trên máy một chạm: danh sách sáu việc cần có, một nút làm hết những việc còn thiếu
 * theo thứ tự (Ollama → model → whisper.cpp → model Whisper → Piper → giọng), hai công tắc bật
 * dùng. Các điều khiển chi tiết (LocalAiCard, LocalSpeechCard) nằm gọn dưới "Nâng cao".
 */
function LocalSetupCard() {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [done, setDone] = useState<SetupDone | null>(null)
  const [current, setCurrent] = useState<{
    step: SetupStep
    index: number
    count: number
    /** Đã mở bộ cài Ollama, đang chờ người dùng cài xong. */
    waiting?: boolean
  } | null>(null)
  const [progress, setProgress] = useState<LocalAiProgress | null>(null)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string; step?: SetupStep } | null>(
    null,
  )
  const [stopping, setStopping] = useState(false)
  const cancelRef = useRef(false)
  const runningRef = useRef(false)
  useEffect(() => lumora().onLocalAiProgress(setProgress), [])

  const baseUrl = settings?.localAi.baseUrl
  const model = settings?.localAi.model
  const whisperModel = settings?.localSpeech.whisperModel
  const piperVoice = settings?.localSpeech.piperVoice
  // Kiểm tra lúc gắn thẻ và mỗi khi người dùng đổi model / giọng ở phần Nâng cao.
  useEffect(() => {
    if (!baseUrl || !model || !whisperModel || !piperVoice || runningRef.current) return
    let live = true
    void checkSetup({ baseUrl, model, whisperModel, piperVoice }).then((d) => {
      if (live) setDone(d)
    })
    return () => {
      live = false
    }
  }, [baseUrl, model, whisperModel, piperVoice])

  if (!settings) return null
  const targets: SetupTargets = {
    baseUrl: settings.localAi.baseUrl,
    model: settings.localAi.model,
    whisperModel: settings.localSpeech.whisperModel,
    piperVoice: settings.localSpeech.piperVoice,
  }
  const stepLabel = (step: SetupStep) =>
    t(`settings.localSetup.steps.${step}`, {
      model: step === 'ollamaModel' ? targets.model : targets.whisperModel,
      voice: targets.piperVoice,
    })

  const runStep = async (step: SetupStep) => {
    const api = lumora()
    switch (step) {
      case 'ollama':
        await api.installOllama()
        setCurrent((c) => c && { ...c, waiting: true })
        await waitForOllama(targets.baseUrl, () => cancelRef.current)
        return
      case 'ollamaModel':
        return api.pullLocalModel(targets.baseUrl, targets.model)
      case 'whisper':
        return api.installLocalSpeech('whisper')
      case 'whisperModel':
        return api.downloadLocalSpeech('model', targets.whisperModel)
      case 'piper':
        return api.installLocalSpeech('piper')
      case 'piperVoice':
        return api.downloadLocalSpeech('voice', targets.piperVoice)
    }
  }

  /** Làm lần lượt những việc còn thiếu; xong hết thì bật cả hai công tắc. */
  const run = async () => {
    cancelRef.current = false
    runningRef.current = true
    setStopping(false)
    setNote(null)
    try {
      let state = await checkSetup(targets)
      setDone(state)
      const plan = SETUP_STEPS.filter((k) => !state[k])
      let finished = true
      for (const [i, step] of plan.entries()) {
        if (cancelRef.current) {
          finished = false
          break
        }
        // Kiểm tra lại ngay trước mỗi bước: Ollama vừa lên có thể đã sẵn model, khỏi tải lại.
        if (i > 0) {
          state = await checkSetup(targets)
          setDone(state)
          if (state[step]) continue
        }
        setCurrent({ step, index: i + 1, count: plan.length })
        setProgress(null)
        try {
          await runStep(step)
        } catch (e) {
          if (e instanceof Error && e.message === SETUP_CANCELLED) {
            finished = false
            break
          }
          setNote({
            tone: 'error',
            step,
            text: t('settings.localSetup.failed', {
              step: stepLabel(step),
              message: localSetupError(t, step, e, targets.model),
            }),
          })
          setCurrent(null)
          setDone(await checkSetup(targets))
          void useAiStatus.getState().refresh()
          return
        }
        setDone((d) => ({ ...(d ?? state), [step]: true }))
        void useAiStatus.getState().refresh()
      }
      setCurrent(null)
      setProgress(null)
      if (!finished) {
        setDone(await checkSetup(targets))
        setNote({ tone: 'ok', text: t('settings.localSetup.cancelled') })
        return
      }
      const latest = useAppStore.getState().settings
      if (latest)
        await updateSettings({
          localAi: { ...latest.localAi, enabled: true },
          localSpeech: { ...latest.localSpeech, enabled: true },
        })
      setDone(await checkSetup(targets))
      await useAiStatus.getState().refresh()
      setNote({ tone: 'ok', text: t('settings.localSetup.success') })
    } finally {
      runningRef.current = false
      setStopping(false)
    }
  }
  const cancel = () => {
    cancelRef.current = true
    setStopping(true)
  }

  const running = current !== null
  const allDone = done !== null && SETUP_STEPS.every((k) => done[k])
  const anyDone = done !== null && SETUP_STEPS.some((k) => done[k])
  const stateOf = (step: SetupStep): SetupStepState =>
    current?.step === step || done === null
      ? 'busy'
      : note?.step === step
        ? 'error'
        : done[step]
          ? 'done'
          : 'missing'
  const shownProgress =
    current && !current.waiting && progress?.kind === progressKindOf(current.step) ? progress : null
  const percent =
    shownProgress && shownProgress.total > 0
      ? Math.round((shownProgress.completed / shownProgress.total) * 100)
      : null
  /** Dòng trạng thái lúc đang chạy: "Bước 3/6: Đang tải model Whisper · 120 / 574 MB". */
  const runningText = () => {
    if (!current) return ''
    const what = current.waiting
      ? t('settings.localSetup.doing.ollamaWait')
      : t(`settings.localSetup.doing.${current.step}`, {
          model: current.step === 'ollamaModel' ? targets.model : targets.whisperModel,
          voice: targets.piperVoice,
        })
    const mb =
      shownProgress && shownProgress.total > 0
        ? ` · ${t('settings.localSetup.progressMb', {
            done: toMb(shownProgress.completed),
            total: toMb(shownProgress.total),
          })}`
        : ''
    return `${t('settings.localSetup.stepOf', { index: current.index, count: current.count, what })}${mb}`
  }
  const StepIcon = ({ state }: { state: SetupStepState }) => {
    const cls = 'size-4 shrink-0'
    if (state === 'done') return <Check className={`${cls} text-success`} aria-hidden />
    if (state === 'busy')
      return <LoaderCircle className={`${cls} animate-spin text-accent`} aria-hidden />
    if (state === 'error') return <CircleAlert className={`${cls} text-danger`} aria-hidden />
    return <Circle className={`${cls} text-muted/60`} aria-hidden />
  }
  const buttonText = running
    ? t('settings.localSetup.running')
    : allDone
      ? t('settings.localSetup.ready')
      : anyDone
        ? t('settings.localSetup.finish')
        : t('settings.localSetup.run')

  return (
    <div
      className="mb-8 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
      data-testid="local-setup-card"
    >
      <p className="text-sm text-muted">{t('settings.localSetup.intro')}</p>

      <ul className="flex flex-col" data-testid="local-setup-steps">
        {SETUP_STEPS.map((step) => {
          const state = stateOf(step)
          return (
            <li
              key={step}
              data-testid={`local-setup-step-${step}`}
              data-state={state}
              className="flex h-8 items-center gap-2.5 text-sm"
            >
              <StepIcon state={state} />
              <span className={state === 'missing' ? 'text-muted' : ''}>{stepLabel(step)}</span>
              <span className="ml-auto text-xs text-muted">
                {done === null && state === 'busy'
                  ? t('settings.localSetup.state.checking')
                  : t(`settings.localSetup.state.${state}`)}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="local-setup-run"
          disabled={running || allDone || done === null}
          onClick={() => void run()}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110 disabled:opacity-60"
        >
          {buttonText}
        </button>
        {running && (
          <button
            type="button"
            data-testid="local-setup-cancel"
            disabled={stopping}
            onClick={cancel}
            className={speechButton}
          >
            {stopping ? t('settings.localSetup.stopping') : t('settings.localSetup.cancel')}
          </button>
        )}
        {(running || note) && (
          <span
            role="status"
            data-testid="local-setup-status"
            className={`text-sm ${
              running ? 'text-muted' : note?.tone === 'ok' ? 'text-success' : 'text-danger'
            }`}
          >
            {running ? runningText() : note?.text}
          </span>
        )}
      </div>
      {running && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          data-testid="local-setup-progress"
          role="progressbar"
          aria-valuenow={percent ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full bg-accent transition-[width] ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
            style={percent !== null ? { width: `${percent}%` } : undefined}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <Toggle
          label={t('settings.localSetup.useAi')}
          hint={t('settings.localSetup.useAiOff')}
          checked={settings.localAi.enabled}
          testId="local-setup-use-ai"
          onChange={(enabled) => void updateSettings({ localAi: { ...settings.localAi, enabled } })}
        />
        <Toggle
          label={t('settings.localSetup.useSpeech')}
          hint={t('settings.localSetup.useSpeechOff')}
          checked={settings.localSpeech.enabled}
          testId="local-setup-use-speech"
          onChange={(enabled) =>
            void updateSettings({ localSpeech: { ...settings.localSpeech, enabled } })
          }
        />
      </div>

      <details data-testid="local-setup-advanced" className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm text-muted hover:text-text">
          {t('settings.localSetup.advanced')}
        </summary>
        <div className="mt-4 flex flex-col [&>div]:mb-0">
          <h3 className={groupTitle}>{t('settings.localAi.title')}</h3>
          <LocalAiCard />
          <h3 className={`${groupTitle} mt-4`}>{t('settings.localSpeech.title')}</h3>
          <LocalSpeechCard />
        </div>
      </details>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const settingsSection = useAppStore((s) => s.settingsSection)
  const aiSectionRef = useRef<HTMLDivElement>(null)
  // Mở từ thanh trạng thái AI: cuộn tới mục AI rồi xóa cờ để lần sau mở bình thường.
  useEffect(() => {
    if (settingsSection !== 'ai' || !settings) return
    aiSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    useAppStore.setState({ settingsSection: null })
  }, [settingsSection, settings])
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

      <div data-section="ai" ref={aiSectionRef} className="scroll-mt-4">
        <h2 className={groupTitle}>{t('settings.localSetup.title')}</h2>
        <LocalSetupCard />
      </div>

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
