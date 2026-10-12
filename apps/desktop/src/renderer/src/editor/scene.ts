import {
  cameraAt,
  captionAt,
  sourceToOutput,
  cameraRect,
  clickAt,
  cursorAt,
  cursorOpacity,
  fillBaseView,
  fillViewRect,
  frameLayout,
  viewRect,
  type Background,
  type BeautyStyle,
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
  /** Webcam: bong bóng nổi (`circle`/`rounded`/`square`) hoặc dải ngang (`strip`, không bo góc). */
  camera: {
    rect: Rect
    shape: EditState['camera']['shape'] | 'strip'
    beauty: BeautyStyle
  } | null
  captions: {
    words: { text: string; active: boolean }[]
    style: 'highlight' | 'classic'
    position: 'bottom' | 'top'
    /** Cỡ chữ (px). */
    fontSize: number
  } | null
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
  const fill = edit.frame.fill
  const showCamera = input.hasCamera && edit.camera.visible
  const layout = frameLayout(output, video, edit.frame, showCamera ? edit.camera : null)
  const content = layout.content
  // Lấp đầy: khung nhìn có đúng tỉ lệ vùng hiển thị và đi theo con trỏ (đã làm mượt) cả khi không zoom.
  const base = fill ? fillBaseView(video, content) : { width: 1, height: 1 }
  const rest = (fill && input.follow ? cursorAt(input.follow, source) : null) ?? { x: 0.5, y: 0.5 }
  const camera = cameraAt(
    edit.zooms,
    source,
    input.follow,
    rest,
    base,
    edit.motion.zoomTransitionMs,
  )
  const view = fill ? fillViewRect(camera, video, content) : viewRect(camera)
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
      const size = (content.height / view.height / 40) * edit.cursor.size
      cursor = { ...toOutput(pos), size, opacity }
    }
    const click = edit.cursor.clickEffect ? clickAt(input.cursor, source) : null
    if (click) {
      const at = toOutput(click.click)
      ripple = {
        ...at,
        radius: (content.height / view.height / 40) * (0.6 + click.progress * 1.6),
        opacity: 1 - click.progress,
      }
    }
  }

  let captions: FrameScene['captions'] = null
  const cap = edit.captions
  if (cap.enabled && cap.lines.length > 0) {
    const hit = captionAt(cap.lines, source)
    if (hit) {
      const useWords = !hit.line.edited && hit.line.words.length > 0
      // Từ đã bị cắt khỏi video thì không hiện trong phụ đề.
      const words = useWords
        ? hit.line.words.flatMap((w, i) =>
            sourceToOutput(edit.clips, (w.start + w.end) / 2) === null
              ? []
              : [{ text: w.text, active: cap.style === 'highlight' && i === hit.wordIndex }],
          )
        : hit.line.text
            .split(/\s+/)
            .filter(Boolean)
            .map((text) => ({ text, active: false }))
      captions = {
        words,
        style: cap.style,
        position: cap.position,
        fontSize: Math.round(Math.min(output.width, output.height) * 0.05 * cap.size),
      }
    }
  }

  return {
    captions,
    width: output.width,
    height: output.height,
    background: edit.frame.background,
    content,
    radius: fill ? 0 : edit.frame.radius * Math.min(content.width, content.height),
    shadow: fill ? 0 : edit.frame.shadow,
    view,
    cursor,
    ripple,
    camera: !showCamera
      ? null
      : layout.strip
        ? { rect: layout.strip, shape: 'strip', beauty: edit.camera.beauty }
        : {
            rect: cameraRect(output, edit.camera.size, edit.camera.position),
            shape: edit.camera.shape,
            beauty: edit.camera.beauty,
          },
  }
}
