import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Diamond,
  FlipHorizontal2,
  FlipVertical2,
  Heart,
  RectangleHorizontal,
  SeparatorHorizontal,
  Slash,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  ANIM_IN,
  ANIM_LOOP,
  ANIM_OUT,
  BLEND_MODES,
  DEFAULT_MASK,
  EASES,
  keyframeAt,
  MASK_SHAPES,
  type MaskShape,
  type Overlay,
  type OverlayAnim,
  type OverlayMask,
} from '@lumora/core'
import { useEditorStore } from './store'
import { pct, Section, Segmented, SliderRow, Toggle } from './ui'

const chip = (active: boolean) =>
  `truncate rounded-md border px-1.5 py-1.5 text-[11px] ${
    active ? 'border-accent bg-accent/10 text-text' : 'border-border text-muted hover:text-text'
  }`

/** Hoạt ảnh kiểu CapCut: ba hàng Vào · Ra · Lặp, mỗi hàng có thời lượng riêng. */
export function AnimSection({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const { updateOverlay } = useEditorStore.getState()
  const set = (patch: Partial<OverlayAnim>, coalesce?: string) =>
    updateOverlay(
      overlay.id,
      { anim: { ...overlay.anim, ...patch } },
      coalesce && `${coalesce}-${overlay.id}`,
    )
  const length = overlay.end - overlay.start
  const row = <K extends 'in' | 'out' | 'loop'>(
    key: K,
    kinds: readonly OverlayAnim[K][],
    msKey: 'inMs' | 'outMs' | 'loopMs',
  ) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{t(`editor.anim.${key}`)}</span>
      <div className="grid grid-cols-4 gap-1">
        {kinds
          .filter((k) => k !== 'typewriter' || overlay.kind === 'text')
          .map((k) => (
            <button
              key={k}
              type="button"
              data-testid={`anim-${key}-${k}`}
              aria-pressed={overlay.anim[key] === k}
              onClick={() => set({ [key]: k } as Partial<OverlayAnim>)}
              className={chip(overlay.anim[key] === k)}
            >
              {t(`editor.anim.kinds.${k}`)}
            </button>
          ))}
      </div>
      {overlay.anim[key] !== 'none' && (
        <SliderRow
          label={t(key === 'loop' ? 'editor.anim.period' : 'editor.anim.duration')}
          value={overlay.anim[msKey] / 1000}
          min={0.1}
          max={key === 'loop' ? 5 : Math.max(0.2, Math.min(5, length / 1000))}
          step={0.05}
          format={(v) => `${v.toFixed(2)}s`}
          testId={`anim-${key}-ms`}
          onChange={(v) => set({ [msKey]: Math.round(v * 1000) }, `anim-${key}-ms`)}
        />
      )}
    </div>
  )
  return (
    <Section title={t('editor.props.animation')} testId="anim-panel">
      {row('in', ANIM_IN, 'inMs')}
      {row('out', ANIM_OUT, 'outMs')}
      {row('loop', ANIM_LOOP, 'loopMs')}
    </Section>
  )
}

