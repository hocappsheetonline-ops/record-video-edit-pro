import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  AudioLines,
  Frame,
  MousePointer2,
  Move,
  SlidersHorizontal,
  Trash2,
  Video,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'
import {
  AudioClipProps,
  ClipProps,
  EffectProps,
  OverlayProps,
  TransitionProps,
  ZoomProps,
} from './ItemProps'
import {
  AudioMixProps,
  CameraProps,
  CursorProps,
  FrameProps,
  MotionProps,
  PROJECT_TABS,
  ZoomProjectProps,
  type ProjectTab,
} from './ProjectProps'
import { AdjustPanel } from './LookPanels'
import { useEditorStore } from './store'

const TAB_ICONS: Record<ProjectTab, LucideIcon> = {
  frame: Frame,
  camera: Video,
  cursor: MousePointer2,
  motion: Move,
  zoom: ZoomIn,
  audio: AudioLines,
  adjust: SlidersHorizontal,
}

/**
 * Bảng thuộc tính bên phải (kiểu CapCut / Premiere): chọn một mục trên timeline hoặc khung xem
 * trước thì hiện thuộc tính của mục đó; không chọn gì thì hiện cài đặt chung của video.
 */
export function PropertiesPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  const [tab, setTab] = useState<ProjectTab>('frame')
  const { select, deleteSelection } = useEditorStore.getState()
  if (!edit) return null

  // Bấm vào webcam trên khung xem trước: mở thẳng phần Webcam.
  const projectTab: ProjectTab = selection?.kind === 'camera' ? 'camera' : tab
  const item = (() => {
    if (!selection || selection.kind === 'camera') return null
    switch (selection.kind) {
      case 'clip': {
        const index = edit.clips.findIndex((c) => c.id === selection.id)
        return index < 0
          ? null
          : {
              title: t('editor.props.clip'),
              body: <ClipProps clip={edit.clips[index]!} index={index} />,
              deletable: edit.clips.length > 1,
            }
      }
      case 'zoom': {
        const zoom = edit.zooms.find((z) => z.id === selection.id)
        return zoom
          ? { title: t('editor.props.zoom'), body: <ZoomProps zoom={zoom} />, deletable: true }
          : null
      }
      case 'audio': {
        const clip = edit.audioClips.find((c) => c.id === selection.id)
        return clip
          ? { title: clip.name, body: <AudioClipProps clip={clip} />, deletable: true }
          : null
      }
      case 'transition':
        return edit.clips.some((c) => c.id === selection.id)
          ? {
              title: t('editor.props.transition'),
              body: <TransitionProps afterClip={selection.id} edit={edit} />,
              deletable: edit.transitions.some((x) => x.afterClip === selection.id),
            }
          : null
      case 'effect': {
        const effect = edit.effects.find((x) => x.id === selection.id)
        return effect
          ? {
              title: t(`editor.effects.kinds.${effect.kind}`),
              body: <EffectProps effect={effect} />,
              deletable: true,
            }
          : null
      }
      case 'overlay': {
        const overlay = edit.overlays.find((o) => o.id === selection.id)
        return overlay
          ? {
              title:
                overlay.kind === 'text'
                  ? t('editor.props.text')
                  : overlay.kind === 'emoji'
                    ? t('editor.props.sticker')
                    : overlay.text || t(`editor.props.${overlay.kind}`),
              body: (
                <div data-testid="overlay-selected">
                  <OverlayProps overlay={overlay} />
                </div>
              ),
              deletable: true,
            }
          : null
      }
    }
  })()

  if (item) {
    return (
      <div className="flex h-full flex-col" data-testid="properties">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
          <button
            type="button"
            aria-label={t('editor.props.back')}
            title={t('editor.props.back')}
            data-testid="props-back"
            onClick={() => select(null)}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="props-title">
            {item.title}
          </h2>
          {item.deletable && (
            <button
              type="button"
              aria-label={t('editor.delete')}
              data-tooltip={t('editor.delete')}
              data-shortcut="Delete"
              data-testid="props-delete"
              onClick={deleteSelection}
              className="rounded-md p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{item.body}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-testid="properties">
      <div
        className="grid shrink-0 grid-cols-6 border-b border-border"
        role="tablist"
        aria-label={t('editor.props.project')}
      >
        {PROJECT_TABS.map((name) => {
          const Icon = TAB_ICONS[name]
          const active = projectTab === name
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`tab-${name}`}
              data-tooltip={t(`editor.tabs.${name}`)}
              aria-label={t(`editor.tabs.${name}`)}
              onClick={() => {
                setTab(name)
                if (selection?.kind === 'camera') select(null)
              }}
              className={`flex h-11 items-center justify-center border-b-2 transition-colors ${
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </button>
          )
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid={`props-${projectTab}`}>
        {projectTab === 'frame' && <FrameProps edit={edit} />}
        {projectTab === 'camera' && <CameraProps edit={edit} />}
        {projectTab === 'cursor' && <CursorProps edit={edit} />}
        {projectTab === 'motion' && <MotionProps edit={edit} />}
        {projectTab === 'zoom' && <ZoomProjectProps edit={edit} />}
        {projectTab === 'audio' && <AudioMixProps edit={edit} />}
        {projectTab === 'adjust' && <AdjustPanel />}
      </div>
    </div>
  )
}
