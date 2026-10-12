import type { ReactNode } from 'react'

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
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="flex items-center justify-between gap-2">
        <span className="text-muted">{props.label}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono tabular-nums text-text">
          {props.format ? props.format(props.value) : props.value}
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
    </label>
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
            title={o.title}
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
