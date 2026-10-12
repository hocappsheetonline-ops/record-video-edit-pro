import { useEffect, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clapperboard,
  Combine,
  Film,
  FolderPlus,
  ImagePlus,
  Loader2,
  Plus,
  Volume2,
  X,
} from 'lucide-react'
import type { MemeItem, OnlineSource, ProjectSummary } from '@shared/ipc'
import { lumora } from '../../api'
import { runJob, useJobs } from '../jobs'
import { dragProps } from '../library-drag'
import { useEditorStore } from '../store'
import { ghostButton, primaryButton } from '../ui'
import { EmptyState, ErrorNote, formatDuration, SubNav, useErrorText } from './common'
import { OnlineGrid } from './OnlineGrid'

/** Thư viện ảnh / GIF / video ngắn của riêng bạn (kéo thả để thêm), dùng làm lớp phủ. */
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
          data-tooltip={t('editor.library.importHint')}
          className={`${ghostButton} flex-1`}
          onClick={() => void run(async () => setMemes(await lumora().importMemes()))}
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <ImagePlus size={15} aria-hidden />
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
          <FolderPlus size={15} aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap gap-1" role="radiogroup">
        {(['all', 'video', 'image'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            data-testid={`media-filter-${f}`}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-2.5 py-0.5 text-[11px] ${
              filter === f
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {t(`editor.library.filters.${f}`)}
          </button>
        ))}
      </div>
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
                {...dragProps({ kind: 'meme', file: m.file })}
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

type MediaSource = 'mine' | OnlineSource

/** Thêm mục đã có trong thư viện của tôi vào video tại đầu phát. */
export async function addLibraryItem(meme: MemeItem) {
  const folder = useEditorStore.getState().folder
  if (!folder) return
  useEditorStore.getState().addMediaOverlay(await lumora().useMeme(folder, meme.file))
}

/**
 * Nhập video từ máy để chỉnh sửa (như nút Nhập của CapCut): video được chuẩn hóa rồi nối vào
 * hàng Video làm clip chính — cắt, tách, đổi tốc độ, lọc màu như bản quay.
 */
function ImportVideoButton() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const ok = await runJob(t('editor.jobs.importVideo'), () =>
        useEditorStore.getState().importVideo(),
      )
      if (ok) useJobs.getState().toast({ kind: 'success', text: t('editor.jobs.importedVideo') })
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(
        m.includes('import_no_video')
          ? t('editor.library.importNoVideo')
          : m.includes('import_too_long')
            ? t('editor.library.importTooLong')
            : t('editor.library.importFailed'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="import-video"
        disabled={busy}
        data-tooltip={t('editor.library.importVideoHint')}
        onClick={() => void run()}
        className={`${primaryButton} w-full px-2 text-xs`}
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Film size={14} aria-hidden />
        )}
        {busy ? t('editor.library.importingVideo') : t('editor.library.importVideo')}
      </button>
      <ErrorNote text={error} />
    </div>
  )
}

/** Ghép một bản quay khác (trong Dự án) vào cuối video. */
function MergeProjectButton() {
  const { t } = useTranslation()
  const folder = useEditorStore((s) => s.folder)
  const [list, setList] = useState<ProjectSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = async () => {
    setError(null)
    if (list) {
      setList(null)
      return
    }
    const all = await lumora()
      .listProjects()
      .catch(() => [])
    setList(all.filter((p) => p.folder !== folder))
  }
  const merge = async (other: string) => {
    setBusy(true)
    setError(null)
    try {
      await runJob(t('editor.jobs.merge'), () => useEditorStore.getState().mergeProject(other))
      useJobs.getState().toast({ kind: 'success', text: t('editor.jobs.merged') })
      setList(null)
    } catch {
      setError(t('editor.library.mergeFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="merge-open"
        disabled={busy}
        aria-expanded={list !== null}
        onClick={() => void open()}
        className={`${ghostButton} w-full px-2`}
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Combine size={14} aria-hidden />
        )}
        {busy ? t('editor.library.merging') : t('editor.library.merge')}
      </button>
      {list && (
        <div
          className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border"
          data-testid="merge-list"
        >
          {list.length === 0 ? (
            <p className="p-2 text-[11px] text-muted">{t('editor.library.mergeEmpty')}</p>
          ) : (
            list.map((p) => (
              <button
                key={p.folder}
                type="button"
                data-testid="merge-project"
                disabled={busy}
                onClick={() => void merge(p.folder)}
                className="flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-surface-2"
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {formatDuration(p.durationMs)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      <ErrorNote text={error} />
    </div>
  )
}

/**
 * Mục Phương tiện (kiểu CapCut): nhập video để chỉnh sửa, ghép bản quay khác, thư viện ảnh /
 * video ngắn của tôi, và video / ảnh miễn phí Pixabay.
 */
export function MediaTab() {
  const { t } = useTranslation()
  const [source, setSource] = useState<MediaSource>('mine')
  return (
    <div className="flex min-h-full flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <ImportVideoButton />
        <MergeProjectButton />
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <SubNav
          items={(['mine', 'pixabayVideo', 'pixabayImage'] as const).map((s) => ({
            value: s,
            label: t(`editor.library.sources.${s}`),
          }))}
          value={source}
          onChange={setSource}
          testIdPrefix="media-source-"
          label={t('editor.library.tabs.media')}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {source === 'mine' ? (
            <MyLibrary />
          ) : (
            <OnlineGrid key={source} source={source} onUse={addLibraryItem} />
          )}
        </div>
      </div>
    </div>
  )
}
