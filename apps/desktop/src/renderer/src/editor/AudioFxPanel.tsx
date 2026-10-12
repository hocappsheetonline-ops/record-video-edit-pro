import { useTranslation } from 'react-i18next'
import {
  Bot,
  Check,
  Ear,
  Loader2,
  Megaphone,
  Mic,
  Radio,
  Rabbit,
  Repeat,
  Snail,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import {
  DEFAULT_AUDIO_FX,
  isDefaultFx,
  NOISE_LEVELS,
  VOICE_FX,
  type AudioFx,
  type VoiceFx,
} from '@lumora/core'
import { fxKeyOf, useEditorStore } from './store'
import { Segmented, SliderRow, Toggle } from './ui'

const VOICE_ICONS: Record<VoiceFx, LucideIcon> = {
  none: Mic,
  chipmunk: Rabbit,
  deep: Snail,
  robot: Bot,
  echo: Repeat,
  radio: Radio,
  megaphone: Megaphone,
}

/**
 * Lọc tạp âm và hiệu ứng giọng (kiểu CapCut) cho một file âm thanh. File được xử lý ở nền; khi
 * xong, khung xem trước tự phát bản đã xử lý. Giữ nút tai nghe để nghe lại bản gốc.
 */
export function AudioFxPanel({
  file,
  fx,
  onChange,
  testIdPrefix = 'fx-',
}: {
  /** File gốc (để hiện trạng thái xử lý); null nếu nhiều file (micro của nhiều đoạn quay). */
  file: string | null
  fx: AudioFx | undefined
  onChange: (fx: AudioFx) => void
  testIdPrefix?: string
}) {
  const { t } = useTranslation()
  const value = fx ?? DEFAULT_AUDIO_FX
  const status = useEditorStore((s) =>
    file && !isDefaultFx(value) ? s.fxFiles[fxKeyOf(file, value)] : undefined,
  )
  const set = (patch: Partial<AudioFx>) => {
    const next = { ...value, ...patch }
    onChange(next)
    if (file) useEditorStore.getState().ensureFx(file, next)
  }
  const { setBypassFx } = useEditorStore.getState()

  return (
    <div className="flex flex-col gap-3" data-testid={`${testIdPrefix}panel`}>
      <Segmented
        label={t('editor.audioFx.noise')}
        options={NOISE_LEVELS.map((n) => ({
          value: n,
          label: t(`editor.audioFx.noiseLevels.${n}`),
        }))}
        value={value.noise}
        onChange={(noise) => set({ noise })}
        testIdPrefix={`${testIdPrefix}noise-`}
      />
      <Toggle
        label={t('editor.audioFx.enhance')}
        hint={t('editor.audioFx.enhanceHint')}
        checked={value.enhance}
        onChange={(enhance) => set({ enhance })}
        testId={`${testIdPrefix}enhance`}
      />
      <Toggle
        label={t('editor.audioFx.normalize')}
        hint={t('editor.audioFx.normalizeHint')}
        checked={value.normalize}
        onChange={(normalize) => set({ normalize })}
        testId={`${testIdPrefix}normalize`}
      />
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="text-muted">{t('editor.audioFx.voice')}</span>
        <div className="grid grid-cols-4 gap-1.5">
          {VOICE_FX.map((v) => {
            const Icon = VOICE_ICONS[v]
            const active = value.voice === v
            return (
              <button
                key={v}
                type="button"
                data-testid={`${testIdPrefix}voice-${v}`}
                aria-pressed={active}
                onClick={() => set({ voice: v, pitch: v === 'none' ? value.pitch : 0 })}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] ${
                  active
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border text-muted hover:text-text'
                }`}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                <span className="w-full truncate text-center">
                  {t(`editor.audioFx.voices.${v}`)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {value.voice === 'none' && (
        <SliderRow
          label={t('editor.audioFx.pitch')}
          value={value.pitch}
          min={-12}
          max={12}
          step={1}
          defaultValue={0}
          format={(v) => (v > 0 ? `+${v}` : String(v))}
          testId={`${testIdPrefix}pitch`}
          onChange={(pitch) => set({ pitch })}
        />
      )}
      {!isDefaultFx(value) && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs">
          <span className="flex items-center gap-1.5" data-testid={`${testIdPrefix}status`}>
            {status === 'error' ? (
              <>
                <TriangleAlert size={13} className="text-danger" aria-hidden />
                {t('editor.audioFx.failed')}
              </>
            ) : status && status !== 'pending' ? (
              <>
                <Check size={13} className="text-success" aria-hidden />
                {t('editor.audioFx.ready')}
              </>
            ) : (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden />
                {t('editor.audioFx.processing')}
              </>
            )}
          </span>
          <button
            type="button"
            data-testid={`${testIdPrefix}bypass`}
            aria-label={t('editor.audioFx.holdOriginal')}
            data-tooltip={t('editor.audioFx.holdOriginal')}
            onPointerDown={() => setBypassFx(true)}
            onPointerUp={() => setBypassFx(false)}
            onPointerLeave={() => setBypassFx(false)}
            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-muted hover:text-text active:bg-accent active:text-accent-fg"
          >
            <Ear size={13} aria-hidden />
            {t('editor.audioFx.original')}
          </button>
        </div>
      )}
    </div>
  )
}
