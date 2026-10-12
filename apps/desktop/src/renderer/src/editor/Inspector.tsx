import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ASPECTS, BACKGROUND_PRESETS, CORNERS, type Background, type EditState } from '@lumora/core'
import { AiPanel } from './AiPanel'
import { CaptionsPanel } from './CaptionsPanel'
import { ExportPanel } from './ExportPanel'
import { useEditorStore } from './store'

const TABS = ['frame', 'cursor', 'zoom', 'camera', 'audio', 'captions', 'ai', 'export'] as const
type Tab = (typeof TABS)[number]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  testId?: string
}) {
  return (
    <Row label={`${props.label}: ${props.format ? props.format(props.value) : props.value}`}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        data-testid={props.testId}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="accent-accent"
      />
    </Row>
  )
}

function Check({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  testId?: string
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
      {label}
    </label>
  )
}

const segmented = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-text'}`
const pct = (v: number) => `${Math.round(v * 100)}%`

function swatchStyle(bg: Background) {
  return bg.kind === 'solid'
    ? { background: bg.color }
    : { background: `linear-gradient(${bg.angle}deg, ${bg.color}, ${bg.color2})` }
}

export function Inspector() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('frame')
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  const change = useEditorStore((s) => s.change)
  if (!edit) return null

  const set = <K extends keyof EditState>(
    key: K,
    patch: Partial<EditState[K]>,
    coalesce?: string,
  ) => change((e) => ({ ...e, [key]: { ...(e[key] as object), ...patch } }), coalesce)
  const setBackground = (patch: Partial<Background>, coalesce?: string) =>
    change(
      (e) => ({ ...e, frame: { ...e.frame, background: { ...e.frame.background, ...patch } } }),
      coalesce,
    )
  const zoom =
    selection?.kind === 'zoom' ? edit.zooms.find((z) => z.id === selection.id) : undefined
  const setZoom = (patch: Partial<NonNullable<typeof zoom>>, coalesce?: string) =>
    zoom &&
    change(
      (e) => ({ ...e, zooms: e.zooms.map((z) => (z.id === zoom.id ? { ...z, ...patch } : z)) }),
      coalesce,
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-border p-2" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            data-testid={`tab-${name}`}
            onClick={() => setTab(name)}
            className={segmented(tab === name)}
          >
            {t(`editor.tabs.${name}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {tab === 'frame' && (
          <>
            <Row label={t('editor.frame.aspect')}>
              <div className="flex flex-wrap gap-1">
                {ASPECTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    data-testid={`aspect-${a}`}
                    onClick={() => set('frame', { aspect: a })}
                    className={segmented(edit.frame.aspect === a)}
                  >
                    {a === 'source' ? t('editor.frame.source') : a}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t('editor.frame.background')}>
              <div className="flex flex-wrap gap-2">
                {BACKGROUND_PRESETS.map((bg, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid={`bg-preset-${i}`}
                    aria-label={`${t('editor.frame.background')} ${i + 1}`}
                    onClick={() => set('frame', { background: { ...bg } })}
                    className={`size-8 rounded-lg border-2 ${JSON.stringify(bg) === JSON.stringify(edit.frame.background) ? 'border-accent' : 'border-transparent'}`}
                    style={swatchStyle(bg)}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={edit.frame.background.kind}
                  onChange={(e) => setBackground({ kind: e.target.value as Background['kind'] })}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                >
                  <option value="solid">{t('editor.frame.solid')}</option>
                  <option value="gradient">{t('editor.frame.gradient')}</option>
                </select>
                <input
                  type="color"
                  aria-label={t('editor.frame.color')}
                  value={edit.frame.background.color}
                  onChange={(e) => setBackground({ color: e.target.value }, 'bg-color')}
                />
                {edit.frame.background.kind === 'gradient' && (
                  <input
                    type="color"
                    aria-label={t('editor.frame.color2')}
                    value={edit.frame.background.color2}
                    onChange={(e) => setBackground({ color2: e.target.value }, 'bg-color2')}
                  />
                )}
              </div>
            </Row>
            <Slider
              label={t('editor.frame.padding')}
              value={edit.frame.padding}
              min={0}
              max={0.3}
              step={0.01}
              format={pct}
              onChange={(v) => set('frame', { padding: v }, 'padding')}
              testId="padding"
            />
            <Slider
              label={t('editor.frame.radius')}
              value={edit.frame.radius}
              min={0}
              max={0.1}
              step={0.005}
              format={pct}
              onChange={(v) => set('frame', { radius: v }, 'radius')}
            />
            <Slider
              label={t('editor.frame.shadow')}
              value={edit.frame.shadow}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set('frame', { shadow: v }, 'shadow')}
            />
          </>
        )}

        {tab === 'cursor' && (
          <>
            <Check
              label={t('editor.cursor.visible')}
              checked={edit.cursor.visible}
              onChange={(v) => set('cursor', { visible: v })}
              testId="cursor-visible"
            />
            <Slider
              label={t('editor.cursor.size')}
              value={edit.cursor.size}
              min={0.5}
              max={4}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(v) => set('cursor', { size: v }, 'cursor-size')}
            />
            <Slider
              label={t('editor.cursor.smoothing')}
              value={edit.cursor.smoothing}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set('cursor', { smoothing: v }, 'cursor-smooth')}
            />
            <Check
              label={t('editor.cursor.clickEffect')}
              checked={edit.cursor.clickEffect}
              onChange={(v) => set('cursor', { clickEffect: v })}
            />
            <Check
              label={t('editor.cursor.hideIdle')}
              checked={edit.cursor.hideIdle}
              onChange={(v) => set('cursor', { hideIdle: v })}
            />
          </>
        )}

        {tab === 'zoom' && (
          <>
            <p className="text-sm text-muted" data-testid="zoom-count">
              {t('editor.zoom.count', { count: edit.zooms.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="zoom-auto"
                onClick={() => useEditorStore.getState().regenerateZooms()}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                {t('editor.zoom.auto')}
              </button>
              <button
                type="button"
                data-testid="zoom-add"
                onClick={() => useEditorStore.getState().addZoomAtPlayhead()}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                {t('editor.zoom.add')}
              </button>
            </div>
            {zoom ? (
              <div
                className="flex flex-col gap-4 rounded-lg border border-border p-3"
                data-testid="zoom-props"
              >
                <Slider
                  label={t('editor.zoom.scale')}
                  value={zoom.scale}
                  min={1.2}
                  max={4}
                  step={0.1}
                  format={(v) => `${v.toFixed(1)}×`}
                  onChange={(v) => setZoom({ scale: v }, 'zoom-scale')}
                />
                <Row label={t('editor.zoom.mode')}>
                  <div className="flex gap-1">
                    {(['follow', 'fixed'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setZoom({ mode: m })}
                        className={segmented(zoom.mode === m)}
                      >
                        {t(`editor.zoom.modes.${m}`)}
                      </button>
                    ))}
                  </div>
                </Row>
                {zoom.mode === 'fixed' && (
                  <>
                    <Slider
                      label={t('editor.zoom.x')}
                      value={zoom.x}
                      min={0}
                      max={1}
                      step={0.01}
                      format={pct}
                      onChange={(v) => setZoom({ x: v }, 'zoom-x')}
                    />
                    <Slider
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
                <button
                  type="button"
                  onClick={() => useEditorStore.getState().deleteSelection()}
                  className="self-start text-sm text-danger hover:underline"
                >
                  {t('editor.zoom.delete')}
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">{t('editor.zoom.hint')}</p>
            )}
          </>
        )}

        {tab === 'camera' && (
          <>
            <Check
              label={t('editor.camera.visible')}
              checked={edit.camera.visible}
              onChange={(v) => set('camera', { visible: v })}
            />
            <Row label={t('editor.camera.shape')}>
              <div className="flex gap-1">
                {(['circle', 'rounded', 'square'] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => set('camera', { shape })}
                    className={segmented(edit.camera.shape === shape)}
                  >
                    {t(`editor.camera.shapes.${shape}`)}
                  </button>
                ))}
              </div>
            </Row>
            <Slider
              label={t('editor.camera.size')}
              value={edit.camera.size}
              min={0.08}
              max={0.5}
              step={0.01}
              format={pct}
              onChange={(v) => set('camera', { size: v }, 'cam-size')}
            />
            <Row label={t('editor.camera.position')}>
              <div className="grid grid-cols-2 gap-1">
                {CORNERS.map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    onClick={() => set('camera', { position: corner })}
                    className={segmented(edit.camera.position === corner)}
                  >
                    {t(`editor.camera.corners.${corner}`)}
                  </button>
                ))}
              </div>
            </Row>
          </>
        )}

        {tab === 'audio' && (
          <>
            <Slider
              label={t('editor.audio.mic')}
              value={edit.audio.mic}
              min={0}
              max={2}
              step={0.05}
              format={pct}
              onChange={(v) => set('audio', { mic: v }, 'mic')}
            />
            <Slider
              label={t('editor.audio.system')}
              value={edit.audio.system}
              min={0}
              max={2}
              step={0.05}
              format={pct}
              onChange={(v) => set('audio', { system: v }, 'system')}
            />
          </>
        )}

        {tab === 'captions' && <CaptionsPanel />}
        {tab === 'ai' && <AiPanel />}
        {tab === 'export' && <ExportPanel />}
      </div>
    </div>
  )
}
