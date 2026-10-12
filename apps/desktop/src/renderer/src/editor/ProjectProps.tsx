import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Sparkles } from 'lucide-react'
import {
  aspectRatio,
  ASPECTS,
  BACKGROUND_PRESETS,
  BEAUTY_PRESET,
  CAMERA_BG_MODES,
  CAMERA_LAYOUTS,
  placementCorner,
  type Background,
  type EditState,
} from '@lumora/core'
import { AudioFxPanel } from './AudioFxPanel'
import { useEditorStore } from './store'
import { ghostButton, pct, primaryButton, Section, Segmented, SliderRow, Toggle } from './ui'

export const PROJECT_TABS = [
  'frame',
  'camera',
  'cursor',
  'motion',
  'zoom',
  'audio',
  'adjust',
  'markers',
] as const
export type ProjectTab = (typeof PROJECT_TABS)[number]

function useSetters() {
  const change = useEditorStore((s) => s.change)
  const set = <K extends keyof EditState>(
    key: K,
    patch: Partial<EditState[K]>,
    coalesce?: string,
  ) => change((e) => ({ ...e, [key]: { ...(e[key] as object), ...patch } }), coalesce)
  return { change, set }
}

function swatchStyle(bg: Background) {
  return bg.kind === 'solid'
    ? { background: bg.color }
    : { background: `linear-gradient(${bg.angle}deg, ${bg.color}, ${bg.color2})` }
}

