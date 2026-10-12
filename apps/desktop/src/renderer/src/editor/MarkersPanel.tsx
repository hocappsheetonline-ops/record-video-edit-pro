import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, FileText, Flag, Trash2 } from 'lucide-react'
import { chaptersText, MARKER_COLORS } from '@lumora/core'
import type { ExportResult } from '@shared/ipc'
import { lumora } from '../api'
import { useEditorStore } from './store'
import { formatTimecode } from './timeline-math'
import { ghostButton, primaryButton, Section } from './ui'

/** Cài đặt video → Marker: danh sách marker, đổi tên / màu, xóa; xuất chương YouTube. */
export function MarkersPanel() {
  const { t } = useTranslation()
  const markers = useEditorStore((s) => s.edit?.markers ?? [])
  const folder = useEditorStore((s) => s.folder)
  const project = useEditorStore((s) => s.project)
  const [saved, setSaved] = useState<ExportResult | null>(null)
  const [copied, setCopied] = useState(false)
  const s = useEditorStore.getState()
  const chapters = () =>
    chaptersText(markers, {
      intro: t('editor.markers.intro'),
      part: (n) => t('editor.markers.part', { n }),
    })
  return (
    <>
      <Section title={t('editor.markers.title')} testId="markers-panel">
        <button
          type="button"
          className={primaryButton}
          data-testid="marker-add"
          onClick={() => s.addMarkerAtPlayhead()}
        >
          <Flag size={15} aria-hidden />
          {t('editor.markers.add')}
        </button>
        {markers.length === 0 ? (
          <p className="text-xs text-muted">{t('editor.markers.empty')}</p>
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid="marker-list">
            {markers.map((m) => (
              <li key={m.id} className="flex items-center gap-1.5" data-testid="marker-row">
                <button
                  type="button"
                  aria-label={t('editor.markers.color')}
                  data-tooltip={t('editor.markers.color')}
                  onClick={() => {
                    const i = MARKER_COLORS.indexOf(m.color)
                    s.updateMarker(m.id, { color: MARKER_COLORS[(i + 1) % MARKER_COLORS.length]! })
                  }}
                  className="size-3.5 shrink-0 rounded-full"
                  style={{ background: m.color }}
                />
                <button
                  type="button"
                  className="w-14 shrink-0 font-mono text-[11px] text-muted hover:text-text"
                  onClick={() => s.setTime(m.t)}
                >
                  {formatTimecode(m.t)}
                </button>
                <input
                  value={m.label}
                  placeholder={t('editor.markers.placeholder')}
                  aria-label={t('editor.markers.rename')}
                  data-testid="marker-label"
                  maxLength={100}
                  onChange={(e) =>
                    s.updateMarker(m.id, { label: e.target.value }, `marker-label-${m.id}`)
                  }
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  aria-label={t('editor.menu.delete')}
                  data-tooltip={t('editor.menu.delete')}
                  data-testid="marker-delete"
                  onClick={() => s.removeMarker(m.id)}
                  className="rounded p-1 text-muted hover:bg-danger/15 hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[11px] text-muted">{t('editor.markers.hint')}</p>
      </Section>
      {markers.length > 0 && (
        <Section title={t('editor.markers.chapters')} testId="chapters">
          <pre
            className="whitespace-pre-wrap rounded-md bg-surface-2 p-2 font-mono text-[11px]"
            data-testid="chapters-text"
          >
            {chapters()}
          </pre>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={ghostButton}
              data-testid="chapters-copy"
              onClick={() => {
                void navigator.clipboard?.writeText(chapters()).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              <Copy size={13} aria-hidden />
              {copied ? t('editor.markers.copied') : t('editor.markers.copy')}
            </button>
            <button
              type="button"
              className={ghostButton}
              data-testid="chapters-save"
              disabled={!folder || !project}
              onClick={() =>
                folder &&
                project &&
                void lumora()
                  .saveExportText(folder, `${project.name}.chapters.txt`, chapters())
                  .then(setSaved)
              }
            >
              <FileText size={13} aria-hidden />
              {t('editor.markers.save')}
            </button>
          </div>
          {saved && (
            <p className="text-xs text-success" data-testid="chapters-saved">
              {t('editor.export.done', { file: saved.fileName })}
            </p>
          )}
          <p className="text-[11px] text-muted">{t('editor.markers.chaptersHint')}</p>
        </Section>
      )}
    </>
  )
}
