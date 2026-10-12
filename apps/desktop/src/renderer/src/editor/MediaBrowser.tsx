import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftRight,
  Captions,
  Clapperboard,
  Music2,
  Palette,
  Smile,
  Sparkles,
  Type,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { AiPanel } from './AiPanel'
import { CaptionsPanel } from './CaptionsPanel'
import { AudioTab } from './library/AudioTab'
import { MediaTab } from './library/MediaTab'
import { EffectsTab, StickersTab, TransitionsTab } from './library/tabs'
import { TextTemplatesTab } from './TextPanels'
import { FiltersTab } from './LookPanels'
import { useEditorStore } from './store'

export const LIBRARY_TABS = [
  'media',
  'audio',
  'text',
  'stickers',
  'effects',
  'filters',
  'transitions',
  'captions',
  'ai',
] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

const TAB_ICONS: Record<LibraryTab, LucideIcon> = {
  media: Clapperboard,
  audio: Music2,
  text: Type,
  stickers: Smile,
  effects: Sparkles,
  filters: Palette,
  transitions: ArrowLeftRight,
  captions: Captions,
  ai: WandSparkles,
}

/**
 * Thư viện bên trái (kiểu CapCut): cột mục có biểu tượng và nhãn (Phương tiện, Âm thanh, Văn
 * bản, Nhãn dán, Hiệu ứng, Bộ lọc, Chuyển cảnh, Phụ đề, AI) và nội dung của mục đang chọn.
 */
export function MediaBrowser() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<LibraryTab>('media')
  // Timeline / khung xem trước có thể yêu cầu mở một mục (kể cả mục đang mở).
  const tabRequest = useEditorStore((s) => s.tabRequest)
  const [seenRequest, setSeenRequest] = useState(tabRequest.n)
  if (tabRequest.n !== seenRequest) {
    setSeenRequest(tabRequest.n)
    if ((LIBRARY_TABS as readonly string[]).includes(tabRequest.tab))
      setTab(tabRequest.tab as LibraryTab)
  }
  return (
    <div className="flex h-full" data-testid="library">
      <div
        className="flex w-16 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border bg-bg py-1.5"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('editor.library.title')}
      >
        {LIBRARY_TABS.map((name) => {
          const Icon = TAB_ICONS[name]
          const active = tab === name
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t(`editor.library.tabs.${name}`)}
              data-tooltip={t(`editor.library.tabs.${name}`)}
              data-testid={`lib-${name}`}
              onClick={() => setTab(name)}
              className={`flex min-h-[46px] w-[58px] flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-[9.5px] leading-[1.15] transition-colors ${
                active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.75} aria-hidden />
              <span className="line-clamp-2 w-full break-words text-center">
                {t(`editor.library.tabs.${name}`)}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <h2 className="flex h-10 shrink-0 items-center border-b border-border px-3 text-sm font-semibold">
          {t(`editor.library.tabs.${tab}`)}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'media' && <MediaTab />}
          {tab === 'audio' && <AudioTab />}
          {tab === 'text' && <TextTemplatesTab />}
          {tab === 'stickers' && <StickersTab />}
          {tab === 'effects' && <EffectsTab />}
          {tab === 'filters' && <FiltersTab />}
          {tab === 'transitions' && <TransitionsTab />}
          {tab === 'captions' && (
            <div className="p-3">
              <CaptionsPanel />
            </div>
          )}
          {tab === 'ai' && (
            <div className="p-3">
              <AiPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
