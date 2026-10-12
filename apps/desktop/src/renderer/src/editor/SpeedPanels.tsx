import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Rewind, TriangleAlert } from 'lucide-react'
import {
  canReverse,
  clipDuration,
  MAX_CURVE_SPEED,
  MIN_CURVE_SPEED,
  normalizeCurve,
  presetCurve,
  SPEED_CURVE_PRESETS,
  SPEEDS,
  type Clip,
  type CurvePoint,
  type SpeedCurve,
} from '@lumora/core'
import { revKeyOf, useEditorStore } from './store'
import { pct, secs, Section, Segmented, SliderRow, Toggle } from './ui'

const W = 240
const H = 120
const LOG_MIN = Math.log10(MIN_CURVE_SPEED)
const LOG_MAX = Math.log10(MAX_CURVE_SPEED)
/** Tốc độ → toạ độ dọc (thang log: 0.1× ở đáy, 10× ở đỉnh, 1× ở giữa). */
const yOf = (v: number) => H * (1 - (Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN))
const vOf = (y: number) =>
  Math.min(
    MAX_CURVE_SPEED,
    Math.max(MIN_CURVE_SPEED, 10 ** (LOG_MIN + (1 - y / H) * (LOG_MAX - LOG_MIN))),
  )
const round2 = (v: number) => Math.round(v * 100) / 100