export function FrameProps({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { change, set } = useSetters()
  const setBackground = (patch: Partial<Background>, coalesce?: string) =>
    change(
      (e) => ({ ...e, frame: { ...e.frame, background: { ...e.frame.background, ...patch } } }),
      coalesce,
    )
  return (
    <>
      <Section title={t('editor.frame.aspect')}>
        <div className="grid grid-cols-5 gap-1.5">
          {ASPECTS.map((a) => {
            const ratio = a === 'source' ? 16 / 10 : aspectRatio(a, { width: 16, height: 9 })
            const active = edit.frame.aspect === a
            return (
              <button
                key={a}
                type="button"
                data-testid={`aspect-${a}`}
                aria-pressed={active}
                // Khung dọc thì mặc định lấp đầy và tự cắt theo con trỏ (tắt được bên dưới).
                onClick={() => set('frame', { aspect: a, fill: a === '9:16' })}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] ${
                  active
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border text-muted hover:border-muted hover:text-text'
                }`}
              >
                <span className="flex h-6 items-center">
                  <span
                    className={`block rounded-[3px] border-2 ${active ? 'border-accent' : 'border-current'}`}
                    style={
                      ratio >= 1
                        ? { width: 24, height: 24 / ratio }
                        : { width: 24 * ratio, height: 24 }
                    }
                  />
                </span>
                {a === 'source' ? t('editor.frame.source') : a}
              </button>
            )
          })}
        </div>
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
                x: 0,
                y: 0,
              },
            }))
          }
          className={`${primaryButton} w-full`}
        >
          <Sparkles size={15} aria-hidden />
          {t('editor.frame.vertical')}
        </button>
        <p className="text-xs text-muted">{t('editor.frame.verticalHint')}</p>
      </Section>
      <Section>
        <Toggle
          label={t('editor.frame.fill')}
          hint={edit.frame.fill ? t('editor.frame.fillHint') : undefined}
          checked={edit.frame.fill}
          onChange={(v) => set('frame', { fill: v })}
          testId="frame-fill"
        />
      </Section>
      {!edit.frame.fill && (
        <>
          <Section title={t('editor.frame.background')}>
            <div className="grid grid-cols-7 gap-1.5">
              {BACKGROUND_PRESETS.map((bg, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid={`bg-preset-${i}`}
                  aria-label={`${t('editor.frame.background')} ${i + 1}`}
                  onClick={() => set('frame', { background: { ...bg } })}
                  className={`aspect-square rounded-md ring-2 ring-offset-2 ring-offset-surface ${
                    JSON.stringify(bg) === JSON.stringify(edit.frame.background)
                      ? 'ring-accent'
                      : 'ring-transparent hover:ring-border'
                  }`}
                  style={swatchStyle(bg)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Segmented
                options={[
                  { value: 'solid', label: t('editor.frame.solid') },
                  { value: 'gradient', label: t('editor.frame.gradient') },
                ]}
                value={edit.frame.background.kind}
                onChange={(kind) => setBackground({ kind })}
              />
              <input
                type="color"
                aria-label={t('editor.frame.color')}
                value={edit.frame.background.color}
                onChange={(e) => setBackground({ color: e.target.value }, 'bg-color')}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent"
              />
              {edit.frame.background.kind === 'gradient' && (
                <input
                  type="color"
                  aria-label={t('editor.frame.color2')}
                  value={edit.frame.background.color2}
                  onChange={(e) => setBackground({ color2: e.target.value }, 'bg-color2')}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                />
              )}
            </div>
          </Section>
          <Section title={t('editor.frame.style')}>
            <SliderRow
              defaultValue={0.06}
              label={t('editor.frame.padding')}
              value={edit.frame.padding}
              min={0}
              max={0.3}
              step={0.01}
              format={pct}
              onChange={(v) => set('frame', { padding: v }, 'padding')}
              testId="padding"
            />
            <SliderRow
              defaultValue={0.025}
              label={t('editor.frame.radius')}
              value={edit.frame.radius}
              min={0}
              max={0.1}
              step={0.005}
              format={pct}
              onChange={(v) => set('frame', { radius: v }, 'radius')}
            />
            <SliderRow
              defaultValue={0.5}
              label={t('editor.frame.shadow')}
              value={edit.frame.shadow}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set('frame', { shadow: v }, 'shadow')}
            />
          </Section>
        </>
      )}
    </>
  )
}

const PAD_POINTS = [0, 0.5, 1] as const

/**
 * Ô chọn vị trí webcam: hình thu nhỏ của khung video; kéo chấm (hoặc bấm 9 điểm neo) để đặt
 * webcam ở bất kỳ đâu. Kéo trực tiếp trên khung xem trước cũng được.
 */
function PositionPad({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { set } = useSetters()
  const videoSize = useEditorStore((s) => s.videoSize)
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const ratio = aspectRatio(edit.frame.aspect, videoSize)
  const { x, y } = edit.camera
  // Đặt đúng góc thì nhớ cả góc (bố cục cũ / dải webcam dùng tới).
  const place = (px: number, py: number, coalesce?: string) => {
    const corner = placementCorner({ x: px, y: py })
    set('camera', { x: px, y: py, ...(corner ? { position: corner } : {}) }, coalesce)
  }

  const fromPointer = (e: ReactPointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const snap = (v: number) => {
      for (const p of PAD_POINTS) if (Math.abs(v - p) < 0.06) return p
      return v
    }
    place(
      snap(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))),
      snap(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))),
      'cam-pad',
    )
  }

  const w = ratio >= 1 ? 200 : 200 * ratio
  const h = ratio >= 1 ? 200 / ratio : 200
  return (
    <div className="flex flex-col gap-2 text-xs">
      <span className="text-muted">{t('editor.camera.position')}</span>
      <div className="flex justify-center rounded-lg bg-bg/60 p-3">
        <div
          ref={ref}
          data-testid="cam-pad"
          className="relative cursor-crosshair touch-none rounded-md border border-border bg-gradient-to-br from-surface-2 to-bg"
          style={{ width: w, height: h }}
          onPointerDown={(e) => {
            dragging.current = true
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            fromPointer(e)
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          {PAD_POINTS.flatMap((py) =>
            PAD_POINTS.map((px) => (
              <button
                key={`${px}-${py}`}
                type="button"
                data-testid={`cam-pos-${px}-${py}`}
                aria-label={t('editor.camera.anchor', { x: px * 100, y: py * 100 })}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  place(px, py)
                }}
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted/60 hover:border-text"
                style={{ left: `${8 + px * 84}%`, top: `${8 + py * 84}%` }}
              />
            )),
          )}
          <span
            aria-hidden
            data-testid="cam-pad-dot"
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-lg"
            style={{ left: `${8 + x * 84}%`, top: `${8 + y * 84}%` }}
          />
        </div>
      </div>
      <p className="text-muted">{t('editor.camera.dragHint')}</p>
    </div>
  )
}

export function CameraProps({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { set } = useSetters()
  const cam = edit.camera
  return (
    <>
      <Section>
        <Toggle
          label={t('editor.camera.visible')}
          checked={cam.visible}
          onChange={(v) => set('camera', { visible: v })}
          testId="cam-visible"
        />
      </Section>
      {cam.visible && (
        <>
          <Section title={t('editor.camera.layout')}>
            <Segmented
              options={CAMERA_LAYOUTS.map((layout) => ({
                value: layout,
                label: t(`editor.camera.layouts.${layout}`),
              }))}
              value={cam.layout}
              onChange={(layout) => set('camera', { layout })}
              testIdPrefix="cam-layout-"
            />
            {cam.layout === 'stack' ? (
              <>
                <Segmented
                  label={t('editor.camera.position')}
                  options={(['top', 'bottom'] as const).map((side) => ({
                    value: side,
                    label: t(`editor.camera.stackPosition.${side}`),
                  }))}
                  value={cam.position.startsWith('top') ? 'top' : 'bottom'}
                  onChange={(side) =>
                    set('camera', { position: `${side}-left`, y: side === 'top' ? 0 : 1 })
                  }
                  testIdPrefix="cam-stack-"
                />
                <SliderRow
                  defaultValue={0.4}
                  label={t('editor.camera.split')}
                  value={cam.split}
                  min={0.2}
                  max={0.6}
                  step={0.01}
                  format={pct}
                  onChange={(v) => set('camera', { split: v }, 'cam-split')}
                />
              </>
            ) : (
              <>
                <PositionPad edit={edit} />
                <SliderRow
                  defaultValue={0.22}
                  label={t('editor.camera.size')}
                  value={cam.size}
                  min={0.08}
                  max={0.6}
                  step={0.01}
                  format={pct}
                  onChange={(v) => set('camera', { size: v }, 'cam-size')}
                  testId="cam-size"
                />
                <Segmented
                  label={t('editor.camera.shape')}
                  options={(['circle', 'rounded', 'square'] as const).map((shape) => ({
                    value: shape,
                    label: t(`editor.camera.shapes.${shape}`),
                  }))}
                  value={cam.shape}
                  onChange={(shape) => set('camera', { shape })}
                  testIdPrefix="cam-shape-"
                />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SliderRow
                      defaultValue={0}
                      label={t('editor.camera.border')}
                      value={cam.border}
                      min={0}
                      max={1}
                      step={0.05}
                      format={pct}
                      onChange={(v) => set('camera', { border: v }, 'cam-border')}
                      testId="cam-border"
                    />
                  </div>
                  <input
                    type="color"
                    aria-label={t('editor.camera.borderColor')}
                    value={cam.borderColor}
                    onChange={(e) => set('camera', { borderColor: e.target.value }, 'cam-bcolor')}
                    className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                  />
                </div>
              </>
            )}
          </Section>
          <Section
            title={t('editor.camera.framing')}
            action={
              <button
                type="button"
                className="text-muted hover:text-text"
                aria-label={t('editor.camera.resetFraming')}
                data-tooltip={t('editor.camera.resetFraming')}
                onClick={() => set('camera', { zoom: 1, focusX: 0.5, focusY: 0.5 })}
              >
                <RotateCcw size={14} aria-hidden />
              </button>
            }
          >
            <SliderRow
              defaultValue={1}
              label={t('editor.camera.zoom')}
              value={cam.zoom}
              min={1}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => set('camera', { zoom: v }, 'cam-zoom')}
              testId="cam-zoom"
            />
            <SliderRow
              defaultValue={0.5}
              label={t('editor.camera.focusX')}
              value={cam.focusX}
              min={0}
              max={1}
              step={0.01}
              format={pct}
              onChange={(v) => set('camera', { focusX: v }, 'cam-fx')}
              testId="cam-focus-x"
            />
            <SliderRow
              defaultValue={0.5}
              label={t('editor.camera.focusY')}
              value={cam.focusY}
              min={0}
              max={1}
              step={0.01}
              format={pct}
              onChange={(v) => set('camera', { focusY: v }, 'cam-fy')}
              testId="cam-focus-y"
            />
          </Section>
          <Section
            title={t('editor.beauty.title')}
            action={
              <button
                type="button"
                data-testid="beauty-auto"
                className={ghostButton}
                onClick={() => set('camera', { beauty: { ...BEAUTY_PRESET } })}
              >
                <Sparkles size={13} aria-hidden />
                {t('editor.beauty.auto')}
              </button>
            }
          >
            {(['smooth', 'brighten', 'warmth'] as const).map((key) => (
              <SliderRow
                defaultValue={0}
                key={key}
                label={t(`editor.beauty.${key}`)}
                value={cam.beauty[key]}
                min={0}
                max={1}
                step={0.05}
                format={pct}
                testId={`beauty-${key}`}
                onChange={(v) =>
                  set('camera', { beauty: { ...cam.beauty, [key]: v } }, `beauty-${key}`)
                }
              />
            ))}
          </Section>
          <CameraBackgroundSection edit={edit} />
        </>
      )}
    </>
  )
}

/** Trạng thái AI xóa phông (đang nạp / sẵn sàng / máy không chạy được). */
export function AiStatus() {
  const { t } = useTranslation()
  const status = useEditorStore((s) => s.aiStatus)
  if (status === 'idle') return null
  return (
    <p
      className={`text-xs ${status === 'unavailable' ? 'text-danger' : 'text-muted'}`}
      data-testid="ai-status"
      data-status={status}
    >
      {t(`editor.aiBg.status.${status}`)}
    </p>
  )
}

/** Phông nền webcam bằng AI tách người: giữ, xóa, làm mờ, thay màu. */
function CameraBackgroundSection({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { set } = useSetters()
  const bg = edit.camera.background
  const setBg = (patch: Partial<typeof bg>, coalesce?: string) =>
    set('camera', { background: { ...bg, ...patch } }, coalesce)
  return (
    <Section title={t('editor.aiBg.title')} testId="cam-bg">
      <Segmented
        label={t('editor.aiBg.mode')}
        options={CAMERA_BG_MODES.map((m) => ({ value: m, label: t(`editor.aiBg.modes.${m}`) }))}
        value={bg.mode}
        onChange={(mode) => setBg({ mode })}
        testIdPrefix="cam-bg-mode-"
        columns={4}
      />
      {bg.mode === 'color' && (
        <label className="flex items-center justify-between text-xs">
          <span className="text-muted">{t('editor.aiBg.color')}</span>
          <input
            type="color"
            data-testid="cam-bg-color-input"
            aria-label={t('editor.aiBg.color')}
            value={bg.color}
            onChange={(e) => setBg({ color: e.target.value }, 'cam-bg-color')}
            className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
          />
        </label>
      )}
      {bg.mode === 'blur' && (
        <SliderRow
          label={t('editor.aiBg.blur')}
          value={bg.blur}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          defaultValue={0.5}
          testId="cam-bg-blur"
          onChange={(blur) => setBg({ blur }, 'cam-bg-blur')}
        />
      )}
      {bg.mode !== 'none' && (
        <SliderRow
          label={t('editor.aiBg.edge')}
          value={bg.edge}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          defaultValue={0.3}
          testId="cam-bg-edge"
          onChange={(edge) => setBg({ edge }, 'cam-bg-edge')}
        />
      )}
      {bg.mode !== 'none' && <AiStatus />}
      <p className="text-xs text-muted">{t('editor.aiBg.hint')}</p>
    </Section>
  )
}

export function CursorProps({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { set } = useSetters()
  return (
    <Section>
      <Toggle
        label={t('editor.cursor.visible')}
        checked={edit.cursor.visible}
        onChange={(v) => set('cursor', { visible: v })}
        testId="cursor-visible"
      />
      <SliderRow
        defaultValue={1.4}
        label={t('editor.cursor.size')}
        value={edit.cursor.size}
        min={0.5}
        max={4}
        step={0.1}
        format={(v) => `${v.toFixed(1)}×`}
        onChange={(v) => set('cursor', { size: v }, 'cursor-size')}
      />
      <Toggle
        label={t('editor.cursor.clickEffect')}
        checked={edit.cursor.clickEffect}
        onChange={(v) => set('cursor', { clickEffect: v })}
      />
      <Toggle
        label={t('editor.cursor.hideIdle')}
        checked={edit.cursor.hideIdle}
        onChange={(v) => set('cursor', { hideIdle: v })}
      />
    </Section>
  )
}

export function MotionProps({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { change, set } = useSetters()
  return (
    <Section
      action={
        <button
          type="button"
          className="ml-auto text-xs text-accent hover:underline"
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
      }
    >
      <p className="text-xs text-muted">{t('editor.motion.hint')}</p>
      <SliderRow
        defaultValue={0.4}
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
      <SliderRow
        defaultValue={0.85}
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
      <SliderRow
        defaultValue={800}
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
    </Section>
  )
}

export function ZoomProjectProps({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  return (
    <Section>
      <p className="text-sm" data-testid="zoom-count">
        {t('editor.zoom.count', { count: edit.zooms.length })}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="zoom-auto"
          onClick={() => useEditorStore.getState().regenerateZooms()}
          className={ghostButton}
        >
          {t('editor.zoom.auto')}
        </button>
        <button
          type="button"
          data-testid="zoom-add"
          onClick={() => useEditorStore.getState().addZoomAtPlayhead()}
          className={ghostButton}
        >
          {t('editor.zoom.add')}
        </button>
      </div>
      <p className="text-xs text-muted">{t('editor.zoom.hint')}</p>
    </Section>
  )
}

export function AudioMixProps({ edit }: { edit: EditState }) {
  const { t } = useTranslation()
  const { set } = useSetters()
  const project = useEditorStore((s) => s.project)
  const firstFile = (kind: 'mic' | 'system') =>
    project?.segments.find((seg) => seg.tracks[kind])?.tracks[kind]?.file ?? null
  const micFile = firstFile('mic')
  const systemFile = firstFile('system')
  return (
    <>
      <Section title={t('editor.audio.mic')}>
        <SliderRow
          defaultValue={1}
          label={t('editor.music.volume')}
          value={edit.audio.mic}
          min={0}
          max={2}
          step={0.05}
          format={pct}
          onChange={(v) => set('audio', { mic: v }, 'mic')}
          testId="audio-mic"
        />
        {micFile ? (
          <AudioFxPanel
            file={micFile}
            fx={edit.audio.micFx}
            onChange={(micFx) => set('audio', { micFx })}
            testIdPrefix="mic-fx-"
          />
        ) : (
          <p className="text-xs text-muted">{t('editor.audio.noTrack')}</p>
        )}
      </Section>
      <Section title={t('editor.audio.system')}>
        <SliderRow
          defaultValue={1}
          label={t('editor.music.volume')}
          value={edit.audio.system}
          min={0}
          max={2}
          step={0.05}
          format={pct}
          onChange={(v) => set('audio', { system: v }, 'system')}
          testId="audio-system"
        />
        {systemFile ? (
          <AudioFxPanel
            file={systemFile}
            fx={edit.audio.systemFx}
            onChange={(systemFx) => set('audio', { systemFx })}
            testIdPrefix="system-fx-"
          />
        ) : (
          <p className="text-xs text-muted">{t('editor.audio.noTrack')}</p>
        )}
      </Section>
      <Section>
        <p className="text-xs text-muted">{t('editor.audio.hint')}</p>
      </Section>
    </>
  )
}
