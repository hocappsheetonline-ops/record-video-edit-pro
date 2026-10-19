import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Aperture,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blinds,
  Camera,
  CircleDot,
  Contrast,
  Crosshair,
  Droplets,
  EyeOff,
  Film,
  Flame,
  MirrorRectangular,
  Flashlight,
  Flower2,
  Grid3x3,
  Lightbulb,
  Moon,
  MoveHorizontal,
  Palette,
  PartyPopper,
  RectangleHorizontal,
  Repeat,
  RotateCw,
  Scan,
  Snowflake,
  Sparkles,
  Sun,
  SunDim,
  Tv,
  UnfoldVertical,
  Vibrate,
  Wind,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import {
  cutPoints,
  sceneCuts,
  sourceSegments,
  DEFAULT_TRANSITION_MS,
  EFFECT_CATEGORIES,
  EFFECT_CATEGORY,
  EFFECT_KINDS,
  EMOJI_STICKERS,
  TRANSITION_CATEGORIES,
  TRANSITION_CATEGORY,
  TRANSITION_KINDS,
  type EffectKind,
  type TransitionKind,
} from '@lumora/core'
import { useEditorStore } from '../store'
import { ghostButton, Segmented } from '../ui'
import { dragProps } from '../library-drag'
import { Card, usePreviewHover } from './common'
import { ShapesGrid } from '../TextPanels'

const EFFECT_ICONS: Record<EffectKind, LucideIcon> = {
  shake: Vibrate,
  pulse: Activity,
  zoomPunch: ZoomIn,
  bounce: ArrowUp,
  mirror: MirrorRectangular,
  glitch: Zap,
  vhs: Tv,
  rgbSplit: Scan,
  pixelate: Grid3x3,
  grain: Film,
  bw: Contrast,
  vintage: Camera,
  invert: Repeat,
  duotone: Palette,
  warm: Flame,
  cool: Moon,
  flash: Sun,
  strobe: Lightbulb,
  glow: Sparkles,
  lightLeak: SunDim,
  vignette: Aperture,
  spotlight: Flashlight,
  letterbox: RectangleHorizontal,
  blur: Droplets,
  confetti: PartyPopper,
  sparkle: Flower2,
  snow: Snowflake,
}

const EFFECT_TILES: Record<EffectKind, string> = {
  shake: 'from-orange-500 to-rose-600',
  pulse: 'from-emerald-400 to-teal-700',
  zoomPunch: 'from-lime-400 to-emerald-700',
  bounce: 'from-teal-400 to-cyan-700',
  mirror: 'from-cyan-400 to-indigo-600',
  glitch: 'from-fuchsia-500 to-cyan-500',
  vhs: 'from-indigo-500 to-pink-500',
  rgbSplit: 'from-red-500 via-fuchsia-500 to-blue-500',
  pixelate: 'from-zinc-500 to-zinc-800',
  grain: 'from-stone-400 to-stone-800',
  bw: 'from-zinc-200 to-zinc-700',
  vintage: 'from-amber-500 to-yellow-800',
  invert: 'from-white to-black',
  duotone: 'from-orange-400 to-violet-800',
  warm: 'from-amber-300 to-orange-600',
  cool: 'from-sky-300 to-blue-800',
  flash: 'from-yellow-200 to-orange-400',
  strobe: 'from-white to-yellow-500',
  glow: 'from-pink-200 to-fuchsia-500',
  lightLeak: 'from-orange-300 to-rose-500',
  vignette: 'from-slate-500 to-black',
  spotlight: 'from-yellow-100 to-slate-900',
  letterbox: 'from-slate-700 to-black',
  blur: 'from-sky-400 to-blue-700',
  confetti: 'from-pink-400 to-violet-600',
  sparkle: 'from-yellow-100 to-amber-500',
  snow: 'from-white to-sky-400',
}

const TRANSITION_ICONS: Record<TransitionKind, LucideIcon> = {
  fadeBlack: Moon,
  fadeWhite: Sun,
  flash: Zap,
  lightLeak: SunDim,
  zoom: ZoomIn,
  zoomOut: ZoomOut,
  whip: Wind,
  spin: RotateCw,
  slide: ArrowLeft,
  slideRight: ArrowRight,
  slideUp: ArrowUp,
  slideDown: ArrowDown,
  shake: Vibrate,
  wipe: MoveHorizontal,
  iris: CircleDot,
  blinds: Blinds,
  squeeze: UnfoldVertical,
  flip: MirrorRectangular,
  blur: Droplets,
  glitch: Crosshair,
  pixelate: Grid3x3,
}

