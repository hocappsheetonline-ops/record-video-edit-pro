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
  clampCenter,
  isDefaultTransform,
  lookLayers,
  orientedSize,
  orientPoint,
  outputToSource,
  unorientRect,
  viewRect,
  effectsAt,
  overlaysAt,
  transitionAt,
  type ActiveEffect,
  type ActiveTransition,
  type Background,
  type BeautyStyle,
  type ClipTransform,
  type CursorTrack,
  type LookLayers,
  type EditState,
  type Rect,
  type Size,
} from '@lumora/core'
import type { OverlayItem } from './overlay-draw'

/** Mọi thứ cần vẽ cho một khung hình, tính bằng pixel của video xuất. */
export interface FrameScene {
  /** Thời điểm trên video xuất (ms). */
  time: number
  width: number
  height: number
  background: Background
  /** Vị trí video màn hình trong khung. */
  content: Rect
  radius: number
  shadow: number
  /**
   * Phần video màn hình đang hiện (chuẩn hóa 0..1, trong khung đã cắt / lật / xoay của clip) — nhỏ
   * hơn toàn bộ khi đang zoom.
   */
  view: Rect
  /** Vùng của video gốc cần lấy điểm ảnh để vẽ (bằng `view` nếu clip không biến đổi). */
  source: Rect
  /** Lật / xoay của clip đang phát (null nếu không có). */
  orient: Pick<ClipTransform, 'flipH' | 'flipV' | 'rotate'> | null
  /** Bộ lọc màu / điều chỉnh cho video màn hình và webcam (null nếu không có). */
  look: LookLayers | null
  /** Độ mờ của video màn hình (clip có độ mờ < 1 thì thấy nền phía sau). */
  opacity: number
  cursor: { x: number; y: number; size: number; opacity: number } | null
  ripple: { x: number; y: number; radius: number; opacity: number } | null
  /** Webcam: bong bóng nổi (`circle`/`rounded`/`square`) hoặc dải ngang (`strip`, không bo góc). */
  camera: {
    rect: Rect
    shape: EditState['camera']['shape'] | 'strip'
    beauty: BeautyStyle
    /** Khung cắt mặt trong video webcam. */
    framing: { zoom: number; focusX: number; focusY: number }
    /** Viền (px, 0 = không) và màu. */
    border: number
    borderColor: string
  } | null
  /** Chuyển tiếp đang diễn ra quanh chỗ nối giữa hai clip. */
  transition: ActiveTransition | null
  /** Hiệu ứng hình đang chạy. */
  effects: ActiveEffect[]
  /** Chữ, sticker, ảnh meme đang hiện (kèm thời gian đã hiện). */
  overlays: OverlayItem[]
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
  /** Thời điểm trên video xuất (ms) — cho chuyển tiếp, hiệu ứng. */
  time: number
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
  const { edit, output, source } = input
  const fill = edit.frame.fill
  const showCamera = input.hasCamera && edit.camera.visible
  // Clip đang phát: bộ lọc riêng và cắt / lật / xoay (khung hình theo tỉ lệ video sau biến đổi).
  const clip = outputToSource(edit.clips, input.time)?.position.clip
  const tf = clip?.transform && !isDefaultTransform(clip.transform) ? clip.transform : null
  const video = tf ? orientedSize(input.video, tf) : input.video
  const orient = (p: { x: number; y: number }) => (tf ? orientPoint(p, tf) : p)
  const layout = frameLayout(output, video, edit.frame, showCamera ? edit.camera : null)
  const content = layout.content
  // Lấp đầy: khung nhìn có đúng tỉ lệ vùng hiển thị và đi theo con trỏ (đã làm mượt) cả khi không zoom.
  const base = fill ? fillBaseView(video, content) : { width: 1, height: 1 }
  const rest = (fill && input.follow ? cursorAt(input.follow, source) : null) ?? { x: 0.5, y: 0.5 }
  const raw = cameraAt(edit.zooms, source, input.follow, rest, base, edit.motion.zoomTransitionMs)
  // Tâm khung nhìn tính theo video gốc → đổi sang khung đã biến đổi rồi giữ trong mép.
  const centre = orient(raw)
  const camera = tf
    ? {
        scale: raw.scale,
        x: clampCenter(centre.x, raw.scale, base.width),
        y: clampCenter(centre.y, raw.scale, base.height),
      }
    : raw
  const view = fill ? fillViewRect(camera, video, content) : viewRect(camera)
  const toOutput = (point: { x: number; y: number }) => {
    const p = orient(point)
    return {
      x: content.x + ((p.x - view.x) / view.width) * content.width,
      y: content.y + ((p.y - view.y) / view.height) * content.height,
    }
  }

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
    transition: transitionAt(edit.clips, edit.transitions, input.time),
    effects: effectsAt(edit.effects, input.time),
    overlays: overlaysAt(edit.overlays, input.time).map((overlay) => ({
      overlay,
      local: input.time - overlay.start,
    })),
    captions,
    time: input.time,
    width: output.width,
    height: output.height,
    background: edit.frame.background,
    content,
    radius: fill ? 0 : edit.frame.radius * Math.min(content.width, content.height),
    shadow: fill ? 0 : edit.frame.shadow,
    view,
    source: tf ? unorientRect(view, tf) : view,
    orient: tf ? { flipH: tf.flipH, flipV: tf.flipV, rotate: tf.rotate } : null,
    look: lookLayers(clip?.look ?? edit.look),
    opacity: clip?.opacity ?? 1,
    cursor,
    ripple,
    camera: !showCamera ? null : cameraScene(edit.camera, output, layout.strip),
  }
}

function cameraScene(
  cam: EditState['camera'],
  output: Size,
  strip: Rect | null,
): NonNullable<FrameScene['camera']> {
  const framing = { zoom: cam.zoom, focusX: cam.focusX, focusY: cam.focusY }
  if (strip)
    return {
      rect: strip,
      shape: 'strip',
      beauty: cam.beauty,
      framing,
      border: 0,
      borderColor: cam.borderColor,
    }
  const rect = cameraRect(output, cam.size, { x: cam.x, y: cam.y })
  return {
    rect,
    shape: cam.shape,
    beauty: cam.beauty,
    framing,
    border: cam.border * rect.width * 0.06,
    borderColor: cam.borderColor,
  }
}
