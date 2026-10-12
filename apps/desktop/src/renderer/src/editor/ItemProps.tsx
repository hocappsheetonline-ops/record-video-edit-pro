import { useTranslation } from 'react-i18next'
import { Maximize, Minimize, Scissors } from 'lucide-react'
import {
  aspectRatio,
  clipDuration,
  cutPoints,
  DEFAULT_TRANSITION_MS,
  EFFECT_KINDS,
  KEY_COLORS,
  OVERLAY_ANIMATIONS,
  SPEEDS,
  TEXT_STYLES,
  TRANSITION_KINDS,
  type AudioClip,
  type Clip,
  type EditState,
  type EffectRegion,
  type Overlay,
  type ZoomRegion,
} from '@lumora/core'
import { useEditorStore } from './store'
import { ghostButton, pct, secs, Section, Segmented, SliderRow, Toggle } from './ui'

export function ClipProps({ clip, index }: { clip: Clip; index: number }) {
  const { t } = useTranslation()
  const { setClipSpeed, splitAtPlayhead } = useEditorStore.getState()
  return (
    <>
      <Section title={t('editor.props.clipInfo', { n: index + 1 })}>
        <p className="text-xs text-muted">
          {t('editor.props.length')}: {secs(clipDuration(clip))}
        </p>
        <Segmented
          label={t('editor.speed')}
          options={SPEEDS.map((v) => ({ value: v, label: `${v}×` }))}
          value={clip.speed}
          onChange={(v) => setClipSpeed(clip.id, v)}
          testIdPrefix="speed-"
          columns={4}
        />
        <button type="button" className={ghostButton} onClick={() => splitAtPlayhead()}>
          <Scissors size={14} aria-hidden />
          {t('editor.split')} (S)
        </button>
      </Section>
    </>
  )
}

export function ZoomProps({ zoom }: { zoom: ZoomRegion }) {
  const { t } = useTranslation()
  const change = useEditorStore((s) => s.change)
  const setZoom = (patch: Partial<ZoomRegion>, coalesce?: string) =>
    change(
      (e) => ({ ...e, zooms: e.zooms.map((z) => (z.id === zoom.id ? { ...z, ...patch } : z)) }),
      coalesce,
    )
  return (
    <Section testId="zoom-props">
      <SliderRow
        label={t('editor.zoom.scale')}
        value={zoom.scale}
        min={1.2}
        max={4}
        step={0.1}
        format={(v) => `${v.toFixed(1)}×`}
        onChange={(v) => setZoom({ scale: v }, 'zoom-scale')}
        testId="zoom-scale"
      />
      <Segmented
        label={t('editor.zoom.mode')}
        options={(['follow', 'fixed'] as const).map((m) => ({
          value: m,
          label: t(`editor.zoom.modes.${m}`),
        }))}
        value={zoom.mode}
        onChange={(mode) => setZoom({ mode })}
        testIdPrefix="zoom-mode-"
      />
      {zoom.mode === 'fixed' && (
        <>
          <SliderRow
            label={t('editor.zoom.x')}
            value={zoom.x}
            min={0}
            max={1}
            step={0.01}
            format={pct}
            onChange={(v) => setZoom({ x: v }, 'zoom-x')}
          />
          <SliderRow
            label={t('editor.zoom.y')}
            value={zoom.y}
            min={0}
            max={1}
            step={0.01}
            format={pct}
            onChange={(v) => setZoom({ y: v }, 'zoom-y')}
          />
        </>
      )}
    </Section>
  )
}

export function AudioClipProps({ clip }: { clip: AudioClip }) {
  const { t } = useTranslation()
  const { updateAudioClip } = useEditorStore.getState()
  return (
    <Section testId="audio-clip-panel">
      <SliderRow
        label={t('editor.music.volume')}
        value={clip.volume}
        min={0}
        max={2}
        step={0.05}
        format={pct}
        testId="audio-volume"
        onChange={(v) => updateAudioClip(clip.id, { volume: v }, `vol-${clip.id}`)}
      />
      <SliderRow
        label={t('editor.music.fadeIn')}
        value={clip.fadeIn}
        min={0}
        max={5000}
        step={100}
        format={secs}
        testId="audio-fade-in"
        onChange={(v) => updateAudioClip(clip.id, { fadeIn: v }, `fin-${clip.id}`)}
      />
      <SliderRow
        label={t('editor.music.fadeOut')}
        value={clip.fadeOut}
        min={0}
        max={5000}
        step={100}
        format={secs}
        testId="audio-fade-out"
        onChange={(v) => updateAudioClip(clip.id, { fadeOut: v }, `fout-${clip.id}`)}
      />
      <Toggle
        label={t('editor.music.loop')}
        checked={clip.loop}
        testId="audio-loop"
        onChange={(v) => updateAudioClip(clip.id, { loop: v })}
      />
    </Section>
  )
}

