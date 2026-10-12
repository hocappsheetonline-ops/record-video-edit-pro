import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Circle,
  Loader2,
  MessageSquareQuote,
  Music2,
  Plus,
  Square,
  Upload,
  Volume2,
} from 'lucide-react'
import { SOUND_EFFECT_IDS, type SoundEffectId } from '@lumora/core'
import { lumora } from '../../api'
import { MicMeter } from '../../components/MicMeter'
import { getMicStream, stopStream } from '../../lib/media'
import { useAppStore } from '../../store/app'
import { useEditorStore } from '../store'
import { primaryButton, Segmented, Toggle } from '../ui'
import { ErrorNote, Heading, useErrorText } from './common'

/** Hiệu ứng âm thanh meme (phần cuối danh sách); phần đầu là hiệu ứng cơ bản. */
const MEME_SFX: readonly SoundEffectId[] = SOUND_EFFECT_IDS.slice(
  SOUND_EFFECT_IDS.indexOf('vineBoom'),
)
const BASIC_SFX = SOUND_EFFECT_IDS.filter((id) => !MEME_SFX.includes(id))

/** Câu meme hay dùng để đọc bằng giọng AI. */
export const MEME_LINES = [
  'Bruh',
  'Ối dồi ôi',
  'Hết cứu',
  'Ủa alo?',
  'Đỉnh nóc kịch trần',
  'Wait for it…',
  'Plot twist!',
  'No way!',
  'Oh no…',
  "Let's go!",
  'Chấm hết.',
  'Ai cho bạn làm vậy?',
]

type Busy = string | null

function SfxRow({ id, busy, onAdd }: { id: SoundEffectId; busy: Busy; onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-testid={`sfx-${id}`}
      disabled={busy !== null}
      onClick={onAdd}
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-sky-500/30 to-indigo-500/30 text-sky-300">
        {busy === id ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <Volume2 size={15} aria-hidden />
        )}
      </span>
      <span className="flex-1 text-left">{t(`editor.music.effects.${id}`)}</span>
      <Plus size={15} aria-hidden className="text-muted opacity-0 group-hover:opacity-100" />
    </button>
  )
}

