import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Italic,
  Loader2,
  Mic,
  Type,
  type LucideIcon,
} from 'lucide-react'
import {
  FONTS,
  fontFamily,
  overlayTextStyle,
  SHAPE_ASPECT,
  SHAPE_COLORS,
  SHAPES,
  templateStyle,
  TEXT_ANIMS,
  TEXT_STYLES,
  TEXT_TEMPLATES,
  withTextStyle,
  type Overlay,
  type ShapeKind,
  type TextAlign,
  type TextStyle,
  type TextStyleProps,
} from '@lumora/core'
import { lumora } from '../api'
import { useAppStore } from '../store/app'
import { loadFonts } from './fonts'
import { drawShape } from './shape-draw'
import { useEditorStore } from './store'
import { pct, Section, Segmented, SliderRow, Toggle } from './ui'

const hexA = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Kiểu chữ → CSS gần giống cách vẽ trên video (để xem mẫu trong thư viện / bảng thuộc tính). */
export function textStyleCss(s: TextStyleProps, px = 18): CSSProperties {
  const shadows: string[] = []
  if (s.shadow.blur > 0 || s.shadow.dx || s.shadow.dy)
    shadows.push(
      `${s.shadow.dx * px}px ${s.shadow.dy * px}px ${s.shadow.blur * px}px ${s.shadow.color}`,
    )
  return {
    fontFamily: fontFamily(s.font),
    fontWeight: s.weight,
    fontStyle: s.italic ? 'italic' : 'normal',
    textTransform: s.uppercase ? 'uppercase' : 'none',
    letterSpacing: `${s.letterSpacing}em`,
    fontSize: px,
    lineHeight: s.lineHeight,
    color: s.color,
    WebkitTextStroke: s.stroke.width > 0 ? `${s.stroke.width * px}px ${s.stroke.color}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: shadows.join(', ') || undefined,
    ...(s.gradient
      ? {
          backgroundImage: `linear-gradient(${s.gradient.angle}deg, ${s.gradient.from}, ${s.gradient.to})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }
      : {}),
    ...(s.background.opacity > 0
      ? {
          backgroundColor: hexA(s.background.color, s.background.opacity),
          padding: `${s.background.padding * 0.6}em ${s.background.padding}em`,
          borderRadius: `${s.background.radius * 0.8}em`,
        }
      : {}),
  }
}