/** Đồ thị đường cong tốc độ: kéo điểm (hoặc dùng phím mũi tên khi điểm đang chọn). */
function CurveEditor({
  curve,
  onChange,
}: {
  curve: SpeedCurve
  onChange: (c: SpeedCurve) => void
}) {
  const { t } = useTranslation()
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const pts = curve.points
  const setPoint = (i: number, p: Partial<CurvePoint>) => {
    const points = pts.map((q, j) => (j === i ? { ...q, ...p } : q))
    onChange(normalizeCurve({ preset: 'custom', points }))
  }
  const move = (e: ReactPointerEvent) => {
    if (drag === null || !svg.current) return
    const r = svg.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * W
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * H
    const first = drag === 0
    const last = drag === pts.length - 1
    // Điểm đầu / cuối chỉ đổi tốc độ; điểm giữa đi được ngang trong khoảng hai điểm bên cạnh.
    const lo = first ? 0 : pts[drag - 1]!.u + 0.02
    const hi = last ? 1 : pts[drag + 1]!.u - 0.02
    const u = first ? 0 : last ? 1 : Math.min(hi, Math.max(lo, x / W))
    setPoint(drag, { u: round2(u), v: round2(vOf(Math.min(H, Math.max(0, y)))) })
  }
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.u * W} ${yOf(p.v)}`).join(' ')
  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="h-32 w-full touch-none rounded-md bg-surface-2"
      data-testid="curve-editor"
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      {[0.1, 1, 10].map((v) => (
        <g key={v}>
          <line x1={0} x2={W} y1={yOf(v)} y2={yOf(v)} stroke="currentColor" strokeOpacity={0.15} />
          <text
            x={4}
            y={Math.min(H - 3, Math.max(10, yOf(v) - 3))}
            fontSize={9}
            fill="currentColor"
            opacity={0.5}
          >
            {v}×
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle
          key={i}
          role="slider"
          tabIndex={0}
          aria-label={t('editor.curve.point', { n: i + 1 })}
          aria-valuenow={p.v}
          aria-valuemin={MIN_CURVE_SPEED}
          aria-valuemax={MAX_CURVE_SPEED}
          data-testid={`curve-point-${i}`}
          cx={p.u * W}
          cy={yOf(p.v)}
          r={6}
          className="cursor-ns-resize fill-white stroke-black/40 focus:outline-none focus-visible:fill-accent"
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            setDrag(i)
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1.25 : 1.1
            if (e.key === 'ArrowUp') setPoint(i, { v: round2(p.v * step) })
            else if (e.key === 'ArrowDown') setPoint(i, { v: round2(p.v / step) })
            else return
            e.preventDefault()
          }}
        />
      ))}
    </svg>
  )
}

/** Tab Tốc độ của clip: tốc độ cố định hoặc đường cong (mẫu có sẵn + đồ thị chỉnh tay). */
export function SpeedSection({ clip }: { clip: Clip }) {
  const { t } = useTranslation()
  const { setClipSpeed, setSpeedCurve } = useEditorStore.getState()
  const mode = clip.speedCurve ? 'curve' : 'fixed'
  return (
    <Section testId="clip-speed">
      <Segmented
        label={t('editor.curve.mode')}
        options={[
          { value: 'fixed', label: t('editor.curve.fixed') },
          { value: 'curve', label: t('editor.curve.curve') },
        ]}
        value={mode}
        onChange={(m) =>
          m === 'curve'
            ? setSpeedCurve(clip.id, presetCurve('montage'))
            : setSpeedCurve(clip.id, undefined)
        }
        testIdPrefix="speed-mode-"
      />
      {mode === 'fixed' ? (
        <>
          <SliderRow
            label={t('editor.speed')}
            value={clip.speed}
            min={0.25}
            max={8}
            step={0.05}
            format={(v) => `${v}×`}
            defaultValue={1}
            testId="clip-speed-slider"
            onChange={(v) => setClipSpeed(clip.id, v)}
          />
          <Segmented
            label={t('editor.props.speedPresets')}
            options={SPEEDS.map((v) => ({ value: v, label: `${v}×` }))}
            value={(SPEEDS as readonly number[]).includes(clip.speed) ? clip.speed : null}
            onChange={(v) => setClipSpeed(clip.id, v)}
            testIdPrefix="speed-"
            columns={3}
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {SPEED_CURVE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`curve-${p}`}
                aria-pressed={clip.speedCurve?.preset === p}
                onClick={() => setSpeedCurve(clip.id, presetCurve(p))}
                className={`truncate rounded-md border px-1.5 py-1.5 text-[11px] ${
                  clip.speedCurve?.preset === p
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border text-muted hover:text-text'
                }`}
              >
                {t(`editor.curve.presets.${p}`)}
              </button>
            ))}
          </div>
          <CurveEditor
            curve={clip.speedCurve!}
            onChange={(c) => setSpeedCurve(clip.id, c, `curve-${clip.id}`)}
          />
          <p className="text-xs text-muted">{t('editor.curve.hint')}</p>
        </>
      )}
      <p className="text-xs text-muted" data-testid="clip-length">
        {t('editor.props.length')}: {secs(clipDuration(clip))}
      </p>
    </Section>
  )
}

/** Phát ngược và độ mờ của clip. */
export function PlaybackSection({ clip }: { clip: Clip }) {
  const { t } = useTranslation()
  const project = useEditorStore((s) => s.project)
  const rev = useEditorStore((s) => s.revFiles[revKeyOf(clip)])
  const { setClipReversed, updateClip } = useEditorStore.getState()
  const allowed = !!project && canReverse(project.segments, clip)
  return (
    <Section testId="clip-playback" title={t('editor.reverse.title')}>
      <Toggle
        label={t('editor.reverse.toggle')}
        hint={allowed || clip.reversed ? t('editor.reverse.hint') : t('editor.reverse.notAllowed')}
        checked={!!clip.reversed}
        onChange={(on) => {
          if (!on || allowed) setClipReversed(clip.id, on)
        }}
        testId="clip-reverse"
      />
      {clip.reversed && (
        <p className="flex items-center gap-1.5 text-xs" data-testid="clip-reverse-status">
          {rev === 'error' ? (
            <>
              <TriangleAlert size={13} className="text-danger" aria-hidden />
              {t('editor.reverse.failed')}
            </>
          ) : rev && rev !== 'pending' ? (
            <>
              <Rewind size={13} className="text-success" aria-hidden />
              {t('editor.reverse.ready')}
            </>
          ) : (
            <>
              <Loader2 size={13} className="animate-spin" aria-hidden />
              {t('editor.reverse.processing')}
            </>
          )}
        </p>
      )}
      <SliderRow
        label={t('editor.blend.opacity')}
        value={clip.opacity ?? 1}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        defaultValue={1}
        testId="clip-opacity"
        onChange={(v) =>
          updateClip(clip.id, { opacity: v >= 1 ? undefined : v }, `clip-opacity-${clip.id}`)
        }
      />
    </Section>
  )
}
