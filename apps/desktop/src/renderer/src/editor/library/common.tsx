import { dragProps, type DragPayload } from '../library-drag'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, X, type LucideIcon } from 'lucide-react'
import { ipcErrorMessage } from '../../lib/prefs'

/** Mã lỗi có lời giải thích riêng (các mã khác hiện dạng "Lỗi: …"). */
const KNOWN_ERRORS = [
  'image_unsupported',
  'image_unreadable',
  'video_unreadable',
  'audio_unsupported',
  'audio_unreadable',
  'key_missing',
  'key_invalid',
  'quota',
  'net_offline',
  'bad_response',
  'online_too_large',
  'online_unknown',
  'speech_empty',
]

/** Đổi lỗi IPC thành câu dễ hiểu theo ngôn ngữ đang dùng. */
export function useErrorText() {
  const { t } = useTranslation()
  return (e: unknown) => {
    let code = ipcErrorMessage(e)
    // Thiếu key ElevenLabs / Claude ném dạng "missing_key:elevenlabs".
    if (code.startsWith('missing_key:')) code = 'key_missing'
    return KNOWN_ERRORS.includes(code)
      ? t(`editor.library.errors.${code}`)
      : t('editor.library.errors.generic', { message: code })
  }
}

/** Cột mục con bên trái của một mục thư viện (như CapCut: Nhập / Của tôi / Video / Ảnh…). */
export function SubNav<T extends string>({
  items,
  value,
  onChange,
  testIdPrefix,
  label,
}: {
  items: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  testIdPrefix?: string
  label?: string
}) {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label={label}
      className="flex w-[88px] shrink-0 flex-col gap-0.5 self-start"
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={testIdPrefix ? `${testIdPrefix}${item.value}` : undefined}
            onClick={() => onChange(item.value)}
            className={`truncate rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
              active ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:text-text'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p role="alert" className="rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">
      {text}
    </p>
  )
}

/** Thẻ trong thư viện: bấm để thêm tại đầu phát (nút + hiện khi rê chuột). */
export function Card({
  onClick,
  children,
  testId,
  title,
  disabled,
  drag,
}: {
  onClick: () => void
  children: ReactNode
  testId?: string
  title?: string
  disabled?: boolean
  /** Kéo thẻ vào timeline để thêm đúng chỗ thả. */
  drag?: DragPayload
}) {
  return (
    <button
      type="button"
      {...(drag ? dragProps(drag) : {})}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      data-tooltip={title}
      aria-label={title}
      className="group relative flex flex-col gap-1.5 rounded-lg p-1 text-left text-[11px] text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
    >
      {children}
      <span className="absolute right-2 top-2 hidden rounded-full bg-accent p-0.5 text-accent-fg shadow group-hover:block">
        <Plus size={12} aria-hidden />
      </span>
    </button>
  )
}

/** Ô tìm kiếm: Enter để tìm, nút xóa nhanh. */
export function SearchBox({
  value,
  onSearch,
  placeholder,
  testId,
}: {
  value: string
  onSearch: (q: string) => void
  placeholder: string
  testId?: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  return (
    <form
      role="search"
      className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 focus-within:border-accent"
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(draft.trim())
      }}
    >
      <Search size={15} aria-hidden className="shrink-0 text-muted" />
      <input
        type="search"
        value={draft}
        data-testid={testId}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          aria-label={t('editor.library.clear')}
          data-tooltip={t('editor.library.clear')}
          onClick={() => {
            setDraft('')
            onSearch('')
          }}
          className="rounded p-0.5 text-muted hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </form>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted">
      <Icon size={28} strokeWidth={1.5} aria-hidden className="text-muted/70" />
      <p className="text-sm text-text">{title}</p>
      <p>{text}</p>
      {action}
    </div>
  )
}

export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Tiêu đề nhỏ trong thư viện. */
export function Heading({ children }: { children: ReactNode }) {
  return <h4 className="text-[11px] font-semibold text-muted">{children}</h4>
}
