import { useTranslation } from 'react-i18next'
import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Globe,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  Snowflake,
} from 'lucide-react'
import {
  ADJUST_KEYS,
  DEFAULT_ADJUST,
  DEFAULT_TRANSFORM,
  FILTER_PRESETS,
  FREEZE_MAX_MS,
  isDefaultLook,
  isDefaultTransform,
  lookLayers,
  MIN_CLIP_MS,
  normalizeCrop,
  POSITIVE_ADJUST,
  type Clip,
  type ClipTransform,
  type FilterPreset,
  type Look,
  type Rotation,
} from '@lumora/core'
import { currentLook, lookTarget, useEditorStore, type LookTarget } from './store'
import { secs, Section, SliderRow } from './ui'

/** Phần trăm có dấu (+20%, -15%). */
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`

/** Ảnh mẫu dựng bằng CSS (trời, nắng, đồi, da) để xem trước từng bộ lọc. */
const SAMPLE_BG =
  'radial-gradient(circle at 70% 30%, #fde68a 0 12%, transparent 13%), ' +
  'radial-gradient(ellipse at 25% 95%, #e8a87c 0 22%, transparent 23%), ' +
  'linear-gradient(180deg, #60a5fa 0%, #93c5fd 45%, #fbbf24 58%, #16a34a 62%, #14532d 100%)'

/** Ô xem trước một "look" bằng CSS: bộ lọc màu + lớp nhiệt độ / sắc độ / viền tối. */
export function LookSwatch({ look, className = '' }: { look: Look; className?: string }) {
  const layers = lookLayers(look)
  const tone = (value: number, warm: string, cool: string, k: number) =>
    value === 0
      ? null
      : {
          background: value > 0 ? warm : cool,
          opacity: Math.abs(value) * k,
          mixBlendMode: 'soft-light' as const,
        }
  const temperature = layers && tone(layers.temperature, '#ff8a18', '#2078ff', 0.75)
  const tint = layers && tone(layers.tint, '#ec40c8', '#30dc60', 0.6)
  return (
    <span className={`relative block overflow-hidden rounded-md ${className}`} aria-hidden>
      <span
        className="absolute inset-0"
        style={{ background: SAMPLE_BG, filter: layers?.css ?? 'none' }}
      />
      {temperature && <span className="absolute inset-0" style={temperature} />}
      {tint && <span className="absolute inset-0" style={tint} />}
      {layers && layers.vignette > 0 && (
        <span
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${Math.min(0.92, layers.vignette * 0.9)}) 100%)`,
          }}
        />
      )}
    </span>
  )
}

function useLookState() {
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  if (!edit) return null
  const target = lookTarget(edit, selection)
  return { edit, target, look: currentLook(edit, target) }
}

const targetKey = (target: LookTarget) => (target.kind === 'all' ? 'all' : target.id)

/** Dòng cho biết bộ lọc đang áp dụng cho đâu (cả video / clip đang chọn / ảnh đang chọn). */
function TargetNote({ target, clip }: { target: LookTarget; clip?: Clip }) {
  const { t } = useTranslation()
  const { updateClip, select } = useEditorStore.getState()
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs"
      data-testid="look-target"
      data-target={target.kind}
    >
      <span className="text-muted">{t(`editor.look.target.${target.kind}`)}</span>
      {target.kind === 'clip' && clip?.look && (
        <button
          type="button"
          data-testid="look-use-global"
          onClick={() => updateClip(clip.id, { look: undefined })}
          className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-muted hover:text-text"
        >
          <Globe size={12} aria-hidden />
          {t('editor.look.useGlobal')}
        </button>
      )}
      {target.kind !== 'all' && (
        <button
          type="button"
          data-testid="look-target-all"
          onClick={() => select(null)}
          className="rounded px-1.5 py-0.5 text-accent hover:underline"
        >
          {t('editor.look.applyAll')}
        </button>
      )}
    </div>
  )
}

