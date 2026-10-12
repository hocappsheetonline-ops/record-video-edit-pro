import type { TFunction } from 'i18next'
import { canReverse, DEFAULT_CLIP_AUDIO, isClipboardEmpty } from '@lumora/core'
import type { MenuEntry } from './ContextMenu'
import { useEditorStore, type MultiKind } from './store'

const store = useEditorStore.getState

/** Chuột phải trên một mục: chọn nó trước (nếu chưa nằm trong nhóm đang chọn). */
function ensureSelected(kind: MultiKind, id: string) {
  if (!store().isSelected(kind, id)) store().select({ kind, id })
}

/** Menu cho lớp phủ / hiệu ứng / đoạn âm thanh. */
export function itemMenu(t: TFunction, kind: MultiKind, id: string): MenuEntry[] {
  ensureSelected(kind, id)
  const s = store()
  const overlay = kind === 'overlay' ? s.edit?.overlays.find((o) => o.id === id) : undefined
  const entries: MenuEntry[] = [
    {
      label: t('editor.menu.copy'),
      shortcut: 'Ctrl+C',
      testId: 'menu-copy',
      onClick: () => store().copySelection(),
    },
    {
      label: t('editor.menu.cut'),
      shortcut: 'Ctrl+X',
      testId: 'menu-cut',
      onClick: () => store().cutSelection(),
    },
    {
      label: t('editor.menu.paste'),
      shortcut: 'Ctrl+V',
      testId: 'menu-paste',
      disabled: isClipboardEmpty(s.clipboard),
      onClick: () => store().paste(),
    },
    {
      label: t('editor.menu.duplicate'),
      shortcut: 'Ctrl+D',
      testId: 'menu-duplicate',
      onClick: () => store().duplicateSelection(),
    },
  ]
  if (overlay) {
    entries.push(
      null,
      {
        label: t('editor.menu.bringForward'),
        testId: 'menu-up',
        onClick: () => store().reorderOverlay(id, 'up'),
      },
      {
        label: t('editor.menu.sendBackward'),
        testId: 'menu-down',
        onClick: () => store().reorderOverlay(id, 'down'),
      },
      {
        label: t('editor.menu.bringToFront'),
        testId: 'menu-top',
        onClick: () => store().reorderOverlay(id, 'top'),
      },
      {
        label: t('editor.menu.sendToBack'),
        testId: 'menu-bottom',
        onClick: () => store().reorderOverlay(id, 'bottom'),
      },
    )
    if (overlay.kind === 'video' && overlay.hasAudio)
      entries.push({
        label: t('editor.props.detachAudio'),
        testId: 'menu-detach',
        onClick: () => store().detachOverlayAudio(id),
      })
  }
  entries.push(
    null,
    {
      label: t('editor.menu.delete'),
      shortcut: 'Delete',
      testId: 'menu-delete',
      danger: true,
      onClick: () => store().deleteSelection(),
    },
    {
      label: t('editor.menu.rippleDelete'),
      shortcut: 'Shift+Delete',
      testId: 'menu-ripple',
      danger: true,
      onClick: () => store().rippleDeleteSelection(),
    },
  )
  return entries
}

/** Menu cho clip video chính. */
export function clipMenu(t: TFunction, id: string): MenuEntry[] {
  store().select({ kind: 'clip', id })
  const s = store()
  const clip = s.edit?.clips.find((c) => c.id === id)
  if (!clip || !s.edit) return []
  const audio = clip.audio ?? DEFAULT_CLIP_AUDIO
  return [
    {
      label: t('editor.menu.split'),
      shortcut: 'S',
      testId: 'menu-split',
      onClick: () => store().splitAtPlayhead(),
    },
    {
      label: t('editor.menu.freeze'),
      testId: 'menu-freeze',
      onClick: () => store().freezeAtPlayhead(),
    },
    {
      label: clip.reversed ? t('editor.menu.unreverse') : t('editor.menu.reverse'),
      testId: 'menu-reverse',
      disabled: !clip.reversed && !canReverse(s.project?.segments ?? [], clip),
      onClick: () => store().setClipReversed(id, !clip.reversed),
    },
    {
      label: audio.muted ? t('editor.menu.unmute') : t('editor.menu.mute'),
      testId: 'menu-mute',
      onClick: () => store().updateClip(id, { audio: { ...audio, muted: !audio.muted } }),
    },
    null,
    {
      label: t('editor.menu.delete'),
      shortcut: 'Delete',
      testId: 'menu-delete',
      danger: true,
      disabled: s.edit.clips.length <= 1,
      onClick: () => store().deleteSelection(),
    },
  ]
}

/** Menu trên chỗ trống của timeline. */
export function emptyMenu(t: TFunction): MenuEntry[] {
  const s = store()
  return [
    {
      label: t('editor.menu.paste'),
      shortcut: 'Ctrl+V',
      testId: 'menu-paste',
      disabled: isClipboardEmpty(s.clipboard),
      onClick: () => store().paste(),
    },
    {
      label: t('editor.menu.addMarker'),
      shortcut: 'M',
      testId: 'menu-marker',
      onClick: () => store().addMarkerAtPlayhead(),
    },
    {
      label: t('editor.menu.selectAll'),
      shortcut: 'Ctrl+A',
      testId: 'menu-select-all',
      onClick: () => store().selectAll(),
    },
    null,
    {
      label: s.snapping ? t('editor.menu.snapOff') : t('editor.menu.snapOn'),
      shortcut: 'N',
      testId: 'menu-snap',
      onClick: () => store().setSnapping(!store().snapping),
    },
  ]
}
