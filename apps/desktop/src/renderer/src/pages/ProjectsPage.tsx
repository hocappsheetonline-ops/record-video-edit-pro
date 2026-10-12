import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Clock, Download, FolderOpen, Share2, Trash2, Wand2 } from 'lucide-react'
import { formatDuration, TRACK_KINDS, type Project } from '@lumora/core'
import type { PackMode, ProjectSummary } from '@shared/ipc'
import { lumora } from '../api'
import { PageHeader } from '../components/PageHeader'
import { SegmentPlayer } from '../components/SegmentPlayer'
import { mediaUrl } from '../lib/media'
import { ipcErrorMessage } from '../lib/prefs'
import { useAppStore } from '../store/app'

function formatDate(iso: string, language: string) {
  return new Date(iso).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const actionButton =
  'flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2'

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)

/** Đóng gói dự án để gửi cho người khác chỉnh sửa (gói đầy đủ lần đầu, sau đó chỉ bản chỉnh sửa). */
function SharePanel({ folder }: { folder: string }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<PackMode | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const share = async (mode: PackMode) => {
    setBusy(mode)
    setError(null)
    setResult(null)
    try {
      const r = await lumora().sharePack(folder, mode)
      if (r) {
        const name = r.path.split(/[\\/]/).pop()
        setResult(t('projects.share.saved', { name, size: megabytes(r.bytes) }))
      }
    } catch (e) {
      setError(t('projects.share.error', { message: ipcErrorMessage(e) }))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div
      className="mb-4 rounded-xl border border-border bg-surface p-4 text-sm"
      data-testid="share-panel"
    >
      <p className="mb-3 text-muted">{t('projects.share.intro')}</p>
      <div className="flex flex-wrap gap-2">
        {(['full', 'edits'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            data-testid={`share-${mode}`}
            disabled={busy !== null}
            onClick={() => void share(mode)}
            className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left disabled:opacity-50 ${mode === 'full' ? 'border-accent bg-accent/10' : 'border-border'}`}
          >
            <span className="font-medium">
              {busy === mode ? t('projects.share.working') : t(`projects.share.${mode}`)}
            </span>
            <span className="text-xs text-muted">{t(`projects.share.${mode}Hint`)}</span>
          </button>
        ))}
      </div>
      {result && (
        <p className="mt-3 text-success" data-testid="share-result">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function ProjectDetail({ folder, onDeleted }: { folder: string; onDeleted: () => void }) {
  const { t, i18n } = useTranslation()
  const showProject = useAppStore((s) => s.showProject)
  const openEditor = useAppStore((s) => s.openEditor)
  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    void lumora().getProject(folder).then(setProject)
  }, [folder])

  if (project === undefined) return null
  const back = (
    <button
      type="button"
      onClick={() => showProject(null)}
      className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-text"
    >
      <ArrowLeft size={16} aria-hidden />
      {t('projects.back')}
    </button>
  )
  if (!project) {
    return (
      <div className="p-8">
        {back}
        <p role="alert" className="text-danger">
          {t('projects.notFound')}
        </p>
      </div>
    )
  }

  const segment = project.segments[segmentIndex] ?? project.segments[0]
  const remove = async () => {
    if (!window.confirm(t('projects.confirmDelete', { name: project.name }))) return
    await lumora().deleteProject(folder)
    onDeleted()
  }

  return (
    <div className="max-w-5xl p-8" data-testid="project-detail">
      {back}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="project-name">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(project.createdAt, i18n.language)} · {formatDuration(project.durationMs)} ·{' '}
            {t(`projects.sources.${project.source.kind}`)} · {project.fps} fps
            {project.encoder ? ` · ${project.encoder}` : ''}
            {project.cursorHidden ? ` · ${t('projects.cursorHidden')}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="open-editor"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
            onClick={() => openEditor(folder)}
          >
            <Wand2 size={16} aria-hidden />
            {t('projects.edit')}
          </button>
          <button
            type="button"
            className={actionButton}
            onClick={() => void lumora().revealProject(folder)}
          >
            <FolderOpen size={16} aria-hidden />
            {t('projects.reveal')}
          </button>
          <button
            type="button"
            data-testid="share-open"
            aria-expanded={sharing}
            className={actionButton}
            onClick={() => setSharing((v) => !v)}
          >
            <Share2 size={16} aria-hidden />
            {t('projects.share.button')}
          </button>
          <button
            type="button"
            className={`${actionButton} text-danger`}
            onClick={() => void remove()}
          >
            <Trash2 size={16} aria-hidden />
            {t('projects.delete')}
          </button>
        </div>
      </div>

      {sharing && <SharePanel folder={folder} />}

      {project.segments.length > 1 && (
        <div className="mb-3 flex gap-1" role="tablist">
          {project.segments.map((s, i) => (
            <button
              key={s.index}
              type="button"
              role="tab"
              aria-selected={i === segmentIndex}
              onClick={() => setSegmentIndex(i)}
              className={`rounded-md px-3 py-1 text-sm ${
                i === segmentIndex
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface-2 text-muted hover:text-text'
              }`}
            >
              {t('projects.segment', { n: i + 1 })} · {formatDuration(s.endedAt - s.startedAt)}
            </button>
          ))}
        </div>
      )}

      {segment && <SegmentPlayer key={segment.index} folder={folder} segment={segment} />}

      {segment && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted" data-testid="track-list">
          {TRACK_KINDS.filter((k) => segment.tracks[k]).map((k) => (
            <li key={k} className="rounded-full bg-surface-2 px-2.5 py-1">
              {t(`projects.tracks.${k}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const openProject = useAppStore((s) => s.openProject)
  const showProject = useAppStore((s) => s.showProject)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)

  const reload = useCallback(() => void lumora().listProjects().then(setProjects), [])
  const [importMessage, setImportMessage] = useState<{ text: string; error: boolean } | null>(null)
  const importShared = async () => {
    setImportMessage(null)
    try {
      const r = await lumora().importPack()
      if (!r) return
      reload()
      setImportMessage({ text: t(`projects.import.${r.status}`), error: false })
      if (r.status === 'created') showProject(r.folder)
    } catch (e) {
      const code = ipcErrorMessage(e)
      setImportMessage({
        text:
          code === 'pack_invalid' || code === 'pack_needs_full'
            ? t(`projects.import.${code}`)
            : t('projects.share.error', { message: code }),
        error: true,
      })
    }
  }
  useEffect(() => {
    if (!openProject) reload()
  }, [openProject, reload])

  if (openProject) {
    return <ProjectDetail folder={openProject} onDeleted={() => showProject(null)} />
  }

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t('projects.title')} description={t('projects.description')} />
        <button
          type="button"
          data-testid="import-pack"
          className={actionButton}
          onClick={() => void importShared()}
        >
          <Download size={16} aria-hidden />
          {t('projects.import.button')}
        </button>
      </div>
      {importMessage && (
        <p
          role={importMessage.error ? 'alert' : 'status'}
          data-testid="import-result"
          className={`mb-4 rounded-lg border p-3 text-sm ${importMessage.error ? 'border-danger/40 text-danger' : 'border-success/40 text-success'}`}
        >
          {importMessage.text}
        </p>
      )}
      {projects && projects.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
          {t('projects.empty')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {projects?.map((p) => (
          <button
            key={p.folder}
            type="button"
            onClick={() => showProject(p.folder)}
            data-testid="project-card"
            className="group overflow-hidden rounded-xl border border-border bg-surface text-left hover:border-accent"
          >
            <div className="relative aspect-video bg-black">
              {p.hasThumbnail && (
                <img
                  src={mediaUrl(p.folder, 'thumbnail.jpg')}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-xs text-white">
                <Clock size={12} aria-hidden />
                {formatDuration(p.durationMs)}
              </span>
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted">
                {formatDate(p.createdAt, i18n.language)} · {t(`projects.sources.${p.sourceKind}`)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