/** Ô xem trước nhỏ cho từng kiểu chuyển tiếp (hai màu A → B). */
function TransitionTile({ kind }: { kind: string }) {
  const style: Record<string, string> = {
    none: 'linear-gradient(90deg,#334155 50%,#1e293b 50%)',
    fadeBlack: 'linear-gradient(90deg,#2563eb,#000 50%,#9333ea)',
    fadeWhite: 'linear-gradient(90deg,#2563eb,#fff 50%,#9333ea)',
    flash: 'radial-gradient(circle,#fff 0 25%,#2563eb 60%,#9333ea)',
    zoom: 'radial-gradient(circle,#9333ea 0 30%,#2563eb 31%)',
    blur: 'linear-gradient(90deg,#2563eb,#7c8fd6,#9333ea)',
    slide: 'linear-gradient(90deg,#2563eb 0 40%,#9333ea 40%)',
    glitch: 'repeating-linear-gradient(0deg,#2563eb 0 4px,#ec4899 4px 6px,#9333ea 6px 10px)',
  }
  return <span className="block h-8 w-full rounded" style={{ background: style[kind] }} />
}

export function TransitionProps({ afterClip, edit }: { afterClip: string; edit: EditState }) {
  const { t } = useTranslation()
  const { setTransition, applyTransitionToAll } = useEditorStore.getState()
  const cuts = cutPoints(edit.clips)
  const current = edit.transitions.find((x) => x.afterClip === afterClip)
  const duration = current?.durationMs ?? DEFAULT_TRANSITION_MS
  return (
    <Section
      testId="transition-panel"
      title={t('editor.transition.at', { n: cuts.findIndex((c) => c.afterClip === afterClip) + 1 })}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {(['none', ...TRANSITION_KINDS] as const).map((kind) => {
          const active = kind === 'none' ? !current : current?.kind === kind
          return (
            <button
              key={kind}
              type="button"
              data-testid={`transition-${kind}`}
              aria-pressed={active}
              onClick={() => setTransition(afterClip, kind === 'none' ? null : kind)}
              className={`flex flex-col gap-1 rounded-lg border p-1.5 text-[11px] ${
                active ? 'border-accent bg-accent/10' : 'border-border hover:border-muted'
              }`}
            >
              <TransitionTile kind={kind} />
              <span className="truncate">{t(`editor.transition.kinds.${kind}`)}</span>
            </button>
          )
        })}
      </div>
      {current && (
        <>
          <SliderRow
            label={t('editor.transition.duration')}
            value={duration}
            min={200}
            max={2000}
            step={100}
            format={secs}
            testId="transition-duration"
            onChange={(v) => setTransition(afterClip, current.kind, v)}
          />
          <button
            type="button"
            data-testid="transition-all"
            className={ghostButton}
            onClick={() => applyTransitionToAll(current.kind, duration)}
          >
            {t('editor.transition.applyAll', { count: cuts.length })}
          </button>
        </>
      )}
    </Section>
  )
}

