import type { DragEvent } from 'react'
import {
  templateStyle,
  TEXT_STYLES,
  type EffectKind,
  type ShapeKind,
  type SoundEffectId,
  type TextStyle,
} from '@lumora/core'
import { lumora } from '../api'
import { useEditorStore } from './store'

/** Kiểu dữ liệu kéo thả nội bộ (thẻ thư viện → timeline). */
export const DRAG_TYPE = 'application/x-lumora'

export type DragPayload =
  | { kind: 'meme'; file: string }
  | { kind: 'effect'; id: EffectKind }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'emoji'; text: string }
  | { kind: 'shape'; shape: ShapeKind; color: string }
  | { kind: 'sfx'; id: SoundEffectId }

/** Thuộc tính cho một thẻ kéo được vào timeline. */
export function dragProps(payload: DragPayload) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'copy'
    },
  }
}

export function readPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    return raw ? (JSON.parse(raw) as DragPayload) : null
  } catch {
    return null
  }
}

/** Thêm mục được thả tại thời điểm `at` (ms trên video xuất). */
export async function dropPayload(payload: DragPayload, at: number) {
  const s = useEditorStore.getState()
  s.setPlaying(false)
  s.setTime(at)
  switch (payload.kind) {
    case 'meme': {
      if (!s.folder) return
      s.addMediaOverlay(await lumora().useMeme(s.folder, payload.file))
      return
    }
    case 'effect':
      s.addEffect(payload.id)
      return
    case 'text': {
      const style = templateStyle(payload.id)
      s.addOverlay({
        kind: 'text',
        text: payload.text,
        style: (TEXT_STYLES as readonly string[]).includes(payload.id)
          ? (payload.id as TextStyle)
          : 'title',
        color: style.color,
        textStyle: style,
      })
      return
    }
    case 'emoji':
      s.addOverlay({ kind: 'emoji', text: payload.text })
      return
    case 'shape':
      s.addOverlay({
        kind: 'shape',
        shape: payload.shape,
        color: payload.color,
        text: '',
        strokeWidth: 0.08,
      })
      return
    case 'sfx':
      await s.addSoundEffect(payload.id)
      return
  }
}

/** Đuôi file video nhập làm clip chính khi kéo từ Explorer vào timeline. */
const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|mpg|mpeg|ts)$/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i

/**
 * Kéo file từ máy vào timeline: video → nhập làm clip chính ở cuối; ảnh / GIF → thêm vào thư viện
 * meme rồi đặt tại chỗ thả. Trả về số file đã xử lý.
 */
export async function dropFiles(files: File[], at: number): Promise<number> {
  const s = useEditorStore.getState()
  const paths = files.map((f) => lumora().pathForFile(f)).filter(Boolean)
  let done = 0
  for (const path of paths) {
    if (VIDEO_EXT.test(path)) {
      if (await s.importVideo(path)) done++
    } else if (IMAGE_EXT.test(path) && s.folder) {
      const items = await lumora().addMemePaths([path])
      const name = path.split(/[\\/]/).pop()
      const item = items.find((m) => m.name === name || m.file.endsWith(name ?? '')) ?? items[0]
      if (!item) continue
      s.setTime(at)
      s.addMediaOverlay(await lumora().useMeme(s.folder, item.file))
      done++
    }
  }
  return done
}
