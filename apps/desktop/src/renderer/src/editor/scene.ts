import {
  cameraAt,
  cameraRect,
  clickAt,
  contentRect,
  cursorAt,
  cursorOpacity,
  viewRect,
  type Background,
  type CursorTrack,
  type EditState,
  type Rect,
  type Size,
} from '@lumora/core'

/** Mọi thứ cần vẽ cho một khung hình, tính bằng pixel của video xuất. */
export interface FrameScene {
  width: number
  height: number
  background: Background
  /** Vị trí video màn hình trong khung. */
  content: Rect
  radius: number
  shadow: number
  /** Phần video màn hình đang hiện (chuẩn hóa 0..1) — nhỏ hơn toàn bộ khi đang zoom. */
  view: Rect
  cursor: { x: number; y: number; size: number; opacity: number } | null
  ripple: { x: number; y: number; radius: number; opacity: number } | null
  camera: { rect: Rect; shape: EditState['camera']['shape'] } | null
}

export interface SceneInput {
  edit: EditState
  output: Size
  /** Kích thước gốc của video màn hình. */
  video: Size
  /** Thời gian nguồn (ms). */
  source: number
  cursor: CursorTrack | null
  follow: CursorTrack | null
  hasCamera: boolean
}

/** Tính bố cục một khung hình. Hàm thuần: cùng đầu vào luôn ra cùng kết quả (xem trước = xuất). */
export function computeScene(input: SceneInput): FrameScene {
  const { edit, output, video, source } = input
  const content = contentRect(output, video, edit.frame.padding)
  const camera = cameraAt(edit.zooms, source, input.follow)
  const view = viewRect(camera)
  const toOutput = (p: { x: number; y: number }) => ({
    x: content.x + ((p.x - view.x) / view.width) * content.width,
    y: content.y + ((p.y - view.y) / view.height) * content.height,
  })

  let cursor: FrameScene['cursor'] = null
  let ripple: FrameScene['ripple'] = null
  if (edit.cursor.visible && input.cursor && input.cursor.samples.length > 0) {
    const pos = cursorAt(input.cursor, source)
    const opacity = edit.cursor.hideIdle ? cursorOpacity(input.cursor, source) : 1
    if (pos && opacity > 0) {
      const size = (content.height / 40) * camera.scale * edit.cursor.size
      cursor = { ...toOutput(pos), size, opacity }
    }
    const click = edit.cursor.clickEffect ? clickAt(input.cursor, source) : null
    if (click) {
      const at = toOutput(click.click)
      ripple = {
        ...at,
        radius: (content.height / 40) * camera.scale * (0.6 + click.progress * 1.6),
        opacity: 1 - click.progress,
      }
    }
  }

  return {
    width: output.width,
    height: output.height,
    background: edit.frame.background,
    content,
    radius: edit.frame.radius * Math.min(content.width, content.height),
    shadow: edit.frame.shadow,
    view,
    cursor,
    ripple,
    camera:
      input.hasCamera && edit.camera.visible
        ? {
            rect: cameraRect(output, edit.camera.size, edit.camera.position),
            shape: edit.camera.shape,
          }
        : null,
  }
}