/** Độ mờ (theo keyframe nếu có), chế độ hòa trộn, lật. */
export function BlendSection({ overlay, opacity }: { overlay: Overlay; opacity: number }) {
  const { t } = useTranslation()
  const { updateOverlay, updateOverlayPose } = useEditorStore.getState()
  const flip = (key: 'flipH' | 'flipV', Icon: LucideIcon) => (
    <button
      type="button"
      data-testid={`overlay-${key === 'flipH' ? 'flip-h' : 'flip-v'}`}
      aria-pressed={!!overlay[key]}
      aria-label={t(`editor.transform.${key}`)}
      data-tooltip={t(`editor.transform.${key}`)}
      onClick={() => updateOverlay(overlay.id, { [key]: overlay[key] ? undefined : true })}
      className={`flex h-9 flex-1 items-center justify-center rounded-md border ${
        overlay[key]
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border text-muted hover:text-text'
      }`}
    >
      <Icon size={17} strokeWidth={1.75} aria-hidden />
    </button>
  )
  return (
    <Section title={t('editor.blend.title')} testId="blend-panel">
      <SliderRow
        label={t('editor.blend.opacity')}
        value={opacity}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        defaultValue={1}
        testId="overlay-opacity"
        onChange={(v) => updateOverlayPose(overlay.id, { opacity: v }, `ov-opacity-${overlay.id}`)}
      />
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{t('editor.blend.mode')}</span>
        <select
          data-testid="overlay-blend"
          value={overlay.blend ?? 'normal'}
          onChange={(e) =>
            updateOverlay(overlay.id, {
              blend:
                e.target.value === 'normal'
                  ? undefined
                  : (e.target.value as (typeof BLEND_MODES)[number]),
            })
          }
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        >
          {BLEND_MODES.map((b) => (
            <option key={b} value={b}>
              {t(`editor.blend.modes.${b}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-1.5">
        {flip('flipH', FlipHorizontal2)}
        {flip('flipV', FlipVertical2)}
      </div>
    </Section>
  )
}

/** Keyframe: thêm / bỏ tại đầu phát, nhảy giữa các keyframe, kiểu chuyển, xóa hết. */
export function KeyframeSection({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const time = useEditorStore((s) => s.time)
  const { toggleKeyframe, clearKeyframes, setTime, updateOverlay } = useEditorStore.getState()
  const local = time - overlay.start
  const list = overlay.keyframes ?? []
  const here = keyframeAt(list, local)
  const inside = time >= overlay.start && time <= overlay.end
  const prev = [...list].reverse().find((k) => k.t < local - 40)
  const next = list.find((k) => k.t > local + 40)
  const nav = (testId: string, label: string, Icon: LucideIcon, target: number | undefined) => (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      data-tooltip={label}
      disabled={target === undefined}
      onClick={() => target !== undefined && setTime(overlay.start + target)}
      className="flex size-8 items-center justify-center rounded-md border border-border text-muted hover:text-text disabled:opacity-40"
    >
      <Icon size={15} aria-hidden />
    </button>
  )
  return (
    <Section title={t('editor.keyframe.title')} testId="keyframe-panel">
      <div className="flex items-center gap-1.5">
        {nav('overlay-kf-prev', t('editor.keyframe.prev'), ChevronLeft, prev?.t)}
        <button
          type="button"
          data-testid="overlay-keyframe"
          aria-pressed={!!here}
          disabled={!inside}
          onClick={() => toggleKeyframe(overlay.id)}
          className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs disabled:opacity-40 ${
            here
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border text-muted hover:text-text'
          }`}
        >
          <Diamond size={14} aria-hidden fill={here ? 'currentColor' : 'none'} />
          {here ? t('editor.keyframe.remove') : t('editor.keyframe.add')}
        </button>
        {nav('overlay-kf-next', t('editor.keyframe.next'), ChevronRight, next?.t)}
      </div>
      <p className="text-xs text-muted" data-testid="keyframe-count">
        {list.length === 0
          ? t('editor.keyframe.hint')
          : t('editor.keyframe.count', { n: list.length })}
      </p>
      {here && (
        <Segmented
          label={t('editor.keyframe.ease')}
          options={EASES.map((e) => ({ value: e, label: t(`editor.keyframe.eases.${e}`) }))}
          value={here.ease}
          onChange={(ease) =>
            updateOverlay(overlay.id, {
              keyframes: list.map((k) => (k.id === here.id ? { ...k, ease } : k)),
            })
          }
          testIdPrefix="kf-ease-"
          columns={4}
        />
      )}
      {list.length > 0 && (
        <button
          type="button"
          data-testid="overlay-kf-clear"
          onClick={() => clearKeyframes(overlay.id)}
          className="flex items-center gap-1.5 self-start rounded px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
        >
          <Trash2 size={13} aria-hidden />
          {t('editor.keyframe.clear')}
        </button>
      )}
    </Section>
  )
}

const MASK_ICONS: Record<MaskShape, LucideIcon> = {
  none: X,
  circle: Circle,
  rect: RectangleHorizontal,
  heart: Heart,
  star: Star,
  linear: Slash,
  mirror: SeparatorHorizontal,
}

/** Mặt nạ hình cho ảnh / video: hình, vị trí, cỡ, góc, viền mềm, đảo ngược. */
export function MaskSection({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const { updateOverlay } = useEditorStore.getState()
  const mask = overlay.mask
  const set = (patch: Partial<OverlayMask>, coalesce?: string) =>
    updateOverlay(
      overlay.id,
      { mask: { ...(mask ?? DEFAULT_MASK), ...patch } },
      coalesce && `${coalesce}-${overlay.id}`,
    )
  const slider = (
    key: 'x' | 'y' | 'scale' | 'rotation' | 'feather',
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    defaultValue: number,
  ) =>
    mask && (
      <SliderRow
        label={t(`editor.mask.${key}`)}
        value={mask[key]}
        min={min}
        max={max}
        step={step}
        format={format}
        defaultValue={defaultValue}
        testId={`mask-${key}`}
        onChange={(v) => set({ [key]: v }, `mask-${key}`)}
      />
    )
  return (
    <Section title={t('editor.mask.title')} testId="mask-panel">
      <div className="grid grid-cols-7 gap-1">
        {MASK_SHAPES.map((shape) => {
          const Icon = MASK_ICONS[shape]
          const active = (mask?.shape ?? 'none') === shape
          return (
            <button
              key={shape}
              type="button"
              data-testid={`mask-${shape}`}
              aria-pressed={active}
              aria-label={t(`editor.mask.shapes.${shape}`)}
              data-tooltip={t(`editor.mask.shapes.${shape}`)}
              onClick={() =>
                updateOverlay(overlay.id, {
                  mask: shape === 'none' ? undefined : { ...(mask ?? DEFAULT_MASK), shape },
                })
              }
              className={`flex h-8 items-center justify-center rounded-md border ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              <Icon size={15} strokeWidth={1.75} aria-hidden />
            </button>
          )
        })}
      </div>
      {mask && (
        <>
          {mask.shape !== 'linear' && slider('scale', 0.1, 2, 0.01, pct, DEFAULT_MASK.scale)}
          {slider('feather', 0, 1, 0.01, pct, DEFAULT_MASK.feather)}
          {slider('rotation', -180, 180, 1, (v) => `${Math.round(v)}°`, 0)}
          {slider('x', -0.5, 0.5, 0.01, pct, 0)}
          {slider('y', -0.5, 0.5, 0.01, pct, 0)}
          <Toggle
            label={t('editor.mask.invert')}
            checked={mask.invert}
            onChange={(invert) => set({ invert })}
            testId="mask-invert"
          />
        </>
      )}
    </Section>
  )
}