/** Meme sound: đọc câu bằng giọng AI (ElevenLabs) rồi thêm tại đầu phát. */
function SpeechMaker({
  busy,
  run,
}: {
  busy: Busy
  run: (key: string, task: () => Promise<unknown>) => void
}) {
  const { t } = useTranslation()
  const hasKey = useAppStore((s) => s.secrets?.elevenlabs?.state === 'saved')
  const setPage = useAppStore((s) => s.setPage)
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([])
  const [voice, setVoice] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!hasKey) return
    void lumora()
      .listVoices()
      .then((list) => {
        setVoices(list)
        setVoice((v) => v || list[0]?.id || '')
      })
      .catch(() => setVoices([]))
  }, [hasKey])

  if (!hasKey)
    return (
      <p className="text-xs text-muted">
        {t('editor.library.speechNeedsKey')}{' '}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => setPage('settings')}
        >
          {t('editor.library.openSettings')}
        </button>
      </p>
    )

  const speak = (line: string) =>
    voice &&
    line.trim() &&
    run(`speech:${line}`, () => useEditorStore.getState().addSpeech(line, voice))
  return (
    <div className="flex flex-col gap-2" data-testid="speech-maker">
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted">{t('editor.library.voice')}</span>
        <select
          value={voice}
          data-testid="speech-voice"
          onChange={(e) => setVoice(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-1">
        {MEME_LINES.map((line, i) => (
          <button
            key={line}
            type="button"
            data-testid={`speech-line-${i}`}
            disabled={busy !== null || !voice}
            onClick={() => speak(line)}
            className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-text disabled:opacity-50"
          >
            {busy === `speech:${line}` && (
              <Loader2 size={10} className="animate-spin" aria-hidden />
            )}
            {line}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          speak(text)
          setText('')
        }}
      >
        <input
          value={text}
          maxLength={500}
          data-testid="speech-text"
          aria-label={t('editor.library.speechPlaceholder')}
          placeholder={t('editor.library.speechPlaceholder')}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
        <button
          type="submit"
          data-testid="speech-add"
          disabled={busy !== null || !voice || !text.trim()}
          aria-label={t('editor.library.speechAdd')}
          data-tooltip={t('editor.library.speechAdd')}
          className="rounded-md bg-accent px-2.5 text-accent-fg disabled:opacity-40"
        >
          <Plus size={15} aria-hidden />
        </button>
      </form>
    </div>
  )
}

const COUNTDOWN_S = 3

type Phase =
  { kind: 'idle' } | { kind: 'countdown'; left: number } | { kind: 'recording'; since: number }

/**
 * Lồng tiếng: ghi micro trong khi video phát từ đầu phát (có đếm ngược, tùy chọn tắt tiếng bản
 * gốc). Dừng lại thì bản ghi thành một đoạn "Lồng tiếng" trên hàng Âm thanh, đúng chỗ bắt đầu.
 */
function VoiceOver({ onError }: { onError: (e: unknown) => void }) {
  const { t } = useTranslation()
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [mic, setMic] = useState('')
  const [mute, setMute] = useState(true)
  const [countdown, setCountdown] = useState(true)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const session = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    chunks: Blob[]
    at: number
  } | null>(null)
  const playing = useEditorStore((s) => s.playing)

  useEffect(() => {
    void (navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? Promise.resolve([])).then(
      (list) => {
        const inputs = list.filter((d) => d.kind === 'audioinput' && d.deviceId)
        setMics(inputs)
        setMic((m) => m || inputs[0]?.deviceId || '')
      },
    )
  }, [])

  const stop = () => {
    const s = session.current
    if (!s) return
    session.current = null
    s.recorder.stop()
  }

  // Video phát hết (hoặc người dùng bấm dừng) thì dừng ghi.
  useEffect(() => {
    if (!playing && phase.kind === 'recording') stop()
  }, [playing, phase.kind])

  // Đồng hồ thời gian ghi và đếm ngược.
  useEffect(() => {
    if (phase.kind === 'idle') return
    const timer = setInterval(() => {
      if (phase.kind === 'recording') setElapsed(Date.now() - phase.since)
    }, 200)
    return () => clearInterval(timer)
  }, [phase])

  const begin = async () => {
    const store = useEditorStore.getState()
    const stream = await getMicStream(mic)
    const type = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : ''
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : {})
    const chunks: Blob[] = []
    const at = store.time
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
    recorder.onstop = () => {
      stopStream(stream)
      const s = useEditorStore.getState()
      s.setPlaying(false)
      s.setMuteOriginal(false)
      setPhase({ kind: 'idle' })
      setSaving(true)
      const n = (s.edit?.audioClips.filter((c) => c.kind === 'voice').length ?? 0) + 1
      void new Blob(chunks, { type: type || 'audio/webm' })
        .arrayBuffer()
        .then((data) => s.addVoiceover(data, at, t('editor.library.voiceName', { n })))
        .catch(onError)
        .finally(() => setSaving(false))
    }
    session.current = { recorder, stream, chunks, at }
    recorder.start(250)
    store.setMuteOriginal(mute)
    store.setPlaying(true)
    setElapsed(0)
    setPhase({ kind: 'recording', since: Date.now() })
  }

  const start = async () => {
    try {
      if (countdown) {
        for (let left = COUNTDOWN_S; left > 0; left--) {
          setPhase({ kind: 'countdown', left })
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
      await begin()
    } catch (e) {
      setPhase({ kind: 'idle' })
      onError(e)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="voice-over">
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted">{t('editor.library.voiceMic')}</span>
        <select
          value={mic}
          data-testid="voice-mic"
          disabled={phase.kind !== 'idle'}
          onChange={(e) => setMic(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        >
          {mics.map((m, i) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || `Micro ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      {mic && <MicMeter deviceId={mic} />}
      <Toggle
        label={t('editor.library.voiceMute')}
        checked={mute}
        onChange={setMute}
        testId="voice-mute"
      />
      <Toggle
        label={t('editor.library.voiceCountdown')}
        checked={countdown}
        onChange={setCountdown}
        testId="voice-countdown-toggle"
      />
      {phase.kind === 'recording' ? (
        <button
          type="button"
          data-testid="voice-stop"
          onClick={stop}
          className="flex items-center justify-center gap-2 rounded-md bg-danger px-3 py-2 text-sm font-medium text-white"
        >
          <Square size={14} fill="currentColor" aria-hidden />
          {t('editor.library.voiceStop')}
          <span className="font-mono tabular-nums" data-testid="voice-elapsed">
            {(elapsed / 1000).toFixed(1)}s
          </span>
        </button>
      ) : (
        <button
          type="button"
          data-testid="voice-record"
          disabled={!mic || phase.kind === 'countdown' || saving}
          onClick={() => void start()}
          className="flex items-center justify-center gap-2 rounded-md border border-danger/60 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Circle size={14} fill="currentColor" aria-hidden />
          )}
          {phase.kind === 'countdown' ? (
            <span data-testid="voice-countdown">{phase.left}</span>
          ) : saving ? (
            t('editor.library.voiceSaving')
          ) : (
            t('editor.library.voiceRecord')
          )}
        </button>
      )}
      <p className="text-[11px] text-muted">{t('editor.library.voiceHint')}</p>
    </div>
  )
}

/** Mục Âm thanh: nhạc từ máy, hiệu ứng âm thanh, âm thanh meme và giọng đọc AI. */
export function AudioTab() {
  const { t } = useTranslation()
  const [section, setSection] = useState<'sfx' | 'meme' | 'music' | 'voice'>('sfx')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const errorText = useErrorText()
  const { addMusic, addSoundEffect } = useEditorStore.getState()
  const run = (key: string, task: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    void task()
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(null))
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <Segmented
        options={[
          { value: 'sfx', label: t('editor.library.audioSections.sfx') },
          { value: 'meme', label: t('editor.library.audioSections.meme') },
          { value: 'music', label: t('editor.library.audioSections.music') },
          { value: 'voice', label: t('editor.library.audioSections.voice') },
        ]}
        value={section}
        onChange={setSection}
        testIdPrefix="audio-section-"
      />
      <ErrorNote text={error} />
      {section === 'music' && (
        <>
          <button
            type="button"
            data-testid="add-music"
            disabled={busy !== null}
            onClick={() => run('music', addMusic)}
            className={primaryButton}
          >
            {busy === 'music' ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Upload size={15} aria-hidden />
            )}
            {busy === 'music' ? t('editor.music.adding') : t('editor.music.add')}
          </button>
          <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-[11px] text-muted">
            <Music2 size={16} aria-hidden className="mt-0.5 shrink-0" />
            <p>{t('editor.music.hint')}</p>
          </div>
        </>
      )}
      {section === 'voice' && <VoiceOver onError={(e) => setError(errorText(e))} />}
      {section === 'sfx' && (
        <div className="flex flex-col">
          {BASIC_SFX.map((id) => (
            <SfxRow key={id} id={id} busy={busy} onAdd={() => run(id, () => addSoundEffect(id))} />
          ))}
        </div>
      )}
      {section === 'meme' && (
        <>
          <div className="flex flex-col">
            {MEME_SFX.map((id) => (
              <SfxRow
                key={id}
                id={id}
                busy={busy}
                onAdd={() => run(id, () => addSoundEffect(id))}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <MessageSquareQuote size={14} aria-hidden className="text-muted" />
            <Heading>{t('editor.library.speechTitle')}</Heading>
          </div>
          <SpeechMaker busy={busy} run={run} />
        </>
      )}
    </div>
  )
}