export function EffectProps({ effect }: { effect: EffectRegion }) {
  const { t } = useTranslation()
  const { updateEffect } = useEditorStore.getState()
  return (
    <Section testId="effect-selected">
      <label className="flex flex-col gap-1.5 text-xs">
        <span className="text-muted">{t('editor.effects.kind')}</span>
        <select
          value={effect.kind}
          data-testid="effect-kind"
          onChange={(e) =>
            updateEffect(effect.id, { kind: e.target.value as EffectRegion['kind'] })
          }
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
        >
          {EFFECT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`editor.effects.kinds.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      <SliderRow
        label={t('editor.effects.intensity')}
        value={effect.intensity}
        min={0.05}
        max={1}
        step={0.05}
        format={pct}
        testId="effect-intensity"
        onChange={(v) => updateEffect(effect.id, { intensity: v }, `fx-int-${effect.id}`)}
      />
      <p className="text-xs text-muted">
        {secs(effect.end - effect.start)} · {t('editor.effects.dragHint')}
      </p>
    </Section>
  )
}

export function OverlayProps({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const { updateOverlay } = useEditorStore.getState()
  const edit = useEditorStore((s) => s.edit)
  const videoSize = useEditorStore((s) => s.videoSize)
  const update = (patch: Partial<Overlay>, coalesce?: string) =>
    updateOverlay(overlay.id, patch, coalesce && `${coalesce}-${overlay.id}`)
  const media = overlay.kind === 'image' || overlay.kind === 'video'
  const frameRatio = edit ? aspectRatio(edit.frame.aspect, videoSize) : 16 / 9
  return (
    <>
      {overlay.kind === 'text' && (
        <Section title={t('editor.stickers.text')}>
          <textarea
            rows={3}
            value={overlay.text}
            data-testid="overlay-edit-text"
            onChange={(e) => update({ text: e.target.value }, 'ov-text')}
            className="resize-none rounded-md border border-border bg-surface-2 px-2.5 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <Segmented
            label={t('editor.stickers.style')}
            options={TEXT_STYLES.map((s) => ({
              value: s,
              label: t(`editor.stickers.styles.${s}`),
            }))}
            value={overlay.style}
            onChange={(style) => update({ style })}
            testIdPrefix="overlay-style-"
            columns={4}
          />
          <label className="flex items-center justify-between text-xs">
            <span className="text-muted">{t('editor.stickers.color')}</span>
            <input
              type="color"
              aria-label={t('editor.stickers.color')}
              value={overlay.color}
              onChange={(e) => update({ color: e.target.value }, 'ov-color')}
              className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
          </label>
        </Section>
      )}

      <Section title={t('editor.props.transform')}>
        {overlay.kind === 'video' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="overlay-fill"
              className={ghostButton}
              onClick={() =>
                update({
                  x: 0.5,
                  y: 0.5,
                  rotation: 0,
                  size: Math.max(1, frameRatio / overlay.aspect),
                })
              }
            >
              <Maximize size={13} aria-hidden />
              {t('editor.stickers.fill')}
            </button>
            <button
              type="button"
              data-testid="overlay-fit"
              className={ghostButton}
              onClick={() =>
                update({
                  x: 0.5,
                  y: 0.5,
                  rotation: 0,
                  size: Math.min(1, frameRatio / overlay.aspect),
                })
              }
            >
              <Minimize size={13} aria-hidden />
              {t('editor.stickers.fit')}
            </button>
          </div>
        )}
        <SliderRow
          label={t('editor.stickers.size')}
          value={overlay.size}
          min={0.03}
          max={media ? 2 : 0.8}
          step={0.01}
          format={pct}
          testId="overlay-size"
          onChange={(v) => update({ size: v }, 'ov-size')}
        />
        <SliderRow
          label={t('editor.stickers.rotation')}
          value={overlay.rotation}
          min={-180}
          max={180}
          step={1}
          format={(v) => `${Math.round(v)}°`}
          testId="overlay-rotation"
          onChange={(v) => update({ rotation: v }, 'ov-rot')}
        />
        <Segmented
          label={t('editor.stickers.place')}
          options={(['top', 'center', 'bottom'] as const).map((p) => ({
            value: p,
            label: t(`editor.stickers.positions.${p}`),
          }))}
          value={null}
          onChange={(p) => update({ x: 0.5, y: p === 'top' ? 0.15 : p === 'center' ? 0.5 : 0.85 })}
          testIdPrefix="pos-"
        />
        <p className="text-xs text-muted">{t('editor.stickers.dragHint')}</p>
      </Section>

      {overlay.kind === 'video' && overlay.hasAudio && (
        <Section title={t('editor.props.audio')}>
          <SliderRow
            label={t('editor.music.volume')}
            value={overlay.volume}
            min={0}
            max={2}
            step={0.05}
            format={pct}
            testId="overlay-volume"
            onChange={(v) => update({ volume: v }, 'ov-vol')}
          />
        </Section>
      )}

      {media && (
        <Section title={t('editor.stickers.key')}>
          <div className="grid grid-cols-5 gap-1.5">
            {(['', ...KEY_COLORS] as const).map((color) => (
              <button
                key={color || 'none'}
                type="button"
                data-testid={`key-${color.replace('#', '') || 'none'}`}
                aria-pressed={overlay.keyColor === color}
                title={t(`editor.stickers.keys.${color.replace('#', '') || 'none'}`)}
                onClick={() => update({ keyColor: color })}
                className={`flex h-9 items-center justify-center rounded-md border-2 text-[10px] ${
                  overlay.keyColor === color ? 'border-accent' : 'border-border hover:border-muted'
                }`}
                style={color ? { background: color } : undefined}
              >
                {!color && t('editor.stickers.keys.none')}
              </button>
            ))}
          </div>
          {overlay.keyColor && (
            <SliderRow
              label={t('editor.stickers.keyStrength')}
              value={overlay.keyStrength}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              testId="key-strength"
              onChange={(v) => update({ keyStrength: v }, 'ov-key')}
            />
          )}
          <p className="text-xs text-muted">{t('editor.stickers.keyHint')}</p>
        </Section>
      )}

      <Section title={t('editor.props.animation')}>
        <div className="grid grid-cols-3 gap-1.5">
          {OVERLAY_ANIMATIONS.map((a) => (
            <button
              key={a}
              type="button"
              data-testid={`anim-${a}`}
              aria-pressed={overlay.animation === a}
              onClick={() => update({ animation: a })}
              className={`rounded-md border px-2 py-1.5 text-xs ${
                overlay.animation === a
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              {t(`editor.stickers.animations.${a}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {secs(overlay.end - overlay.start)}
          {overlay.kind === 'video' &&
            ` · ${t('editor.stickers.trimmed', { start: secs(overlay.mediaOffset) })}`}
        </p>
      </Section>
    </>
  )
}
