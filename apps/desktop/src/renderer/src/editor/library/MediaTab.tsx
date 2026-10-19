import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clapperboard,
  Combine,
  Eye,
  Film,
  FolderPlus,
  ImagePlus,
  Loader2,
  MonitorPlay,
  Plus,
  Volume2,
  X,
} from 'lucide-react'
import { sourceSegments, thumbAt } from '@lumora/core'
import type { MemeItem, OnlineSource, ProjectSummary } from '@shared/ipc'
import { lumora } from '../../api'
import { runJob, useJobs } from '../jobs'
import { dragProps } from '../library-drag'
import { useEditorStore } from '../store'
import { ghostButton, primaryButton } from '../ui'
import { libraryUrl, mediaUrl } from '../../lib/media'
import {
  EmptyState,
  ErrorNote,
  formatDuration,
  Heading,
  SubNav,
  useErrorText,
  usePreviewHover,
} from './common'
import { OnlineGrid } from './OnlineGrid'

/** Ô meme: rê chuột là xem thử ngay trên khung xem trước (ảnh / GIF / video), bấm để thêm. */
function MemeCard({
  meme: m,
  busy,
  onUse,
  children,
}: {
  meme: MemeItem
  busy: boolean
  onUse: () => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const hover = usePreviewHover(() => ({
    kind: 'overlay',
    overlay: {
      kind: m.kind,
      file: libraryUrl('memes', m.file),
      text: m.name,
      aspect: m.width / Math.max(1, m.height),
      sourceDuration: m.kind === 'video' ? m.durationMs : 0,
      hasAudio: m.hasAudio,
    },
  }))
  return (
    <div className="group relative">
      <button
        type="button"
        data-testid="meme-item"
        data-kind={m.kind}
        {...dragProps({ kind: 'meme', file: m.file })}
        {...hover.props}
        data-tooltip={t('editor.library.clickToAdd')}
        disabled={busy}
        onClick={() => {
          hover.stop()
          onUse()
        }}
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
          <span
            className="absolute left-1 top-1 hidden items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white group-hover:flex"
            aria-hidden
          >
            <Eye size={9} />
            {t('editor.library.previewing')}
          </span>
        </span>
        <span className="truncate px-0.5 text-[11px] text-muted">{m.name}</span>
      </button>
      {children}
    </div>
  )
}

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
            <MemeCard key={m.file} meme={m} busy={busy} onUse={() => use(m)}>
              <button
                type="button"
                aria-label={t('editor.library.remove')}
                data-tooltip={t('editor.library.remove')}
                onClick={() => void run(async () => setMemes(await lumora().removeMeme(m.file)))}
                className="absolute right-2 top-2 hidden rounded bg-black/70 p-0.5 text-white hover:bg-danger group-hover:block"
              >
                <X size={12} aria-hidden />
              </button>
            </MemeCard>
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

/**
 * Bản quay gốc của dự án (từng đoạn quay / video đã nhập): bấm để thêm lại trọn đoạn vào cuối
 * timeline, kéo để thả vào vị trí muốn. Dùng khi đã xóa hết clip hoặc muốn dùng lại bản quay
 * (như kho media của CapCut: xóa trên timeline không mất file gốc).
 */
function SourceClips() {
  const { t } = useTranslation()
  const project = useEditorStore((s) => s.project)
  const folder = useEditorStore((s) => s.folder)
  const filmstrip = useEditorStore((s) => s.filmstrip)
  const clipCount = useEditorStore((s) => s.edit?.clips.length ?? 0)
  if (!project || !folder) return null
  const segments = sourceSegments(project.segments).filter((x) => x.duration > 0)
  if (segments.length === 0) return null
  const add = (index?: number) => {
    const clip = useEditorStore.getState().addSourceClips(index)
    if (clip) useJobs.getState().toast({ kind: 'success', text: t('editor.library.sourceAdded') })
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="source-clips">
      <Heading>{t('editor.library.sourceTitle')}</Heading>
      {clipCount === 0 && (
        <p className="text-[11px] text-muted" data-testid="source-empty-hint">
          {t('editor.library.sourceEmptyHint')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {segments.map((x) => {
          // Ảnh đại diện: khung hình ở giây thứ 1 của đoạn (lấy từ tấm ghép dải phim).
          const hit = filmstrip
            ? thumbAt(filmstrip, x.offset + Math.min(1000, x.duration / 2))
            : null
          const name =
            x.segment.kind === 'imported'
              ? t('editor.library.sourceImported', { n: x.segment.index + 1 })
              : t('editor.library.sourceSegment', { n: x.segment.index + 1 })
          return (
            <button
              key={x.segment.index}
              type="button"
              data-testid="source-clip"
              data-segment={x.segment.index}
              {...dragProps({ kind: 'source', index: x.segment.index })}
              data-tooltip={t('editor.library.sourceAddHint')}
              onClick={() => add(x.segment.index)}
              className="group flex w-full flex-col gap-1 rounded-lg p-1 text-left hover:bg-surface-2"
            >
              <span className="relative block aspect-video w-full overflow-hidden rounded-md bg-black">
                {hit && filmstrip ? (
                  <span
                    className="absolute inset-0 bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url("${mediaUrl(folder, hit.sheet.file)}")`,
                      // Tấm ghép rộng `columns` ô: phóng cho một ô vừa khít rồi dịch tới đúng ô.
                      backgroundSize: `${hit.sheet.columns * 100}% auto`,
                      backgroundPosition: `${
                        hit.sheet.columns > 1 ? (hit.column * 100) / (hit.sheet.columns - 1) : 0
                      }% ${hit.sheet.rows > 1 ? (hit.row * 100) / (hit.sheet.rows - 1) : 0}%`,
                    }}
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-muted">
                    <MonitorPlay size={20} aria-hidden />
                  </span>
                )}
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">
                  {formatDuration(x.duration)}
                </span>
                <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex">
                  <span className="rounded-full bg-accent p-1.5 text-accent-fg shadow-lg">
                    <Plus size={16} aria-hidden />
                  </span>
                </span>
              </span>
              <span className="truncate px-0.5 text-[11px] text-muted">{name}</span>
            </button>
          )
        })}
      </div>
      {clipCount === 0 && segments.length > 1 && (
        <button
          type="button"
          data-testid="source-add-all"
          className={`${ghostButton} w-full`}
          onClick={() => add()}
        >
          <Film size={14} aria-hidden />
          {t('editor.library.sourceAddAll')}
        </button>
      )}
    </div>
  )
}

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
      <SourceClips />
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
