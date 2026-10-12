import { Film, FolderOpen, Radio, Settings, Video, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore, type Page } from '../store/app'

const ITEMS: { page: Page; icon: LucideIcon }[] = [
  { page: 'record', icon: Video },
  { page: 'projects', icon: FolderOpen },
  { page: 'editor', icon: Film },
  { page: 'live', icon: Radio },
]

function NavButton({
  page,
  icon: Icon,
  compact,
}: {
  page: Page
  icon: LucideIcon
  compact: boolean
}) {
  const { t } = useTranslation()
  const active = useAppStore((s) => s.page === page)
  const setPage = useAppStore((s) => s.setPage)
  return (
    <button
      type="button"
      onClick={() => setPage(page)}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? t(`nav.${page}`) : undefined}
      data-tooltip={compact ? t(`nav.${page}`) : undefined}
      data-testid={`nav-${page}`}
      className={`flex w-full items-center rounded-lg text-[13px] font-medium transition-colors ${
        compact ? 'justify-center p-2.5' : 'gap-2.5 px-2.5 py-1.5'
      } ${
        active
          ? 'bg-accent text-accent-fg shadow-sm'
          : 'text-text/85 hover:bg-text/8 hover:text-text'
      }`}
    >
      <Icon size={compact ? 20 : 18} aria-hidden />
      {!compact && t(`nav.${page}`)}
    </button>
  )
}

/**
 * Thanh điều hướng kiểu sidebar macOS (kính mờ, mục đang chọn là viên màu nhấn). Ở trình chỉnh
 * sửa thu gọn thành cột biểu tượng để nhường chỗ cho video.
 */
export function Sidebar() {
  const compact = useAppStore((s) => s.page === 'editor')
  return (
    <nav
      className={`glass flex shrink-0 flex-col gap-0.5 border-r ${
        compact ? 'w-14 items-center p-2' : 'w-56 p-3'
      }`}
      data-compact={compact}
    >
      <div className={`flex items-center gap-2.5 ${compact ? 'mb-3 py-2' : 'mb-4 px-2 py-2'}`}>
        <div className="size-7 rounded-[9px] bg-gradient-to-br from-accent to-sky-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.3)]" />
        {!compact && <span className="text-[15px] font-semibold tracking-tight">Lumora</span>}
      </div>
      {ITEMS.map((item) => (
        <NavButton key={item.page} {...item} compact={compact} />
      ))}
      <div className="mt-auto w-full">
        <NavButton page="settings" icon={Settings} compact={compact} />
      </div>
    </nav>
  )
}