/** Thư viện "Văn bản": 24 mẫu chữ có xem trước; bấm để thêm tại đầu phát. */
export function TextTemplatesTab() {
  const { t } = useTranslation()
  const addOverlay = useEditorStore((s) => s.addOverlay)
  useEffect(() => void loadFonts(), [])
  const add = (id: string, style: TextStyleProps) =>
    addOverlay({
      kind: 'text',
      text: t('editor.library.defaultText'),
      style: (TEXT_STYLES as readonly string[]).includes(id) ? (id as TextStyle) : 'title',
      color: style.color,
      textStyle: style,
    })
  return (
    <div className="flex flex-col gap-3 p-3">
      <button
        type="button"
        data-testid="text-add-default"
        className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
        onClick={() => add('title', templateStyle('title'))}
      >
        <Type size={15} aria-hidden />
        {t('editor.library.addText')}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {TEXT_TEMPLATES.map(({ id, style }) => (
          <button
            key={id}
            type="button"
            data-testid={`text-add-${id}`}
            aria-label={t(`editor.textTemplates.${id}`)}
            data-tooltip={t(`editor.textTemplates.${id}`)}
            onClick={() => add(id, style)}
            className="flex flex-col gap-1 rounded-lg p-1 text-left text-[11px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <span className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-slate-600 to-slate-900">
              <span style={textStyleCss(style, 17)}>{t('editor.library.sample')}</span>
            </span>
            <span className="truncate">{t(`editor.textTemplates.${id}`)}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t('editor.library.textHint')}</p>
    </div>
  )
}

const ALIGN_ICONS: Record<TextAlign, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
}

/** Bảng chữ: mẫu, phông, đậm / nghiêng / chữ hoa / căn, màu, viền, bóng, nền, khoảng cách, hiệu ứng. */
export function TextStylePanel({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const { updateOverlay } = useEditorStore.getState()
  const style = overlayTextStyle(overlay)
  useEffect(() => void loadFonts(), [])
  const set = (patch: Parameters<typeof withTextStyle>[1], coalesce?: string) =>
    updateOverlay(
      overlay.id,
      { textStyle: withTextStyle(style, patch) },
      coalesce && `${coalesce}-${overlay.id}`,
    )
  const color = (label: string, value: string, onChange: (v: string) => void, testId: string) => (
    <label className="flex items-center justify-between text-xs">
      <span className="text-muted">{label}</span>
      <input
        type="color"
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
      />
    </label>
  )
  const em = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Section title={t('editor.text.templates')} testId="text-templates">
        <div className="grid grid-cols-4 gap-1">
          {TEXT_TEMPLATES.map(({ id, style: s }) => (
            <button
              key={id}
              type="button"
              data-testid={`overlay-style-${id}`}
              aria-label={t(`editor.textTemplates.${id}`)}
              data-tooltip={t(`editor.textTemplates.${id}`)}
              onClick={() =>
                updateOverlay(overlay.id, {
                  textStyle: s,
                  color: s.color,
                  ...((TEXT_STYLES as readonly string[]).includes(id)
                    ? { style: id as TextStyle }
                    : {}),
                })
              }
              className="flex h-10 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-slate-600 to-slate-900 hover:ring-1 hover:ring-accent"
            >
              <span style={textStyleCss(s, 13)}>Aa</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('editor.text.font')} testId="text-font">
        <select
          data-testid="overlay-font"
          aria-label={t('editor.text.font')}
          value={style.font}
          onChange={(e) => set({ font: e.target.value as TextStyleProps['font'] })}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
          style={{ fontFamily: fontFamily(style.font) }}
        >
          {FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: fontFamily(f.id) }}>
              {f.family}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <Segmented
            options={([400, 700, 900] as const).map((w) => ({
              value: w,
              label: t(`editor.text.weights.${w}`),
            }))}
            value={style.weight}
            onChange={(weight) => set({ weight })}
            testIdPrefix="text-weight-"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="text-italic"
            aria-pressed={style.italic}
            aria-label={t('editor.text.italic')}
            data-tooltip={t('editor.text.italic')}
            onClick={() => set({ italic: !style.italic })}
            className={`flex size-8 items-center justify-center rounded-md border ${
              style.italic ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted'
            }`}
          >
            <Italic size={15} aria-hidden />
          </button>
          <button
            type="button"
            data-testid="text-uppercase"
            aria-pressed={style.uppercase}
            aria-label={t('editor.text.uppercase')}
            data-tooltip={t('editor.text.uppercase')}
            onClick={() => set({ uppercase: !style.uppercase })}
            className={`flex h-8 items-center justify-center rounded-md border px-2 text-xs font-bold ${
              style.uppercase
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted'
            }`}
          >
            AA
          </button>
          <span className="mx-1 h-5 w-px bg-border" />
          {(['left', 'center', 'right'] as const).map((a) => {
            const Icon = ALIGN_ICONS[a]
            return (
              <button
                key={a}
                type="button"
                data-testid={`text-align-${a}`}
                aria-pressed={style.align === a}
                aria-label={t(`editor.text.aligns.${a}`)}
                data-tooltip={t(`editor.text.aligns.${a}`)}
                onClick={() => set({ align: a })}
                className={`flex size-8 items-center justify-center rounded-md border ${
                  style.align === a
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted'
                }`}
              >
                <Icon size={15} aria-hidden />
              </button>
            )
          })}
        </div>
      </Section>
      <Section title={t('editor.text.color')} testId="text-color">
        <Toggle
          label={t('editor.text.gradient')}
          checked={!!style.gradient}
          onChange={(on) =>
            set({
              gradient: on ? { from: style.color, to: '#db2777', angle: 90 } : undefined,
            })
          }
          testId="text-gradient"
        />
        {style.gradient ? (
          <>
            {color(
              t('editor.text.gradientFrom'),
              style.gradient.from,
              (from) => set({ gradient: { ...style.gradient!, from } }, 'text-grad'),
              'text-gradient-from',
            )}
            {color(
              t('editor.text.gradientTo'),
              style.gradient.to,
              (to) => set({ gradient: { ...style.gradient!, to } }, 'text-grad'),
              'text-gradient-to',
            )}
            <SliderRow
              label={t('editor.text.gradientAngle')}
              value={style.gradient.angle}
              min={0}
              max={360}
              step={5}
              format={(v) => `${Math.round(v)}°`}
              testId="text-gradient-angle"
              onChange={(angle) => set({ gradient: { ...style.gradient!, angle } }, 'text-grad')}
            />
          </>
        ) : (
          color(
            t('editor.stickers.color'),
            style.color,
            (c) => {
              set({ color: c }, 'ov-color')
            },
            'text-fill',
          )
        )}
      </Section>
      <Section title={t('editor.text.stroke')} testId="text-stroke-section">
        <SliderRow
          label={t('editor.text.width')}
          value={style.stroke.width}
          min={0}
          max={0.3}
          step={0.01}
          format={em}
          defaultValue={0}
          testId="text-stroke"
          onChange={(width) => set({ stroke: { width } }, 'text-stroke')}
        />
        {style.stroke.width > 0 &&
          color(
            t('editor.text.strokeColor'),
            style.stroke.color,
            (c) => set({ stroke: { color: c } }, 'text-stroke-color'),
            'text-stroke-color',
          )}
      </Section>
      <Section title={t('editor.text.shadow')} testId="text-shadow-section">
        <SliderRow
          label={t('editor.text.blur')}
          value={style.shadow.blur}
          min={0}
          max={1}
          step={0.01}
          format={em}
          defaultValue={0}
          testId="text-shadow"
          onChange={(blur) => set({ shadow: { blur } }, 'text-shadow')}
        />
        {(style.shadow.blur > 0 || style.shadow.dx !== 0 || style.shadow.dy !== 0) &&
          color(
            t('editor.text.shadowColor'),
            style.shadow.color,
            (c) => set({ shadow: { color: c } }, 'text-shadow-color'),
            'text-shadow-color',
          )}
        <SliderRow
          label={t('editor.text.offset')}
          value={style.shadow.dy}
          min={-0.5}
          max={0.5}
          step={0.01}
          format={em}
          defaultValue={0}
          testId="text-shadow-offset"
          onChange={(v) => set({ shadow: { dx: v, dy: v } }, 'text-shadow-offset')}
        />
      </Section>
      <Section title={t('editor.text.background')} testId="text-bg-section">
        <SliderRow
          label={t('editor.blend.opacity')}
          value={style.background.opacity}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          defaultValue={0}
          testId="text-bg"
          onChange={(opacity) => set({ background: { opacity } }, 'text-bg')}
        />
        {style.background.opacity > 0 && (
          <>
            {color(
              t('editor.text.backgroundColor'),
              style.background.color,
              (c) => set({ background: { color: c } }, 'text-bg-color'),
              'text-bg-color',
            )}
            <SliderRow
              label={t('editor.text.radius')}
              value={style.background.radius}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              testId="text-bg-radius"
              onChange={(radius) => set({ background: { radius } }, 'text-bg-radius')}
            />
            <SliderRow
              label={t('editor.text.padding')}
              value={style.background.padding}
              min={0}
              max={1}
              step={0.05}
              format={em}
              testId="text-bg-padding"
              onChange={(padding) => set({ background: { padding } }, 'text-bg-padding')}
            />
          </>
        )}
      </Section>
      <Section title={t('editor.text.spacing')} testId="text-spacing">
        <SliderRow
          label={t('editor.text.lineHeight')}
          value={style.lineHeight}
          min={0.8}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(2)}`}
          defaultValue={1.2}
          testId="text-line-height"
          onChange={(lineHeight) => set({ lineHeight }, 'text-lh')}
        />
        <SliderRow
          label={t('editor.text.letterSpacing')}
          value={style.letterSpacing}
          min={-0.1}
          max={0.5}
          step={0.01}
          format={em}
          defaultValue={0}
          testId="text-letter-spacing"
          onChange={(letterSpacing) => set({ letterSpacing }, 'text-ls')}
        />
      </Section>
      <Section title={t('editor.text.anim')} testId="text-anim-section">
        <div className="grid grid-cols-3 gap-1">
          {TEXT_ANIMS.map((a) => (
            <button
              key={a}
              type="button"
              data-testid={`text-anim-${a}`}
              aria-pressed={style.anim === a}
              onClick={() => set({ anim: a })}
              className={`truncate rounded-md border px-1.5 py-1.5 text-[11px] ${
                style.anim === a
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              {t(`editor.text.anims.${a}`)}
            </button>
          ))}
        </div>
      </Section>
      <ReadAloudSection overlay={overlay} />
    </>
  )
}