/** Thư viện "Bộ lọc": chọn mẫu màu cho cả video, clip đang chọn hoặc ảnh / video meme đang chọn. */
export function FiltersTab() {
  const { t } = useTranslation()
  const state = useLookState()
  if (!state) return null
  const { edit, target, look } = state
  const { setLook } = useEditorStore.getState()
  const clip = target.kind === 'clip' ? edit.clips.find((c) => c.id === target.id) : undefined
  const choose = (filter: FilterPreset) =>
    setLook({ ...look, filter, intensity: look.filter === filter ? look.intensity : 1 })
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="filters-tab">
      <TargetNote target={target} clip={clip} />
      <div className="grid grid-cols-3 gap-2">
        {FILTER_PRESETS.map((filter) => {
          const active = look.filter === filter
          return (
            <button
              key={filter}
              type="button"
              data-testid={`filter-${filter}`}
              aria-pressed={active}
              aria-label={t(`editor.look.filters.${filter}`)}
              data-tooltip={t(`editor.look.filters.${filter}`)}
              onClick={() => choose(filter)}
              className={`flex flex-col gap-1 rounded-lg p-1 text-[11px] ${
                active
                  ? 'bg-accent/15 text-text ring-2 ring-accent'
                  : 'text-muted hover:bg-surface-2'
              }`}
            >
              <LookSwatch
                className="aspect-square w-full"
                look={{ filter, intensity: 1, adjust: DEFAULT_ADJUST }}
              />
              <span className="truncate text-center">{t(`editor.look.filters.${filter}`)}</span>
            </button>
          )
        })}
      </div>
      {look.filter !== 'none' && (
        <SliderRow
          label={t('editor.look.intensity')}
          value={look.intensity}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          defaultValue={1}
          testId="filter-intensity"
          onChange={(intensity) =>
            setLook({ ...look, intensity }, `look-intensity-${targetKey(target)}`)
          }
        />
      )}
    </div>
  )
}

/** Bảng "Điều chỉnh": sáng, tương phản, bão hòa, nhiệt độ màu… cho đối tượng đang chọn. */
export function AdjustPanel() {
  const { t } = useTranslation()
  const state = useLookState()
  if (!state) return null
  const { edit, target, look } = state
  const { setLook } = useEditorStore.getState()
  const clip = target.kind === 'clip' ? edit.clips.find((c) => c.id === target.id) : undefined
  const changed = !isDefaultLook({ ...look, filter: 'none' })
  return (
    <Section
      testId="adjust-panel"
      title={t('editor.look.adjustTitle')}
      action={
        changed ? (
          <button
            type="button"
            data-testid="adjust-reset"
            onClick={() => setLook({ ...look, adjust: { ...DEFAULT_ADJUST } })}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw size={12} aria-hidden />
            {t('editor.look.resetAll')}
          </button>
        ) : null
      }
    >
      <TargetNote target={target} clip={clip} />
      {ADJUST_KEYS.map((key) => (
        <SliderRow
          key={key}
          label={t(`editor.look.adjust.${key}`)}
          value={look.adjust[key]}
          min={POSITIVE_ADJUST.includes(key) ? 0 : -1}
          max={1}
          step={0.01}
          format={signedPct}
          defaultValue={0}
          testId={`adjust-${key}`}
          onChange={(v) =>
            setLook(
              { ...look, adjust: { ...look.adjust, [key]: v } },
              `adjust-${key}-${targetKey(target)}`,
            )
          }
        />
      ))}
    </Section>
  )
}

const ROTATE_STEP: Record<'left' | 'right', number> = { left: 270, right: 90 }

