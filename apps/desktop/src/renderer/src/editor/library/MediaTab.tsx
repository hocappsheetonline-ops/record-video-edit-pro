import { useEffect, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, ImagePlus, Loader2, Plus, Upload, Volume2, X } from 'lucide-react'
import type { MemeItem, OnlineSource } from '@shared/ipc'
import { lumora } from '../../api'
import { useEditorStore } from '../store'
import { ghostButton, primaryButton, Segmented } from '../ui'
import { EmptyState, ErrorNote, formatDuration, useErrorText } from './common'
import { OnlineGrid } from './OnlineGrid'

/** Thư viện video / ảnh / GIF meme của riêng bạn (kéo thả để thêm). */
function MyLibrary() {
  const { t } = useTranslation()
  const folder = useEditorStore((s) => s.folder)
  const [memes, setMemes] = useState<MemeItem[]>([])
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const errorText = useErrorText()

  useEffect(() => {
    void lumora()
      .listMemes()
      .then(setMemes)
      .catch(() => setMemes([]))
  }, [])

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(errorText(e))
      // Một số file có thể đã thêm xong trước khi gặp file lỗi.
      setMemes(
        await lumora()
          .listMemes()
          .catch(() => memes),
      )
    } finally {
      setBusy(false)
    }
  }
  const use = (m: MemeItem) =>
    folder &&
    void run(async () =>
      useEditorStore.getState().addMediaOverlay(await lumora().useMeme(folder, m.file)),
    )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => lumora().pathForFile(f))
      .filter(Boolean)
    if (paths.length > 0) void run(async () => setMemes(await lumora().addMemePaths(paths)))
  }

  const shown = memes.filter((m) => filter === 'all' || m.kind === filter)
  return (
    <div
      className="relative flex flex-1 flex-col gap-3"
      data-testid="media-tab"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="meme-import"
          disabled={busy}
          className={`${primaryButton} flex-1`}
          onClick={() => void run(async () => setMemes(await lumora().importMemes()))}
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Upload size={15} aria-hidden />
          )}
          {busy ? t('editor.library.processing') : t('editor.library.import')}
        </button>
        <button
          type="button"
          data-testid="overlay-add-image"
          disabled={busy}
          data-tooltip={t('editor.library.addToProject')}
          aria-label={t('editor.library.addToProject')}
          className={ghostButton}
          onClick={() =>
            folder &&
            void run(async () => {
              const asset = await lumora().addImageFile(folder)
              if (asset) useEditorStore.getState().addMediaOverlay(asset)
            })
          }
        >
          <ImagePlus size={15} aria-hidden />
        </button>
      </div>
      <Segmented
        options={(['all', 'video', 'image'] as const).map((f) => ({
          value: f,
          label: t(`editor.library.filters.${f}`),
        }))}
        value={filter}
        onChange={setFilter}
        testIdPrefix="media-filter-"
      />
      <ErrorNote text={error} />
      {shown.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title={t('editor.library.emptyTitle')}
          text={t('editor.library.empty')}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((m) => (
            <div key={m.file} className="group relative">
              <button
                type="button"
                data-testid="meme-item"
                data-kind={m.kind}
                data-tooltip={t('editor.library.clickToAdd')}
                disabled={busy}
                onClick={() => use(m)}
                className="flex w-full flex-col gap-1 rounded-lg p-1 text-left hover:bg-surface-2"
              >
                <span className="relative block aspect-video w-full overflow-hidden rounded-md bg-black">
                  {m.thumb && (
                    <img
                      src={m.thumb}
                      alt={m.name}
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  )}
                  {m.kind === 'video' && (
                    <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">
                      {m.hasAudio && <Volume2 size={10} aria-hidden />}
                      {formatDuration(m.durationMs)}
                    </span>
                  )}
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex">
                    <span className="rounded-full bg-accent p-1.5 text-accent-fg shadow-lg">
                      <Plus size={16} aria-hidden />
                    </span>
                  </span>
                </span>
                <span className="truncate px-0.5 text-[11px] text-muted">{m.name}</span>
              </button>
              <button
                type="button"
                aria-label={t('editor.library.remove')}
                data-tooltip={t('editor.library.remove')}
                onClick={() => void run(async () => setMemes(await lumora().removeMeme(m.file)))}
                className="absolute right-2 top-2 hidden rounded bg-black/70 p-0.5 text-white hover:bg-danger group-hover:block"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-muted">{t('editor.library.tips')}</p>
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
          {t('editor.library.drop')}
        </div>
      )}
    </div>
  )
}

type MediaSource = 'mine' | Extract<OnlineSource, 'tenor' | 'pixabayVideo' | 'pixabayImage'>

/** Thêm meme đã có trong thư viện của tôi vào video tại đầu phát. */
export async function addLibraryItem(meme: MemeItem) {
  const folder = useEditorStore.getState().folder
  if (!folder) return
  useEditorStore.getState().addMediaOverlay(await lumora().useMeme(folder, meme.file))
}

/** Mục Meme: thư viện của tôi, kho meme Tenor, video / ảnh miễn phí Pixabay. */
export function MediaTab() {
  const { t } = useTranslation()
  const [source, setSource] = useState<MediaSource>('mine')
  return (
    <div className="flex min-h-full flex-col gap-3 p-3">
      <Segmented
        options={(['mine', 'tenor', 'pixabayVideo', 'pixabayImage'] as const).map((s) => ({
          value: s,
          label: t(`editor.library.sources.${s}`),
        }))}
        value={source}
        onChange={setSource}
        testIdPrefix="media-source-"
      />
      {source === 'mine' ? (
        <MyLibrary />
      ) : (
        <OnlineGrid key={source} source={source} onUse={addLibraryItem} />
      )}
    </div>
  )
}
