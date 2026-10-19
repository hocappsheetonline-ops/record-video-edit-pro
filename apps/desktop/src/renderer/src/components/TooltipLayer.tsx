import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DELAY_MS = 350
const GAP = 6
const MARGIN = 8

interface Tip {
  text: string
  shortcut: string
  anchor: DOMRect
}

/**
 * Chú thích nổi cho mọi phần tử có `data-tooltip` (và tùy chọn `data-shortcut`): hiện sau khi rê
 * chuột / focus một chút, tự lật lên trên khi sát mép dưới, không tràn ra ngoài cửa sổ. Dùng cho các
 * nút chỉ có biểu tượng (thay cho `title` mặc định của trình duyệt: chậm và không đẹp).
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let current: HTMLElement | null = null
    const hide = () => {
      if (timer) clearTimeout(timer)
      timer = null
      current = null
      setTip(null)
      setPos(null)
    }
    const target = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null
    const begin = (el: HTMLElement | null, delay: number) => {
      if (el === current) return
      hide()
      if (!el || !el.dataset.tooltip) return
      current = el
      timer = setTimeout(() => {
        if (!current?.isConnected) return
        setTip({
          text: current.dataset.tooltip ?? '',
          shortcut: current.dataset.shortcut ?? '',
          anchor: current.getBoundingClientRect(),
        })
      }, delay)
    }
    const onOver = (e: PointerEvent) => begin(target(e.target), DELAY_MS)
    const onOut = (e: PointerEvent) => {
      if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide()
    }
    const onFocus = (e: FocusEvent) => {
      const el = target(e.target)
      if (el?.matches(':focus-visible')) begin(el, 0)
    }
    window.addEventListener('pointerover', onOver)
    window.addEventListener('pointerout', onOut)
    window.addEventListener('pointerdown', hide, true)
    window.addEventListener('focusin', onFocus)
    window.addEventListener('focusout', hide)
    window.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    return () => {
      hide()
      window.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerout', onOut)
      window.removeEventListener('pointerdown', hide, true)
      window.removeEventListener('focusin', onFocus)
      window.removeEventListener('focusout', hide)
      window.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  // Đo kích thước chú thích rồi mới đặt vị trí: dưới phần tử, lật lên trên nếu thiếu chỗ.
  useLayoutEffect(() => {
    const el = ref.current
    if (!tip || !el) return
    const { width, height } = el.getBoundingClientRect()
    const a = tip.anchor
    const below = a.bottom + GAP
    const top = below + height + MARGIN > window.innerHeight ? a.top - GAP - height : below
    const left = Math.min(
      window.innerWidth - width - MARGIN,
      Math.max(MARGIN, a.left + a.width / 2 - width / 2),
    )
    setPos({ left, top: Math.max(MARGIN, top) })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      data-testid="tooltip"
      className="glass-strong pointer-events-none fixed z-[100] flex max-w-xs items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-text shadow-lg"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <span>{tip.text}</span>
      {tip.shortcut && (
        <kbd className="rounded-md border border-border bg-surface-2 px-1 text-[10px] text-muted">
          {tip.shortcut}
        </kbd>
      )}
    </div>,
    document.body,
  )
}
