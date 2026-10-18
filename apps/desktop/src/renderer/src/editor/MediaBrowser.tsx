import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftRight,
  Captions,
  Clapperboard,
  Music2,
  Palette,
  Smile,
  Sparkle,
  TextQuote,
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
import { TranscriptPanel } from './TranscriptPanel'
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
  'transcript',
  'ai',
] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

const TAB_ICONS: Record<LibraryTab, LucideIcon> = {
  media: Clapperboard,
  audio: Music2,
  text: Type,
  stickers: Smile,
  effects: Sparkle,
  filters: Palette,
  transitions: ArrowLeftRight,
  captions: Captions,
  transcript: TextQuote,
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
    <div className="flex h-full flex-col" data-testid="library">
      {/* Hàng mục ngang như CapCut: biểu tượng trên, nhãn dưới; cuộn ngang khi hẹp. */}
      <div
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-bg px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-orientation="horizontal"
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
              className={`flex min-w-[58px] shrink-0 flex-col items-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] leading-none transition-colors ${
                active ? 'text-accent' : 'text-muted hover:text-text'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.6} aria-hidden />
              <span className="whitespace-nowrap">{t(`editor.library.tabs.${name}`)}</span>
            </button>
          )
        })}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          {tab === 'transcript' && (
            <div className="p-3">
              <TranscriptPanel />
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
