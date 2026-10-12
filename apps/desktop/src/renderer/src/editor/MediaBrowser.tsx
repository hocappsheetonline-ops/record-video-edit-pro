import { useEffect, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Aperture,
  ArrowLeftRight,
  Camera,
  Captions,
  Clapperboard,
  Contrast,
  Droplets,
  ImagePlus,
  Loader2,
  Music2,
  PartyPopper,
  Plus,
  Smile,
  Sparkles,
  Sun,
  Tv,
  Type,
  Upload,
  Vibrate,
  Volume2,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  cutPoints,
  DEFAULT_TRANSITION_MS,
  EFFECT_KINDS,
  EMOJI_STICKERS,
  SOUND_EFFECT_IDS,
  TEXT_STYLES,
  TRANSITION_KINDS,
  type EffectKind,
  type TextStyle,
} from '@lumora/core'
import type { MemeItem } from '@shared/ipc'
import { lumora } from '../api'
import { ipcErrorMessage } from '../lib/prefs'
import { AiPanel } from './AiPanel'
import { CaptionsPanel } from './CaptionsPanel'
import { useEditorStore } from './store'
import { ghostButton, primaryButton, Segmented } from './ui'

export const LIBRARY_TABS = [
  'media',
  'audio',
  'text',
  'stickers',
  'effects',
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
  transitions: ArrowLeftRight,
  captions: Captions,
  ai: WandSparkles,
}

const EFFECT_ICONS: Record<EffectKind, LucideIcon> = {
  shake: Vibrate,
  glitch: Zap,
  vhs: Tv,
  bw: Contrast,
  vintage: Camera,
  vignette: Aperture,
  blur: Droplets,
  flash: Sun,
  pulse: Activity,
  confetti: PartyPopper,
}

const EFFECT_TILES: Record<EffectKind, string> = {
  shake: 'from-orange-500 to-rose-600',
  glitch: 'from-fuchsia-500 to-cyan-500',
  vhs: 'from-indigo-500 to-pink-500',
  bw: 'from-zinc-200 to-zinc-700',
  vintage: 'from-amber-500 to-yellow-800',
  vignette: 'from-slate-500 to-black',
  blur: 'from-sky-400 to-blue-700',
  flash: 'from-yellow-200 to-orange-400',
  pulse: 'from-emerald-400 to-teal-700',
  confetti: 'from-pink-400 to-violet-600',
}

/** Kiểu chữ minh họa cho thẻ chọn mẫu chữ (gần giống cách vẽ trên video). */
const TEXT_SAMPLE: Record<TextStyle, CSSProperties> = {
  meme: {
    fontFamily: 'Impact, "Arial Black", sans-serif',
    color: '#fff',
    textTransform: 'uppercase',
    WebkitTextStroke: '1.5px #000',
    fontWeight: 900,
  },
  title: { fontWeight: 800, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.7)' },
  bubble: {
    fontWeight: 700,
    color: '#111',
    background: '#fff',
    borderRadius: 999,
    padding: '2px 12px',
  },
  neon: { fontWeight: 700, color: '#fff', textShadow: '0 0 6px #22d3ee, 0 0 14px #22d3ee' },
}

function Card({
  onClick,
  children,
  testId,
  title,
}: {
  onClick: () => void
  children: ReactNode
  testId?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={title}
      className="group relative flex flex-col gap-1.5 rounded-lg p-1 text-left text-[11px] text-muted hover:bg-surface-2 hover:text-text"
    >
      {children}
      <span className="absolute right-2 top-2 hidden rounded-full bg-accent p-0.5 text-accent-fg shadow group-hover:block">
        <Plus size={12} aria-hidden />
      </span>
    </button>
  )
}

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function useErrorText() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const code = ipcErrorMessage(e)
    const known = [
      'image_unsupported',
      'image_unreadable',
      'video_unreadable',
      'audio_unsupported',
      'audio_unreadable',
    ]
    return known.includes(code)
      ? t(`editor.library.errors.${code}`)
      : t('editor.library.errors.generic', { message: code })
  }
}

