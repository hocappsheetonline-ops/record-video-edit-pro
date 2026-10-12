import { Film, FolderOpen, Radio, Settings, Video, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore, type Page } from '../store/app'

const ITEMS: { page: Page; icon: LucideIcon }[] = [
  { page: 'record', icon: Video },
  { page: 'projects', icon: FolderOpen },
  { page: 'editor', icon: Film },
  { page: 'live', icon: Radio },
]

function NavButton({ page, icon: Icon }: { page: Page; icon: LucideIcon }) {
  const { t } = useTranslation()
  const active = useAppStore((s) => s.page === page)
  const setPage = useAppStore((s) => s.setPage)
  return (
    <button
      type="button"
      onClick={() => setPage(page)}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${page}`}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      <Icon size={18} aria-hidden />
      {t(`nav.${page}`)}
    </button>
  )
}

export function Sidebar() {
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-3">
      <div className="mb-4 flex items-center gap-2 px-3 py-2">
        <div className="size-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500" />
        <span className="text-lg font-semibold tracking-tight">Lumora</span>
      </div>
      {ITEMS.map((item) => (
        <NavButton key={item.page} {...item} />
      ))}
      <div className="mt-auto">
        <NavButton page="settings" icon={Settings} />
      </div>
    </nav>
  )
}
