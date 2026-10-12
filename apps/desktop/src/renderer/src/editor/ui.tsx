import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'

/** Bộ điều khiển dùng chung cho các bảng của trình chỉnh sửa (kiểu phần mềm dựng phim). */

export function Section({
  title,
  action,
  children,
  testId,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4" data-testid={testId}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * Ô số cạnh thanh trượt: hiện giá trị đã định dạng; bấm vào để gõ số (Enter / rời ô để áp dụng,
 * Esc để bỏ, mũi tên lên / xuống để tăng giảm, giữ Shift để bước lớn).
 */
function NumberField({
  value,
  min,
  max,
  step,
  display,
  scale,
  onChange,
  label,
  testId,
}: {
  value: number
  min: number
  max: number
  step: number
  display: string
  /** Giá trị hiện = giá trị thật × scale (vd. 100 cho phần trăm); null = chỉ xem. */
  scale: number | null
  onChange: (v: number) => void
  label: string
  testId?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => {
    const snapped = Math.round((v - min) / step) * step + min
    return Math.min(max, Math.max(min, Number(snapped.toFixed(6))))
  }
  if (scale === null)
    return (
      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono tabular-nums text-text">
        {display}
      </span>
    )
  const shown = Number((value * scale).toFixed(3))
  const commit = () => {
    if (draft === null) return
    const n = Number(draft.replace(',', '.').replace(/[^\d.+-]/g, ''))
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(clamp(n / scale))
    setDraft(null)
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      data-testid={testId ? `${testId}-input` : undefined}
      value={draft ?? display}
      onFocus={(e) => {
        setDraft(String(shown))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(null)
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const next = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))
          onChange(next)
          setDraft(String(Number((next * scale).toFixed(3))))
        }
      }}
      className="w-16 rounded bg-surface-2 px-1.5 py-0.5 text-right font-mono tabular-nums text-text outline-none focus:ring-1 focus:ring-accent"
    />
  )
}

/** Đoán cách đổi giữa giá trị thật và số hiện ra (phần trăm, giây, hoặc giữ nguyên). */
function displayScale(value: number, display: string): number | null {
  const n = Number(/-?\d+(?:[.,]\d+)?/.exec(display)?.[0]?.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (Math.abs(n - value) < 1e-6) return 1
  if (Math.abs(n - value * 100) < 0.6) return 100
  if (Math.abs(n - value / 1000) < 0.06) return 0.001
  return null
}

export function SliderRow(props: {
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
  /** Giá trị mặc định: khác mặc định thì hiện nút đặt lại. */
  defaultValue?: number
}) {
  const { t } = useTranslation()
  const display = props.format ? props.format(props.value) : String(props.value)
  const changed =
    props.defaultValue !== undefined && Math.abs(props.value - props.defaultValue) > 1e-9
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <span className="flex items-center justify-between gap-2">
        <span className="text-muted">{props.label}</span>
        <span className="flex items-center gap-1">
          {changed && (
            <button
              type="button"
              aria-label={t('editor.props.reset')}
              data-tooltip={t('editor.props.reset')}
              data-testid={props.testId ? `${props.testId}-reset` : undefined}
              onClick={() => props.onChange(props.defaultValue!)}
              className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-text"
            >
              <RotateCcw size={12} aria-hidden />
            </button>
          )}
          <NumberField
            value={props.value}
            min={props.min}
            max={props.max}
            step={props.step}
            display={display}
            scale={displayScale(props.value, display)}
            onChange={props.onChange}
            label={props.label}
            testId={props.testId}
          />
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        data-testid={props.testId}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-accent"
      />
      {props.ends && (
        <span className="flex justify-between text-[11px] text-muted">
          <span>{props.ends[0]}</span>
          <span>{props.ends[1]}</span>
        </span>
      )}
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  testId,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  testId?: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        {/* Ô chọn thật phủ trong suốt lên công tắc: bấm được, đọc được bằng trình đọc màn hình. */}
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          data-testid={testId}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={`h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
            checked ? 'bg-accent' : 'bg-surface-2 ring-1 ring-border'
          }`}
        />
        <span
          aria-hidden
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </label>
  )
}

/** Nhóm nút chọn một (segmented control). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  testIdPrefix,
  columns,
}: {
  options: readonly { value: T; label: ReactNode; title?: string }[]
  value: T | null
  onChange: (v: T) => void
  label?: string
  testIdPrefix?: string
  /** Số cột (mặc định: tất cả trên một hàng). */
  columns?: number
}) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {label && <span className="text-muted">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-0.5 rounded-lg bg-surface-2 p-0.5"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            data-tooltip={o.title}
            aria-label={o.title}
            data-testid={testIdPrefix ? `${testIdPrefix}${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            className={`flex min-w-0 items-center justify-center gap-1 truncate rounded-md px-2 py-1.5 transition-colors ${
              value === o.value
                ? 'bg-accent text-accent-fg shadow-sm'
                : 'text-muted hover:bg-white/5 hover:text-text'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export const pct = (v: number) => `${Math.round(v * 100)}%`
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** Nút phụ nhỏ (viền mảnh). */
export const ghostButton =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text hover:bg-surface-2 disabled:opacity-40'
/** Nút chính (màu nhấn). */
export const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110 disabled:opacity-40'