/** Phương tiện: thư viện video / ảnh / GIF meme của riêng bạn (kéo thả để thêm). */
function MediaTab() {
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
      className="relative flex min-h-full flex-col gap-3 p-3"
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
          title={t('editor.library.addToProject')}
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
      {error && (
        <p role="alert" className="rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted">
          <Clapperboard size={28} aria-hidden className="text-muted/70" />
          <p className="text-sm text-text">{t('editor.library.emptyTitle')}</p>
          <p>{t('editor.library.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((m) => (
            <div key={m.file} className="group relative">
              <button
                type="button"
                data-testid="meme-item"
                data-kind={m.kind}
                title={`${m.name} — ${t('editor.library.clickToAdd')}`}
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
                title={t('editor.library.remove')}
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

function AudioTab() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorText = useErrorText()
  const { addMusic, addSoundEffect } = useEditorStore.getState()
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
  return (
    <div className="flex flex-col gap-3 p-3">
      <button
        type="button"
        data-testid="add-music"
        disabled={busy !== null}
        onClick={() => void run('music', addMusic)}
        className={primaryButton}
      >
        {busy === 'music' ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <Upload size={15} aria-hidden />
        )}
        {busy === 'music' ? t('editor.music.adding') : t('editor.music.add')}
      </button>
      <p className="text-[11px] text-muted">{t('editor.music.hint')}</p>
      {error && (
        <p role="alert" className="rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
      <h4 className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {t('editor.music.sfx')}
      </h4>
      <div className="flex flex-col">
        {SOUND_EFFECT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`sfx-${id}`}
            disabled={busy !== null}
            onClick={() => void run(id, () => addSoundEffect(id))}
            className="group flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-sky-500/30 to-indigo-500/30 text-sky-300">
              {busy === id ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <Volume2 size={15} aria-hidden />
              )}
            </span>
            <span className="flex-1 text-left">{t(`editor.music.effects.${id}`)}</span>
            <Plus size={15} aria-hidden className="text-muted opacity-0 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  )
}

function TextTab() {
  const { t } = useTranslation()
  const addOverlay = useEditorStore((s) => s.addOverlay)
  return (
    <div className="flex flex-col gap-3 p-3">
      <button
        type="button"
        data-testid="text-add-default"
        className={primaryButton}
        onClick={() =>
          addOverlay({ kind: 'text', text: t('editor.library.defaultText'), style: 'title' })
        }
      >
        <Type size={15} aria-hidden />
        {t('editor.library.addText')}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {TEXT_STYLES.map((style) => (
          <Card
            key={style}
            testId={`text-add-${style}`}
            title={t('editor.library.clickToAdd')}
            onClick={() =>
              addOverlay({ kind: 'text', text: t('editor.library.defaultText'), style })
            }
          >
            <span className="flex aspect-video items-center justify-center rounded-md bg-gradient-to-br from-slate-600 to-slate-900 text-base">
              <span style={TEXT_SAMPLE[style]}>{t('editor.library.sample')}</span>
            </span>
            {t(`editor.stickers.styles.${style}`)}
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t('editor.library.textHint')}</p>
    </div>
  )
}

function StickersTab() {
  const addOverlay = useEditorStore((s) => s.addOverlay)
  return (
    <div className="grid grid-cols-6 gap-1 p-3 text-2xl">
      {EMOJI_STICKERS.map((e, i) => (
        <button
          key={e}
          type="button"
          data-testid={`emoji-${i}`}
          onClick={() => addOverlay({ kind: 'emoji', text: e })}
          className="flex aspect-square items-center justify-center rounded-lg hover:scale-110 hover:bg-surface-2"
        >
          {e}
        </button>
      ))}
    </div>
  )
}

function EffectsTab() {
  const { t } = useTranslation()
  const addEffect = useEditorStore((s) => s.addEffect)
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] text-muted">{t('editor.effects.hint')}</p>
      <div className="grid grid-cols-3 gap-2">
        {EFFECT_KINDS.map((kind) => {
          const Icon = EFFECT_ICONS[kind]
          return (
            <Card
              key={kind}
              testId={`effect-add-${kind}`}
              title={t('editor.library.clickToAdd')}
              onClick={() => addEffect(kind)}
            >
              <span
                className={`flex aspect-square items-center justify-center rounded-md bg-gradient-to-br ${EFFECT_TILES[kind]} text-white`}
              >
                <Icon size={22} aria-hidden />
              </span>
              <span className="truncate">{t(`editor.effects.kinds.${kind}`)}</span>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function TransitionsTab() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  const time = useEditorStore((s) => s.time)
  if (!edit) return null
  const cuts = cutPoints(edit.clips)
  if (cuts.length === 0)
    return <p className="p-4 text-sm text-muted">{t('editor.transition.noCuts')}</p>
  // Chỗ nối đang chọn, hoặc chỗ nối gần đầu phát nhất.
  const target =
    selection?.kind === 'transition'
      ? selection.id
      : [...cuts].sort((a, b) => Math.abs(a.at - time) - Math.abs(b.at - time))[0]!.afterClip
  const apply = (kind: (typeof TRANSITION_KINDS)[number]) => {
    const s = useEditorStore.getState()
    s.setTransition(target, kind)
    s.select({ kind: 'transition', id: target })
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] text-muted">
        {t('editor.library.transitionTarget', {
          n: cuts.findIndex((c) => c.afterClip === target) + 1,
          count: cuts.length,
        })}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {TRANSITION_KINDS.map((kind) => (
          <Card key={kind} testId={`lib-transition-${kind}`} onClick={() => apply(kind)}>
            <span className="flex aspect-square items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-violet-700 text-white">
              <ArrowLeftRight size={20} aria-hidden />
            </span>
            <span className="truncate">{t(`editor.transition.kinds.${kind}`)}</span>
          </Card>
        ))}
      </div>
      <button
        type="button"
        className={ghostButton}
        data-testid="lib-transition-all"
        onClick={() =>
          useEditorStore.getState().applyTransitionToAll('fadeBlack', DEFAULT_TRANSITION_MS)
        }
      >
        {t('editor.library.transitionAll', { count: cuts.length })}
      </button>
    </div>
  )
}

/**
 * Thư viện bên trái (kiểu CapCut): phương tiện / meme, âm thanh, chữ, nhãn dán, hiệu ứng,
 * chuyển tiếp, phụ đề và AI. Bấm một mục để thêm tại đầu phát.
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
        className="flex w-[68px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-1.5 py-2"
        role="tablist"
        aria-orientation="vertical"
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
              data-testid={`lib-${name}`}
              onClick={() => setTab(name)}
              className={`flex flex-col items-center gap-1 rounded-lg px-0.5 py-2 text-center text-[10px] leading-tight transition-colors ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <Icon size={19} aria-hidden />
              <span>{t(`editor.library.tabs.${name}`)}</span>
            </button>
          )
        })}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {tab === 'media' && <MediaTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'stickers' && <StickersTab />}
        {tab === 'effects' && <EffectsTab />}
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
  )
}
