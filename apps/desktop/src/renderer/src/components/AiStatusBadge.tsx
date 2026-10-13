import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { runningAiJob, useAiStatus, watchAiStatus, type SpeechState } from '../ai/status'
import { useJobs } from '../editor/jobs'
import { useAppStore } from '../store/app'

/** Kiểm tra lại trạng thái AI định kỳ khi huy hiệu còn hiện (Ollama có thể được bật/tắt bên ngoài). */
const REFRESH_MS = 60_000

type BadgeState = 'running' | 'ready' | 'partial' | 'off'

/** Số giây đã chạy của việc AI, cập nhật mỗi giây. */
function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === undefined) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  return startedAt === undefined ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}

/** Tên ngắn của bộ máy đang dùng cho việc AI đang chạy (whisper.cpp, Piper, Ollama…). */
function runningEngineName(speech: SpeechState, textName: string, label: string): string {
  const l = label.toLowerCase()
  const isSpeech = /phụ đề|caption|subtitle|giọng|voice|đọc|transcri/.test(l)
  if (!isSpeech) return textName
  return speech.engine === 'local'
    ? /giọng|voice|đọc/.test(l)
      ? 'Piper'
      : 'whisper.cpp'
    : speech.engine === 'elevenlabs'
      ? 'ElevenLabs'
      : textName
}

/**
 * Huy hiệu nhỏ trên thanh tiêu đề trình chỉnh sửa: AI đang chạy gì (kèm thời gian), đang dùng
 * bộ máy nào, hay chưa sẵn sàng vì sao. Bấm vào để mở mục AI trong Cài đặt.
 */
export function AiStatusBadge() {
  const { t } = useTranslation()
  const text = useAiStatus((s) => s.text)
  const speech = useAiStatus((s) => s.speech)
  const jobs = useJobs((s) => s.jobs)
  const openSettings = useAppStore((s) => s.openSettings)
  const job = runningAiJob(jobs)
  const elapsed = useElapsed(job?.startedAt)

  useEffect(() => {
    watchAiStatus()
    void useAiStatus.getState().refresh()
    const timer = setInterval(() => void useAiStatus.getState().refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const textName =
    text.engine === 'ollama'
      ? `${t('ai.status.engines.ollama')} ${text.detail}`.trim()
      : text.engine === 'claude'
        ? t('ai.status.engines.claude')
        : t('ai.status.engines.keywords')
  const speechName = t(`ai.status.engines.${speech.engine}`)

  const state: BadgeState = job
    ? 'running'
    : text.ready && speech.ready
      ? 'ready'
      : text.ready || speech.ready
        ? 'partial'
        : 'off'

  // Lý do chưa sẵn sàng (hiện trong chú thích): từng bộ máy một, kèm phần còn thiếu.
  const reasons: string[] = []
  if (!text.ready && text.problem)
    reasons.push(t(`ai.status.problems.${text.problem}`, { name: text.detail }))
  if (!speech.ready && speech.problem) {
    const missing = speech.missing.map((m) => t(`ai.status.missing.${m}`)).join(', ')
    reasons.push(
      t(`ai.status.problems.${speech.problem}`, { name: speech.detail }) +
        (missing ? ` (${missing})` : ''),
    )
  }

  const short =
    state === 'running'
      ? t('ai.status.running')
      : state === 'ready'
        ? t('ai.status.ready')
        : state === 'partial'
          ? t('ai.status.partial')
          : t('ai.status.notReady')
  const long =
    state === 'running' && job
      ? `${job.label} · ${runningEngineName(speech, textName, job.label)}`
      : state === 'ready'
        ? `${t('ai.status.engineText', { name: textName })} · ${t('ai.status.engineSpeech', { name: speechName })}`
        : short
  const tooltip =
    state === 'running' && job
      ? `${job.label} · ${t('ai.status.elapsed', { s: elapsed })}`
      : reasons.length > 0
        ? `${short}: ${reasons.join('; ')} – ${t('ai.status.setup')}`
        : `${t('ai.status.engineText', { name: textName })} · ${t('ai.status.engineSpeech', { name: speechName })}`

  const tone =
    state === 'running'
      ? 'border-accent/40 text-text'
      : state === 'ready'
        ? 'border-border text-muted hover:text-text'
        : 'border-amber-500/40 text-amber-500'

  return (
    <button
      type="button"
      data-testid="ai-status-badge"
      data-state={state}
      aria-label={tooltip}
      data-tooltip={tooltip}
      title={reasons.length > 0 ? reasons.join('\n') : undefined}
      onClick={() => openSettings('ai')}
      className={`app-no-drag flex h-7 max-w-72 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors hover:bg-text/8 ${tone}`}
    >
      {state === 'running' ? (
        <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-hidden />
      ) : state === 'ready' ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          <Sparkles size={12} className="text-success" aria-hidden />
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <span className="size-2 rounded-full bg-amber-500" aria-hidden />
          <AlertTriangle size={12} aria-hidden />
        </span>
      )}
      <span className="truncate xl:hidden">{short}</span>
      <span className="hidden truncate xl:inline" data-testid="ai-status-text">
        {long}
      </span>
      {state === 'running' && (
        <span className="shrink-0 tabular-nums text-muted" data-testid="ai-status-elapsed">
          · {t('ai.status.elapsed', { s: elapsed })}
        </span>
      )}
    </button>
  )
}
