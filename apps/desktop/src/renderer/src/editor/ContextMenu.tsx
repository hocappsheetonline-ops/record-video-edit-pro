import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { create } from 'zustand'

export interface MenuItem {
  label: string
  /** Phím tắt hiện bên phải (chỉ để xem). */
  shortcut?: string
  testId?: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}
/** `null` trong danh sách là đường kẻ ngăn nhóm. */
export type MenuEntry = MenuItem | null

interface MenuState {
  menu: { x: number; y: number; items: MenuEntry[] } | null
  open(x: number, y: number, items: MenuEntry[]): void
  close(): void
}

export const useContextMenu = create<MenuState>((set) => ({
  menu: null,
  open: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}))

/** Mở menu chuột phải tại vị trí con trỏ. */
export function openContextMenu(e: ReactMouseEvent, items: MenuEntry[]) {
  e.preventDefault()
  e.stopPropagation()
  useContextMenu.getState().open(e.clientX, e.clientY, items)
}

/** Lớp hiển thị menu chuột phải (đặt một lần trong trang chỉnh sửa). */
export function ContextMenuLayer() {
  const menu = useContextMenu((s) => s.menu)
  const close = useContextMenu((s) => s.close)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu) return
    const el = ref.current
    const w = el?.offsetWidth ?? 220
    const h = el?.offsetHeight ?? 300
    // Không cho menu tràn ra ngoài cửa sổ.
    setPos({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - w - 4)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - h - 4)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
    }
  }, [menu, close])

  if (!menu) return null
  return (
    <div
      ref={ref}
      role="menu"
      data-testid="context-menu"
      className="glass-strong fixed z-[60] min-w-52 rounded-xl border p-1 text-[13px] shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item === null ? (
          <div key={`sep-${i}`} className="mx-2 my-1 h-px bg-border" />
        ) : (
          <button
            key={item.testId ?? item.label}
            type="button"
            role="menuitem"
            data-testid={item.testId}
            disabled={item.disabled}
            onClick={() => {
              close()
              item.onClick()
            }}
            className={`group flex w-full items-center justify-between gap-6 rounded-md px-2.5 py-1 text-left hover:bg-accent hover:text-accent-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit ${
              item.danger ? 'text-danger' : ''
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[11px] text-muted group-hover:text-accent-fg/80">
                {item.shortcut}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  )
}
