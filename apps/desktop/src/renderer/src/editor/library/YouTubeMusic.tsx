import { useEffect, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Music2,
  Plus,
  Upload,
  X,
  SquarePlay,
} from 'lucide-react'
import type { MusicTrack, RecentDownload } from '@shared/ipc'
import { lumora } from '../../api'
import { useEditorStore } from '../store'
import { ghostButton, primaryButton } from '../ui'
import { EmptyState, ErrorNote, formatDuration, SearchBox, useErrorText } from './common'

/** Quét thư mục Tải về mỗi vài giây khi đang mở mục này (file vừa tải từ YouTube hiện ngay). */
const POLL_MS = 3000

/**
 * Nhạc nền từ Thư viện âm thanh YouTube (YouTube Studio, nhạc miễn phí bản quyền). Thư viện này
 * không có API công khai nên luồng là: mở trang trong trình duyệt → bấm Tải về ở bài muốn dùng →
 * file xuất hiện ở đây → một bấm để đưa vào kho nhạc và đặt lên timeline. Kho nhạc dùng lại ở
 * mọi dự án; cũng nhận file nhạc trên máy (kéo thả hoặc chọn).
 */
export function YouTubeMusic() {
  const { t } = useTranslation()
  const folder = useEditorStore((s) => s.folder)
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [recent, setRecent] = useState<RecentDownload[]>([])
  const [addedPaths, setAddedPaths] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const errorText = useErrorText()

  useEffect(() => {
    void lumora()
      .listMusic()
      .then(setTracks)
      .catch(() => setTracks([]))
  }, [])

  useEffect(() => {
    let alive = true
    const scan = () =>
      void lumora()
        .recentAudioDownloads()
        .then((list) => alive && setRecent(list))
        .catch(() => undefined)
    scan()
    const timer = setInterval(scan, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  /** File vừa tải: đưa vào kho nhạc rồi đặt lên timeline tại đầu phát. */
  const addDownload = (d: RecentDownload) =>
    run(d.path, async () => {
      const list = await lumora().addMusicPaths([d.path], 'youtube')
      setTracks(list)
      setAddedPaths((s) => new Set(s).add(d.path))
      const newest = list[0]
      if (newest && folder) await useEditorStore.getState().addMusicFromLibrary(newest.file)
    })

  const pickTrack = (track: MusicTrack) =>
    folder && void run(track.file, () => useEditorStore.getState().addMusicFromLibrary(track.file))

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => lumora().pathForFile(f))
      .filter(Boolean)
    if (paths.length > 0)
      void run('drop', async () => setTracks(await lumora().addMusicPaths(paths, 'file')))
  }

  const shown = tracks.filter(
    (m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()),
  )

  return (
    <div
      className="relative flex flex-col gap-3"
      data-testid="youtube-music"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        data-testid="youtube-open"
        className={primaryButton}
        onClick={() => void lumora().openYouTubeAudioLibrary()}
      >
        <SquarePlay size={15} aria-hidden />
        {t('editor.youtube.open')}
        <ExternalLink size={12} aria-hidden className="opacity-70" />
      </button>
      <ol className="flex flex-col gap-1 rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
        <li>{t('editor.youtube.step1')}</li>
        <li>{t('editor.youtube.step2')}</li>
        <li>{t('editor.youtube.step3')}</li>
      </ol>
      <ErrorNote text={error} />

      <section className="flex flex-col gap-1.5">
        <h4 className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Download size={13} aria-hidden className="text-muted" />
          {t('editor.youtube.recent')}
        </h4>
        {recent.length === 0 ? (
          <p className="text-[11px] text-muted" data-testid="youtube-recent-empty">
            {t('editor.youtube.recentEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {recent.map((d) => {
              const added = addedPaths.has(d.path)
              return (
                <li key={d.path} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <Music2 size={13} aria-hidden className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate" title={d.path}>
                    {d.name}
                    <span className="ml-1 text-[10px] text-muted">
                      {(d.bytes / 1_000_000).toFixed(1)} MB
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid="youtube-recent-add"
                    disabled={busy !== null || added}
                    onClick={() => void addDownload(d)}
                    className={`${ghostButton} py-1 ${added ? 'text-success' : ''}`}
                  >
                    {busy === d.path ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : added ? (
                      <Check size={12} aria-hidden />
                    ) : (
                      <Plus size={12} aria-hidden />
                    )}
                    {added ? t('editor.youtube.added') : t('editor.youtube.add')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-semibold">{t('editor.youtube.library')}</h4>
          <button
            type="button"
            data-testid="music-import"
            disabled={busy !== null}
            data-tooltip={t('editor.youtube.importHint')}
            onClick={() => void run('import', async () => setTracks(await lumora().importMusic()))}
            className={`${ghostButton} py-1`}
          >
            <Upload size={12} aria-hidden />
            {t('editor.youtube.import')}
          </button>
        </div>
        {tracks.length > 3 && (
          <SearchBox
            value={q}
            placeholder={t('editor.youtube.search')}
            testId="music-search"
            onSearch={setQ}
          />
        )}
        {tracks.length === 0 ? (
          <EmptyState
            icon={Music2}
            title={t('editor.youtube.libraryEmptyTitle')}
            text={t('editor.youtube.libraryEmpty')}
          />
        ) : shown.length === 0 ? (
          <p className="text-[11px] text-muted">{t('editor.library.noResults')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {shown.map((m) => (
              <li key={m.file} className="group flex items-center gap-2 px-2 py-1.5 text-xs">
                <button
                  type="button"
                  data-testid="music-item"
                  data-source={m.source}
                  disabled={busy !== null}
                  data-tooltip={t('editor.library.clickToAdd')}
                  onClick={() => pickTrack(m)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent"
                >
                  {m.source === 'youtube' ? (
                    <SquarePlay size={13} aria-hidden className="shrink-0 text-danger" />
                  ) : (
                    <Music2 size={13} aria-hidden className="shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {formatDuration(m.durationMs)}
                  </span>
                  {busy === m.file ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                  ) : (
                    <Plus size={12} aria-hidden className="opacity-0 group-hover:opacity-100" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t('editor.youtube.remove')}
                  data-tooltip={t('editor.youtube.remove')}
                  data-testid="music-remove"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(`rm-${m.file}`, async () =>
                      setTracks(await lumora().removeMusic(m.file)),
                    )
                  }
                  className="rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] leading-relaxed text-muted">{t('editor.youtube.attribution')}</p>
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
          {t('editor.youtube.drop')}
        </div>
      )}
    </div>
  )
}