/** Cắt / lật / xoay clip (kiểu CapCut). Khung hình tự theo tỉ lệ video sau khi biến đổi. */
export function TransformPanel({ clip }: { clip: Clip }) {
  const { t } = useTranslation()
  const { updateClip } = useEditorStore.getState()
  const tf = clip.transform ?? DEFAULT_TRANSFORM
  const set = (patch: Partial<ClipTransform>, coalesce?: string) => {
    const next = { ...tf, ...patch }
    updateClip(
      clip.id,
      { transform: isDefaultTransform(next) ? undefined : next },
      coalesce && `${coalesce}-${clip.id}`,
    )
  }
  const crop = tf.crop
  // Thanh trượt cắt theo từng cạnh (0..45% mỗi cạnh).
  const edges = {
    left: crop.x,
    right: 1 - crop.x - crop.width,
    top: crop.y,
    bottom: 1 - crop.y - crop.height,
  }
  const setEdge = (edge: keyof typeof edges, v: number) => {
    const e = { ...edges, [edge]: v }
    set(
      {
        crop: normalizeCrop({
          x: e.left,
          y: e.top,
          width: 1 - e.left - e.right,
          height: 1 - e.top - e.bottom,
        }),
      },
      `crop-${edge}`,
    )
  }
  const iconButton = (active: boolean) =>
    `flex h-9 flex-1 items-center justify-center rounded-md border ${
      active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'
    }`
  return (
    <Section
      testId="clip-transform"
      title={t('editor.transform.title')}
      action={
        !isDefaultTransform(clip.transform) ? (
          <button
            type="button"
            data-testid="clip-transform-reset"
            onClick={() => updateClip(clip.id, { transform: undefined })}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw size={12} aria-hidden />
            {t('editor.look.resetAll')}
          </button>
        ) : null
      }
    >
      <div className="flex gap-1.5">
        {(
          [
            ['clip-flip-h', FlipHorizontal2, 'flipH', tf.flipH, () => set({ flipH: !tf.flipH })],
            ['clip-flip-v', FlipVertical2, 'flipV', tf.flipV, () => set({ flipV: !tf.flipV })],
            [
              'clip-rotate-left',
              RotateCcwSquare,
              'rotateLeft',
              false,
              () => set({ rotate: ((tf.rotate + ROTATE_STEP.left) % 360) as Rotation }),
            ],
            [
              'clip-rotate-right',
              RotateCwSquare,
              'rotateRight',
              false,
              () => set({ rotate: ((tf.rotate + ROTATE_STEP.right) % 360) as Rotation }),
            ],
          ] as const
        ).map(([testId, Icon, label, active, onClick]) => (
          <button
            key={testId}
            type="button"
            data-testid={testId}
            aria-pressed={active}
            aria-label={t(`editor.transform.${label}`)}
            data-tooltip={t(`editor.transform.${label}`)}
            onClick={onClick}
            className={iconButton(active)}
          >
            <Icon size={17} strokeWidth={1.75} aria-hidden />
          </button>
        ))}
      </div>
      {tf.rotate !== 0 && (
        <p className="text-xs text-muted" data-testid="clip-rotation">
          {t('editor.transform.rotated', { deg: tf.rotate })}
        </p>
      )}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <Crop size={13} aria-hidden />
        {t('editor.transform.crop')}
      </div>
      {(['left', 'right', 'top', 'bottom'] as const).map((edge) => (
        <SliderRow
          key={edge}
          label={t(`editor.transform.edges.${edge}`)}
          value={edges[edge]}
          min={0}
          max={0.45}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          defaultValue={0}
          testId={`crop-${edge}`}
          onChange={(v) => setEdge(edge, v)}
        />
      ))}
    </Section>
  )
}

/** Clip khung hình đứng yên: chỉ chỉnh được độ dài. */
export function FreezePanel({ clip }: { clip: Clip }) {
  const { t } = useTranslation()
  const { setFreezeDuration } = useEditorStore.getState()
  return (
    <Section testId="freeze-props" title={t('editor.freeze.title')}>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Snowflake size={13} aria-hidden className="text-sky-400" />
        {t('editor.freeze.hint', { at: secs(clip.sourceStart) })}
      </p>
      <SliderRow
        label={t('editor.props.length')}
        value={(clip.freeze ?? 0) / 1000}
        min={MIN_CLIP_MS / 1000}
        max={Math.min(FREEZE_MAX_MS / 1000, 20)}
        step={0.1}
        format={(v) => `${v.toFixed(1)}s`}
        defaultValue={2}
        testId="freeze-duration"
        onChange={(v) => setFreezeDuration(clip.id, v * 1000)}
      />
    </Section>
  )
}
