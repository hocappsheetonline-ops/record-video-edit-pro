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
 * Thư viện bên trái (kiểu CapCut): cột biểu tượng chọn mục (chú thích khi rê chuột) và nội dung
 * của mục — meme, âm thanh, chữ, nhãn dán, hiệu ứng, chuyển cảnh, phụ đề, AI.
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
        className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border py-2"
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
              className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <Icon size={19} strokeWidth={1.75} aria-hidden />
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