/** "Đọc chữ này": giọng AI đọc nội dung lớp chữ, đặt đúng lúc lớp chữ xuất hiện. */
function ReadAloudSection({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const hasKey = useAppStore((s) => s.secrets?.elevenlabs?.state === 'saved')
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([])
  const [voice, setVoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!hasKey) return
    let alive = true
    lumora()
      .listVoices()
      .then((list) => {
        if (!alive) return
        setVoices(list)
        setVoice((v) => v || list[0]?.id || '')
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [hasKey])
  const read = async () => {
    setBusy(true)
    setError(null)
    try {
      await useEditorStore.getState().addSpeech(overlay.text, voice, overlay.start)
    } catch {
      setError(t('editor.text.readFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title={t('editor.text.readAloud')} testId="text-tts">
      {!hasKey ? (
        <p className="text-xs text-muted">{t('editor.text.readNeedsKey')}</p>
      ) : (
        <>
          <select
            data-testid="tts-voice"
            aria-label={t('editor.library.voice')}
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="tts-read"
            disabled={busy || !voice || !overlay.text.trim()}
            onClick={() => void read()}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Mic size={14} aria-hidden />
            )}
            {t('editor.text.readThis')}
          </button>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </Section>
  )
}

/** Hình nhỏ vẽ bằng đúng hàm vẽ trên video (thư viện hình, nút đổi hình). */
export function ShapeThumb({
  shape,
  color,
  size = 28,
}: {
  shape: ShapeKind
  color: string
  size?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * 2 * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, size, size / 2)
    const aspect = SHAPE_ASPECT[shape]
    const h = Math.min(size * 0.85, (size * 1.8) / aspect)
    drawShape(ctx, shape, color, h * aspect, h, Math.max(1.5, h * 0.12))
  }, [shape, color, size])
  return <canvas ref={ref} aria-hidden style={{ width: size * 2, height: size }} />
}

/** Thư viện hình vẽ sẵn (mũi tên, khoanh tròn…) với màu chọn trước. */
export function ShapesGrid() {
  const { t } = useTranslation()
  const addOverlay = useEditorStore((s) => s.addOverlay)
  const [color, setColor] = useState<string>(SHAPE_COLORS[0])
  return (
    <div className="flex flex-col gap-2">
      <ColorSwatches value={color} onChange={setColor} testIdPrefix="shape-color-" />
      <div className="grid grid-cols-2 gap-1.5">
        {SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            data-testid={`shape-${shape}`}
            aria-label={t(`editor.shapes.${shape}`)}
            data-tooltip={t(`editor.shapes.${shape}`)}
            onClick={() => addOverlay({ kind: 'shape', shape, color, text: '', strokeWidth: 0.08 })}
            className="flex flex-col items-center gap-1 rounded-lg bg-surface-2/60 p-2 text-[11px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <ShapeThumb shape={shape} color={color} />
            <span className="truncate">{t(`editor.shapes.${shape}`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ColorSwatches({
  value,
  onChange,
  testIdPrefix,
}: {
  value: string
  onChange: (c: string) => void
  testIdPrefix: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5">
      {SHAPE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          data-testid={`${testIdPrefix}${c.slice(1)}`}
          aria-label={c}
          aria-pressed={value.toLowerCase() === c}
          onClick={() => onChange(c)}
          className={`size-6 rounded-full border-2 ${
            value.toLowerCase() === c ? 'border-accent' : 'border-border'
          }`}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        aria-label={t('editor.stickers.color')}
        data-testid={`${testIdPrefix}custom`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
      />
    </div>
  )
}

/** Thuộc tính lớp hình: đổi hình, màu, độ dày nét. */
export function ShapeSection({ overlay }: { overlay: Overlay }) {
  const { t } = useTranslation()
  const { updateOverlay } = useEditorStore.getState()
  const shape = overlay.shape ?? 'arrow'
  const update = (patch: Partial<Overlay>, coalesce?: string) =>
    updateOverlay(overlay.id, patch, coalesce && `${coalesce}-${overlay.id}`)
  const filled = shape === 'star' || shape === 'highlight' || shape === 'cursor'
  return (
    <Section title={t('editor.props.shape')} testId="shape-props">
      <div className="grid grid-cols-5 gap-1">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`shape-kind-${s}`}
            aria-pressed={s === shape}
            aria-label={t(`editor.shapes.${s}`)}
            data-tooltip={t(`editor.shapes.${s}`)}
            onClick={() => update({ shape: s })}
            className={`flex items-center justify-center rounded-md border p-1 ${
              s === shape ? 'border-accent bg-accent/10' : 'border-border hover:border-muted'
            }`}
          >
            <ShapeThumb shape={s} color={overlay.color} size={14} />
          </button>
        ))}
      </div>
      <ColorSwatches
        value={overlay.color}
        onChange={(color) => update({ color }, 'shape-color')}
        testIdPrefix="shape-prop-color-"
      />
      {!filled && (
        <SliderRow
          label={t('editor.text.width')}
          value={overlay.strokeWidth ?? 0.08}
          min={0.02}
          max={0.3}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          defaultValue={0.08}
          testId="shape-stroke"
          onChange={(strokeWidth) => update({ strokeWidth }, 'shape-stroke')}
        />
      )}
    </Section>
  )
}
