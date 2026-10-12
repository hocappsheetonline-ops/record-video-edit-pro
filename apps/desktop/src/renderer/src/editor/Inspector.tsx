import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ASPECTS,
  BACKGROUND_PRESETS,
  CAMERA_LAYOUTS,
  CORNERS,
  type Background,
  type EditState,
} from '@lumora/core'
import { AiPanel } from './AiPanel'
import { CaptionsPanel } from './CaptionsPanel'
import { ExportPanel } from './ExportPanel'
import { useEditorStore } from './store'

const TABS = [
  'frame',
  'cursor',
  'motion',
  'zoom',
  'camera',
  'audio',
  'captions',
  'ai',
  'export',
] as const
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
  /** Chữ ở hai đầu thanh trượt, ví dụ "Chậm" — "Nhanh". */
  ends?: [string, string]
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
      {props.ends && (
        <span className="flex justify-between text-xs text-muted">
          <span>{props.ends[0]}</span>
          <span>{props.ends[1]}</span>
        </span>
      )}
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
            <div className="flex flex-col gap-1.5 rounded-lg border border-accent/40 bg-accent/5 p-3">
              <button
                type="button"
                data-testid="preset-vertical"
                onClick={() =>
                  change((e) => ({
                    ...e,
                    frame: { ...e.frame, aspect: '9:16', fill: true },
                    camera: {
                      ...e.camera,
                      visible: true,
                      layout: 'bubble',
                      shape: 'circle',
                      size: Math.max(e.camera.size, 0.32),
                      position: 'top-left',
                    },
                  }))
                }
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
              >
                {t('editor.frame.vertical')}
              </button>
              <p className="text-xs text-muted">{t('editor.frame.verticalHint')}</p>
            </div>
            <Row label={t('editor.frame.aspect')}>
              <div className="flex flex-wrap gap-1">
                {ASPECTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    data-testid={`aspect-${a}`}
                    // Khung dọc thì mặc định lấp đầy và tự cắt theo con trỏ (tắt được bên dưới).
                    onClick={() => set('frame', { aspect: a, fill: a === '9:16' })}
                    className={segmented(edit.frame.aspect === a)}
                  >
                    {a === 'source' ? t('editor.frame.source') : a}
                  </button>
                ))}
              </div>
            </Row>
            <Check
              label={t('editor.frame.fill')}
              checked={edit.frame.fill}
              onChange={(v) => set('frame', { fill: v })}
              testId="frame-fill"
            />
            {edit.frame.fill && <p className="text-xs text-muted">{t('editor.frame.fillHint')}</p>}
            {!edit.frame.fill && (
              <>
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
                      onChange={(e) =>
                        setBackground({ kind: e.target.value as Background['kind'] })
                      }
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

        {tab === 'motion' && (
          <>
            <p className="text-xs text-muted">{t('editor.motion.hint')}</p>
            <Slider
              label={t('editor.motion.cursor')}
              // Lưu dưới dạng độ mượt (cao = chậm); hiển thị dạng tốc độ cho dễ hiểu.
              value={Math.round((1 - edit.cursor.smoothing) * 100) / 100}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              ends={[t('editor.motion.slow'), t('editor.motion.fast')]}
              onChange={(v) => set('cursor', { smoothing: 1 - v }, 'cursor-speed')}
              testId="motion-cursor"
            />
            <Slider
              label={t('editor.motion.camera')}
              value={edit.motion.cameraSpeed}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              ends={[t('editor.motion.slow'), t('editor.motion.fast')]}
              onChange={(v) => set('motion', { cameraSpeed: v }, 'camera-speed')}
              testId="motion-camera"
            />
            <Slider
              label={t('editor.motion.zoom')}
              value={1500 - edit.motion.zoomTransitionMs}
              min={0}
              max={1250}
              step={50}
              format={(v) => t('editor.motion.seconds', { value: ((1500 - v) / 1000).toFixed(2) })}
              ends={[t('editor.motion.slow'), t('editor.motion.fast')]}
              onChange={(v) => set('motion', { zoomTransitionMs: 1500 - v }, 'zoom-speed')}
              testId="motion-zoom"
            />
            <button
              type="button"
              className="self-start text-xs text-accent hover:underline"
              onClick={() =>
                change((e) => ({
                  ...e,
                  cursor: { ...e.cursor, smoothing: 0.6 },
                  motion: { cameraSpeed: 0.85, zoomTransitionMs: 700 },
                }))
              }
            >
              {t('editor.motion.reset')}
            </button>
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
            <Row label={t('editor.camera.layout')}>
              <div className="flex gap-1">
                {CAMERA_LAYOUTS.map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    data-testid={`cam-layout-${layout}`}
                    onClick={() => set('camera', { layout })}
                    className={segmented(edit.camera.layout === layout)}
                  >
                    {t(`editor.camera.layouts.${layout}`)}
                  </button>
                ))}
              </div>
            </Row>
            {edit.camera.layout === 'stack' ? (
              <>
                <Slider
                  label={t('editor.camera.split')}
                  value={edit.camera.split}
                  min={0.2}
                  max={0.6}
                  step={0.01}
                  format={pct}
                  onChange={(v) => set('camera', { split: v }, 'cam-split')}
                />
                <Row label={t('editor.camera.position')}>
                  <div className="flex gap-1">
                    {(['top', 'bottom'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        data-testid={`cam-stack-${side}`}
                        onClick={() => set('camera', { position: `${side}-left` })}
                        className={segmented(edit.camera.position.startsWith(side))}
                      >
                        {t(`editor.camera.stackPosition.${side}`)}
                      </button>
                    ))}
                  </div>
                </Row>
              </>
            ) : (
              <>
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