const TRANSITION_TILES: Record<TransitionKind, string> = {
  fadeBlack: 'from-blue-600 via-black to-violet-700',
  fadeWhite: 'from-blue-600 via-white to-violet-700',
  flash: 'from-white to-blue-600',
  lightLeak: 'from-orange-300 to-rose-600',
  zoom: 'from-violet-700 to-blue-600',
  zoomOut: 'from-blue-600 to-violet-700',
  whip: 'from-cyan-400 to-blue-700',
  spin: 'from-fuchsia-500 to-indigo-700',
  slide: 'from-blue-600 to-violet-700',
  slideRight: 'from-violet-700 to-blue-600',
  slideUp: 'from-blue-600 to-violet-700',
  slideDown: 'from-violet-700 to-blue-600',
  shake: 'from-orange-500 to-rose-600',
  wipe: 'from-black via-blue-600 to-violet-700',
  iris: 'from-black to-blue-600',
  blinds: 'from-slate-700 to-blue-700',
  squeeze: 'from-indigo-600 to-black',
  flip: 'from-teal-500 to-indigo-700',
  blur: 'from-sky-400 to-blue-700',
  glitch: 'from-fuchsia-500 to-cyan-500',
  pixelate: 'from-zinc-500 to-zinc-800',
}

function EmojiButton({ emoji, index }: { emoji: string; index: number }) {
  const addOverlay = useEditorStore((s) => s.addOverlay)
  const hover = usePreviewHover(() => ({
    kind: 'overlay',
    overlay: { kind: 'emoji', text: emoji },
  }))
  return (
    <button
      type="button"
      data-testid={`emoji-${index}`}
      {...dragProps({ kind: 'emoji', text: emoji })}
      {...hover.props}
      aria-label={emoji}
      onClick={() => {
        hover.stop()
        addOverlay({ kind: 'emoji', text: emoji })
      }}
      className="flex aspect-square items-center justify-center rounded-lg hover:scale-110 hover:bg-surface-2"
    >
      {emoji}
    </button>
  )
}

function EmojiGrid() {
  return (
    <div className="grid grid-cols-6 gap-1 text-2xl">
      {EMOJI_STICKERS.map((e, i) => (
        <EmojiButton key={e} emoji={e} index={i} />
      ))}
    </div>
  )
}

/** Nhãn dán: emoji có sẵn hoặc hình vẽ sẵn (mũi tên, khoanh tròn…). */
export function StickersTab() {
  const { t } = useTranslation()
  const [source, setSource] = useState<'emoji' | 'shapes'>('emoji')
  return (
    <div className="flex flex-col gap-3 p-3">
      <Segmented
        options={[
          { value: 'emoji', label: t('editor.library.sources.emoji') },
          { value: 'shapes', label: t('editor.library.sources.shapes') },
        ]}
        value={source}
        onChange={setSource}
        testIdPrefix="sticker-source-"
      />
      {source === 'emoji' ? <EmojiGrid /> : <ShapesGrid />}
    </div>
  )
}

