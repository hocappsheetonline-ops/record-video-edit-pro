import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Trash2, X } from 'lucide-react'
import {
  EMOJI_STICKERS,
  MEME_PHRASES,
  OVERLAY_ANIMATIONS,
  TEXT_STYLES,
  type TextStyle,
} from '@lumora/core'
import type { ImageAsset, MemeItem } from '@shared/ipc'
import { lumora } from '../api'
import { ipcErrorMessage } from '../lib/prefs'
import { useEditorStore } from './store'

const chip = (active: boolean) =>
  `rounded-md px-2 py-1 text-xs ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-text'}`
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Chữ, sticker emoji, ảnh/GIF meme (kể cả thư viện meme cá nhân) và chỉnh lớp đang chọn. */
export function StickersPanel() {
  const { t } = useTranslation()
  const folder = useEditorStore((s) => s.folder)
  const overlay = useEditorStore((s) =>
    s.selection?.kind === 'overlay'
      ? s.edit?.overlays.find((o) => o.id === s.selection!.id)
      : undefined,
  )
  const { addOverlay, updateOverlay, deleteSelection } = useEditorStore.getState()
  const [text, setText] = useState('')
  const [style, setStyle] = useState<TextStyle>('meme')
  const [memes, setMemes] = useState<MemeItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void lumora()
      .listMemes()
      .then(setMemes)
      .catch(() => setMemes([]))
  }, [])

  const run = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
    } catch (e) {
      const code = ipcErrorMessage(e)
      setError(
        ['image_unsupported', 'image_unreadable'].includes(code)
          ? t(`editor.stickers.errors.${code}`)
          : t('editor.stickers.errors.generic', { message: code }),
      )
    }
  }
  const addImage = (asset: ImageAsset) =>
    addOverlay({
      kind: 'image',
      file: asset.file,
      aspect: asset.width / asset.height,
      text: asset.name,
    })
  const addText = (value: string) =>
    value.trim() && addOverlay({ kind: 'text', text: value.trim(), style })

  return (
    <div className="flex flex-col gap-4" data-testid="stickers-panel">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">{t('editor.stickers.text')}</span>
        <textarea
          rows={2}
          value={text}
          data-testid="overlay-text-input"
          placeholder={t('editor.stickers.placeholder')}
          onChange={(e) => setText(e.target.value)}
          className="resize-none rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {TEXT_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`text-style-${s}`}
              className={chip(style === s)}
              onClick={() => setStyle(s)}
            >
              {t(`editor.stickers.styles.${s}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="overlay-add-text"
          disabled={!text.trim()}
          onClick={() => {
            addText(text)
            setText('')
          }}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          {t('editor.stickers.addText')}
        </button>
        <div className="flex flex-wrap gap-1">
          {MEME_PHRASES.map((p, i) => (
            <button
              key={p}
              type="button"
              data-testid={`phrase-${i}`}
              className={chip(false)}
              onClick={() => addText(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm text-muted">{t('editor.stickers.emoji')}</span>
        <div className="grid grid-cols-10 gap-0.5 text-xl">
          {EMOJI_STICKERS.map((e, i) => (
            <button
              key={e}
              type="button"
              data-testid={`emoji-${i}`}
              onClick={() => addOverlay({ kind: 'emoji', text: e })}
              className="rounded hover:bg-surface-2"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">{t('editor.stickers.memes')}</span>
          <button
            type="button"
            data-testid="meme-import"
            className="text-xs text-accent hover:underline"
            onClick={() => void run(async () => setMemes(await lumora().importMemes()))}
          >
            {t('editor.stickers.importMemes')}
          </button>
        </div>
        {memes.length === 0 && (
          <p className="text-xs text-muted">{t('editor.stickers.memesEmpty')}</p>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {memes.map((m) => (
            <div key={m.file} className="group relative">
              <button
                type="button"
                data-testid="meme-item"
                title={m.name}
                onClick={() =>
                  folder && void run(async () => addImage(await lumora().useMeme(folder, m.file)))
                }
                className="block aspect-square w-full overflow-hidden rounded-md bg-surface-2"
              >
                {m.thumb && (
                  <img src={m.thumb} alt={m.name} className="h-full w-full object-cover" />
                )}
              </button>
              <button
                type="button"
                aria-label={t('editor.stickers.removeMeme')}
                onClick={() => void run(async () => setMemes(await lumora().removeMeme(m.file)))}
                className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 p-0.5 text-white group-hover:block"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          data-testid="overlay-add-image"
          onClick={() =>
            folder &&
            void run(async () => {
              const asset = await lumora().addImageFile(folder)
              if (asset) addImage(asset)
            })
          }
          className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          <ImagePlus size={16} aria-hidden />
          {t('editor.stickers.addImage')}
        </button>
        <p className="text-xs text-muted">{t('editor.stickers.copyright')}</p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {overlay && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
          data-testid="overlay-selected"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {overlay.kind === 'image' ? overlay.text || t('editor.stickers.image') : overlay.text}
            </span>
            <button
              type="button"
              aria-label={t('editor.stickers.remove')}
              data-testid="overlay-remove"
              onClick={deleteSelection}
              className="text-danger"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
          {overlay.kind === 'text' && (
            <>
              <textarea
                rows={2}
                value={overlay.text}
                data-testid="overlay-edit-text"
                onChange={(e) =>
                  updateOverlay(overlay.id, { text: e.target.value }, `ov-text-${overlay.id}`)
                }
                className="resize-none rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-1">
                {TEXT_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={chip(overlay.style === s)}
                    onClick={() => updateOverlay(overlay.id, { style: s })}
                  >
                    {t(`editor.stickers.styles.${s}`)}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label={t('editor.stickers.color')}
                  value={overlay.color}
                  onChange={(e) =>
                    updateOverlay(overlay.id, { color: e.target.value }, `ov-color-${overlay.id}`)
                  }
                />
              </div>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              {t('editor.stickers.size')}: {pct(overlay.size)}
            </span>
            <input
              type="range"
              min={0.03}
              max={0.8}
              step={0.01}
              value={overlay.size}
              data-testid="overlay-size"
              className="accent-accent"
              onChange={(e) =>
                updateOverlay(overlay.id, { size: Number(e.target.value) }, `ov-size-${overlay.id}`)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              {t('editor.stickers.rotation')}: {Math.round(overlay.rotation)}°
            </span>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={overlay.rotation}
              data-testid="overlay-rotation"
              className="accent-accent"
              onChange={(e) =>
                updateOverlay(
                  overlay.id,
                  { rotation: Number(e.target.value) },
                  `ov-rot-${overlay.id}`,
                )
              }
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {OVERLAY_ANIMATIONS.map((a) => (
              <button
                key={a}
                type="button"
                data-testid={`anim-${a}`}
                className={chip(overlay.animation === a)}
                onClick={() => updateOverlay(overlay.id, { animation: a })}
              >
                {t(`editor.stickers.animations.${a}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['top', 'center', 'bottom'] as const).map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`pos-${p}`}
                className={chip(false)}
                onClick={() =>
                  updateOverlay(overlay.id, {
                    x: 0.5,
                    y: p === 'top' ? 0.15 : p === 'center' ? 0.5 : 0.85,
                  })
                }
              >
                {t(`editor.stickers.positions.${p}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t('editor.stickers.dragHint')}</p>
        </div>
      )}
    </div>
  )
}
