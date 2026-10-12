import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CloudOff, Download, KeyRound, Loader2, Play } from 'lucide-react'
import type { MemeItem, OnlineItem, OnlineSearch, OnlineSource } from '@shared/ipc'
import { lumora } from '../../api'
import { useAppStore } from '../../store/app'
import { EmptyState, ErrorNote, formatDuration, SearchBox, useErrorText } from './common'

/** Từ khóa gợi ý cho từng nguồn (bấm là tìm luôn). */
const SUGGESTIONS: Record<OnlineSource, string[]> = {
  pixabayVideo: ['city', 'nature', 'technology', 'abstract', 'ocean', 'night'],
  pixabayImage: ['background', 'texture', 'gradient', 'workspace', 'sky'],
}

/** Ô kết quả: ảnh thu nhỏ, rê chuột là phát thử; bấm để tải về rồi thêm vào video. */
function ResultCard({
  item,
  state,
  onClick,
}: {
  item: OnlineItem
  state: 'idle' | 'busy' | 'done'
  onClick: () => void
}) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(false)
  const playable = item.kind === 'video' && item.previewUrl !== item.thumbUrl
  const square = item.kind === 'sticker'
  return (
    <button
      type="button"
      data-testid="online-item"
      data-state={state}
      disabled={state === 'busy'}
      data-tooltip={item.title}
      aria-label={item.title}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      className="group relative flex flex-col overflow-hidden rounded-lg bg-black/40 text-left ring-1 ring-transparent hover:ring-accent disabled:cursor-wait"
    >
      <span className={`relative block w-full ${square ? 'aspect-square' : 'aspect-video'}`}>
        {hover && playable ? (
          <video
            src={item.previewUrl}
            muted
            loop
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={item.thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className={`h-full w-full ${square ? 'object-contain' : 'object-cover'}`}
          />
        )}
        {item.kind === 'video' && item.durationMs > 0 && (
          <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">
            <Play size={9} aria-hidden />
            {formatDuration(item.durationMs)}
          </span>
        )}
        <span
          className={`absolute right-1 top-1 rounded-full p-1 shadow ${
            state === 'done'
              ? 'bg-success text-black'
              : 'bg-black/60 text-white opacity-0 group-hover:opacity-100'
          } ${state === 'busy' ? 'opacity-100' : ''}`}
          aria-hidden
        >
          {state === 'busy' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : state === 'done' ? (
            <Check size={12} />
          ) : (
            <Download size={12} />
          )}
        </span>
      </span>
      <span className="sr-only">
        {state === 'done' ? t('editor.library.downloaded') : t('editor.library.download')}
      </span>
    </button>
  )
}

/**
 * Tìm và tải nội dung từ kho online (Pixabay). Tải xong được lưu vào thư viện của tôi để dùng
 * offline, rồi `onUse` thêm vào video tại đầu phát.
 */
export function OnlineGrid({
  source,
  onUse,
}: {
  source: OnlineSource
  onUse: (item: MemeItem) => Promise<void>
}) {
  const { t } = useTranslation()
  const hasKey = useAppStore((s) => s.secrets?.pixabay?.state === 'saved')
  const setPage = useAppStore((s) => s.setPage)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<OnlineItem[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [attribution, setAttribution] = useState('')
  const [loading, setLoading] = useState(hasKey)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, MemeItem>>({})
  const errorText = useErrorText()
  const request = useRef(0)

  const apply = (result: OnlineSearch, page: string | null) => {
    setItems((old) => (page ? [...old, ...result.items] : result.items))
    setNext(result.next)
    setAttribution(result.attribution)
  }

  const search = async (query: string, page: string | null) => {
    const id = ++request.current
    setLoading(true)
    setError(null)
    try {
      const result = await lumora().onlineSearch(source, query, page)
      if (id === request.current) apply(result, page)
    } catch (e) {
      if (id === request.current) setError(errorText(e))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }

  // Mở nguồn này (hoặc vừa nhập key): tải danh sách nổi bật. Lưới được tạo mới khi đổi nguồn.
  useEffect(() => {
    if (!hasKey) return
    const id = ++request.current
    lumora()
      .onlineSearch(source, '', null)
      .then((result) => id === request.current && apply(result, null))
      .catch((e) => id === request.current && setError(errorText(e)))
      .finally(() => id === request.current && setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi đổi nguồn / key
  }, [source, hasKey])

  // Đánh dấu các mục đã tải trước đó (đã có trong thư viện của tôi).
  useEffect(() => {
    void lumora()
      .listMemes()
      .then((list) => {
        const map: Record<string, MemeItem> = {}
        for (const m of list) if (m.origin) map[`${m.origin.source}:${m.origin.id}`] = m
        setDone(map)
      })
      .catch(() => undefined)
  }, [])

  const use = async (item: OnlineItem) => {
    const key = `${item.source}:${item.id}`
    setError(null)
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const meme = done[key] ?? (await lumora().onlineDownload(item.source, item.id))
      setDone((d) => ({ ...d, [key]: meme }))
      await onUse(meme)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  if (!hasKey)
    return (
      <EmptyState
        icon={KeyRound}
        title={t('editor.library.noKey.pixabay')}
        text={t('editor.library.noKeyText')}
        action={
          <button
            type="button"
            data-testid="online-open-settings"
            onClick={() => setPage('settings')}
            className="mt-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg"
          >
            {t('editor.library.openSettings')}
          </button>
        }
      />
    )

  return (
    <div className="flex flex-col gap-3" data-testid="online-grid">
      <SearchBox
        value={q}
        placeholder={t(`editor.library.searchPlaceholder.${source}`)}
        testId="online-search"
        onSearch={(query) => {
          setQ(query)
          void search(query, null)
        }}
      />
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS[source].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQ(s)
              void search(s, null)
            }}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              q === s
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <ErrorNote text={error} />
      {items.length === 0 && !loading && !error ? (
        <EmptyState
          icon={CloudOff}
          title={t('editor.library.noResults')}
          text={t('editor.library.noResultsText')}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((item) => {
            const key = `${item.source}:${item.id}`
            return (
              <ResultCard
                key={key}
                item={item}
                state={busy[key] ? 'busy' : done[key] ? 'done' : 'idle'}
                onClick={() => void use(item)}
              />
            )
          })}
        </div>
      )}
      {loading && (
        <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t('editor.library.searching')}
        </p>
      )}
      {next && !loading && (
        <button
          type="button"
          data-testid="online-more"
          onClick={() => void search(q, next)}
          className="rounded-md border border-border py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
        >
          {t('editor.library.more')}
        </button>
      )}
      {attribution && (
        <p
          className="text-center text-[10px] uppercase tracking-wider text-muted"
          data-testid="online-attribution"
        >
          {attribution}
        </p>
      )}
    </div>
  )
}