export function EffectsTab() {
  const { t } = useTranslation()
  const addEffect = useEditorStore((s) => s.addEffect)
  const addOverlay = useEditorStore((s) => s.addOverlay)
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] text-muted">{t('editor.effects.hint')}</p>
      <h3 className="text-xs font-medium text-text">{t('editor.blur.title')}</h3>
      <p className="text-[11px] text-muted">{t('editor.blur.libraryHint')}</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { mode: 'blur', Icon: EyeOff, tile: 'from-slate-500 to-slate-700' },
            { mode: 'pixelate', Icon: Grid3x3, tile: 'from-zinc-500 to-zinc-800' },
          ] as const
        ).map(({ mode, Icon, tile }) => (
          <Card
            key={mode}
            testId={`blur-add-${mode}`}
            title={t('editor.library.clickToAdd')}
            onClick={() => addOverlay({ kind: 'blur', blurMode: mode })}
          >
            <span
              className={`flex aspect-square items-center justify-center rounded-md bg-gradient-to-br ${tile} text-white`}
            >
              <Icon size={22} aria-hidden />
            </span>
            <span className="truncate">{t(`editor.blur.modes.${mode}`)}</span>
          </Card>
        ))}
      </div>
      {EFFECT_CATEGORIES.map((category) => (
        <div
          key={category}
          className="flex flex-col gap-2"
          data-testid={`effect-group-${category}`}
        >
          <h3 className="text-xs font-medium text-text">
            {t(`editor.effects.categories.${category}`)}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {EFFECT_KINDS.filter((kind) => EFFECT_CATEGORY[kind] === category).map((kind) => {
              const Icon = EFFECT_ICONS[kind]
              return (
                <Card
                  key={kind}
                  testId={`effect-add-${kind}`}
                  drag={{ kind: 'effect', id: kind }}
                  title={t('editor.library.clickToAdd')}
                  preview={() => ({ kind: 'effect', effect: kind })}
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
      ))}
    </div>
  )
}

export function TransitionsTab() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const project = useEditorStore((s) => s.project)
  const selection = useEditorStore((s) => s.selection)
  const time = useEditorStore((s) => s.time)
  if (!edit) return null
  const cuts = cutPoints(edit.clips)
  // Chỗ đổi cảnh (đổi đoạn quay / bỏ một đoạn dài): nơi nên đặt chuyển cảnh.
  const scenes = sceneCuts(edit.clips, project ? sourceSegments(project.segments) : undefined)
  if (cuts.length === 0)
    return <p className="p-4 text-sm text-muted">{t('editor.transition.noCuts')}</p>
  // Chỗ nối đang chọn, hoặc chỗ nối gần đầu phát nhất.
  const target =
    selection?.kind === 'transition'
      ? selection.id
      : [...cuts].sort((a, b) => Math.abs(a.at - time) - Math.abs(b.at - time))[0]!.afterClip
  const current = edit.transitions.find((x) => x.afterClip === target)
  const apply = (kind: TransitionKind) => {
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
      {TRANSITION_CATEGORIES.map((category) => (
        <div
          key={category}
          className="flex flex-col gap-2"
          data-testid={`transition-group-${category}`}
        >
          <h3 className="text-xs font-medium text-text">
            {t(`editor.transition.categories.${category}`)}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {TRANSITION_KINDS.filter((kind) => TRANSITION_CATEGORY[kind] === category).map(
              (kind) => {
                const Icon = TRANSITION_ICONS[kind]
                const active = current?.kind === kind
                return (
                  <Card
                    key={kind}
                    testId={`lib-transition-${kind}`}
                    title={t('editor.library.clickToAdd')}
                    preview={() => ({ kind: 'transition', transition: kind, afterClip: target })}
                    onClick={() => apply(kind)}
                  >
                    <span
                      className={`flex aspect-square items-center justify-center rounded-md bg-gradient-to-br ${TRANSITION_TILES[kind]} text-white ${active ? 'ring-2 ring-accent' : ''}`}
                    >
                      <Icon size={20} aria-hidden />
                    </span>
                    <span className="truncate">{t(`editor.transition.kinds.${kind}`)}</span>
                  </Card>
                )
              },
            )}
          </div>
        </div>
      ))}
      {scenes.length > 0 && (
        <button
          type="button"
          className={ghostButton}
          data-testid="lib-transition-scenes"
          onClick={() =>
            useEditorStore
              .getState()
              .applyTransitionToAll(
                current?.kind ?? 'fadeBlack',
                current?.durationMs ?? DEFAULT_TRANSITION_MS,
                'scenes',
              )
          }
        >
          {t('editor.library.transitionScenes', { count: scenes.length })}
        </button>
      )}
      <button
        type="button"
        className={ghostButton}
        data-testid="lib-transition-all"
        onClick={() =>
          useEditorStore
            .getState()
            .applyTransitionToAll(
              current?.kind ?? 'fadeBlack',
              current?.durationMs ?? DEFAULT_TRANSITION_MS,
              'all',
            )
        }
      >
        {t('editor.library.transitionAll', { count: cuts.length })}
      </button>
      <p className="text-[11px] text-muted">{t('editor.library.transitionHint')}</p>
    </div>
  )
}
