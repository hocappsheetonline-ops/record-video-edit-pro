import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Aperture,
  ArrowLeftRight,
  Camera,
  Contrast,
  Droplets,
  PartyPopper,
  Sun,
  Tv,
  Vibrate,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  cutPoints,
  DEFAULT_TRANSITION_MS,
  EFFECT_KINDS,
  EMOJI_STICKERS,
  TRANSITION_KINDS,
  type EffectKind,
} from '@lumora/core'
import { useEditorStore } from '../store'
import { ghostButton, Segmented } from '../ui'
import { dragProps } from '../library-drag'
import { Card } from './common'
import { addLibraryItem } from './MediaTab'
import { OnlineGrid } from './OnlineGrid'
import { ShapesGrid } from '../TextPanels'

const EFFECT_ICONS: Record<EffectKind, LucideIcon> = {
  shake: Vibrate,
  glitch: Zap,
  vhs: Tv,
  bw: Contrast,
  vintage: Camera,
  vignette: Aperture,
  blur: Droplets,
  flash: Sun,
  pulse: Activity,
  confetti: PartyPopper,
}

const EFFECT_TILES: Record<EffectKind, string> = {
  shake: 'from-orange-500 to-rose-600',
  glitch: 'from-fuchsia-500 to-cyan-500',
  vhs: 'from-indigo-500 to-pink-500',
  bw: 'from-zinc-200 to-zinc-700',
  vintage: 'from-amber-500 to-yellow-800',
  vignette: 'from-slate-500 to-black',
  blur: 'from-sky-400 to-blue-700',
  flash: 'from-yellow-200 to-orange-400',
  pulse: 'from-emerald-400 to-teal-700',
  confetti: 'from-pink-400 to-violet-600',
}

function EmojiGrid() {
  const addOverlay = useEditorStore((s) => s.addOverlay)
  return (
    <div className="grid grid-cols-6 gap-1 text-2xl">
      {EMOJI_STICKERS.map((e, i) => (
        <button
          key={e}
          type="button"
          data-testid={`emoji-${i}`}
          {...dragProps({ kind: 'emoji', text: e })}
          aria-label={e}
          onClick={() => addOverlay({ kind: 'emoji', text: e })}
          className="flex aspect-square items-center justify-center rounded-lg hover:scale-110 hover:bg-surface-2"
        >
          {e}
        </button>
      ))}
    </div>
  )
}

/** Nhãn dán: emoji có sẵn, hình vẽ sẵn (mũi tên, khoanh tròn…) hoặc sticker động nền trong suốt từ Tenor. */
export function StickersTab() {
  const { t } = useTranslation()
  const [source, setSource] = useState<'emoji' | 'shapes' | 'tenorSticker'>('emoji')
  return (
    <div className="flex flex-col gap-3 p-3">
      <Segmented
        options={[
          { value: 'emoji', label: t('editor.library.sources.emoji') },
          { value: 'shapes', label: t('editor.library.sources.shapes') },
          { value: 'tenorSticker', label: t('editor.library.sources.tenorSticker') },
        ]}
        value={source}
        onChange={setSource}
        testIdPrefix="sticker-source-"
      />
      {source === 'emoji' ? (
        <EmojiGrid />
      ) : source === 'shapes' ? (
        <ShapesGrid />
      ) : (
        <OnlineGrid source="tenorSticker" onUse={addLibraryItem} />
      )}
    </div>
  )
}

export function EffectsTab() {
  const { t } = useTranslation()
  const addEffect = useEditorStore((s) => s.addEffect)
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] text-muted">{t('editor.effects.hint')}</p>
      <div className="grid grid-cols-3 gap-2">
        {EFFECT_KINDS.map((kind) => {
          const Icon = EFFECT_ICONS[kind]
          return (
            <Card
              key={kind}
              testId={`effect-add-${kind}`}
              drag={{ kind: 'effect', id: kind }}
              title={t('editor.library.clickToAdd')}
              onClick={() => addEffect(kind)}
            >
              <span
                className={`flex aspect-square items-center justify-center rounded-md bg-gradient-to-br ${EFFECT_TILES[kind]} text-white`}
              >
                <Icon size={22} aria-hidden />
              </span>
              <span className="truncate">{t(`editor.effects.kinds.${kind}`)}</span>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export function TransitionsTab() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  const time = useEditorStore((s) => s.time)
  if (!edit) return null
  const cuts = cutPoints(edit.clips)
  if (cuts.length === 0)
    return <p className="p-4 text-sm text-muted">{t('editor.transition.noCuts')}</p>
  // Chỗ nối đang chọn, hoặc chỗ nối gần đầu phát nhất.
  const target =
    selection?.kind === 'transition'
      ? selection.id
      : [...cuts].sort((a, b) => Math.abs(a.at - time) - Math.abs(b.at - time))[0]!.afterClip
  const apply = (kind: (typeof TRANSITION_KINDS)[number]) => {
    const s = useEditorStore.getState()
    s.setTransition(target, kind)
    s.select({ kind: 'transition', id: target })
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] text-muted">
        {t('editor.library.transitionTarget', {
          n: cuts.findIndex((c) => c.afterClip === target) + 1,
          count: cuts.length,
        })}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {TRANSITION_KINDS.map((kind) => (
          <Card key={kind} testId={`lib-transition-${kind}`} onClick={() => apply(kind)}>
            <span className="flex aspect-square items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-violet-700 text-white">
              <ArrowLeftRight size={20} aria-hidden />
            </span>
            <span className="truncate">{t(`editor.transition.kinds.${kind}`)}</span>
          </Card>
        ))}
      </div>
      <button
        type="button"
        className={ghostButton}
        data-testid="lib-transition-all"
        onClick={() =>
          useEditorStore.getState().applyTransitionToAll('fadeBlack', DEFAULT_TRANSITION_MS)
        }
      >
        {t('editor.library.transitionAll', { count: cuts.length })}
      </button>
    </div>
  )
}
