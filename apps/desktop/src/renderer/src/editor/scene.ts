import {
  cameraAt,
  captionAt,
  captionChunk,
  isCaptionKeyword,
  sourceToOutput,
  cameraRect,
  clickAt,
  cursorAt,
  cursorOpacity,
  keyCaptionAt,
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
  type CaptionLook,
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
  /** Phím tắt vừa bấm (Ctrl+C…) hiện dưới khung hình, mờ dần; cỡ chữ theo pixel video xuất. */
  keys: { combos: string[]; opacity: number; fontSize: number } | null
  /** Webcam: bong bóng nổi (`circle`/`rounded`/`square`) hoặc dải ngang (`strip`, không bo góc). */
  camera: {
    rect: Rect
    shape: EditState['camera']['shape'] | 'strip'
    beauty: BeautyStyle
    /** Phông nền (AI tách người). */
    background: EditState['camera']['background']
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
  captions: SceneCaptions | null
}

export interface CaptionWord {
  text: string
  /** Từ đang nói (chỉ khi kiểu "tô sáng từ đang nói"). */
  active: boolean
  /** Đã nói tới (gồm từ đang nói) — cho mẫu karaoke / popWord. */
  spoken: boolean
  /** Thời gian từ lúc từ bắt đầu được nói (ms, âm nếu chưa tới). */
  since: number
  /** Từ khóa do AI chọn: vẽ bằng màu từ khóa (kiểu app Captions). */
  keyword: boolean
}

export interface SceneCaptions {
  words: CaptionWord[]
  style: 'highlight' | 'classic'
  look: CaptionLook
  /** Cỡ chữ (px). */
  fontSize: number
  /** Dòng dịch hiện dưới (phụ đề song ngữ). */
  translation: string | null
  /** Emoji của dòng (vẽ sau chữ, nảy lúc dòng bắt đầu); null nếu không có. */
  emoji: string | null
  /** Thời gian từ lúc dòng bắt đầu (ms) — đồng hồ cho các mẫu động (lượn sóng, nảy emoji). */
  lineSince: number
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
  /** Đang ở đoạn video nhập từ máy: không có con trỏ / click của bản quay. */
  imported?: boolean
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
  // Đoạn video nhập: không có chuột để bám theo, khung đứng giữa.
  const follow = input.imported ? null : input.follow
  const rest = (fill && follow ? cursorAt(follow, source) : null) ?? { x: 0.5, y: 0.5 }
  const raw = cameraAt(edit.zooms, source, follow, rest, base, edit.motion.zoomTransitionMs)
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
  if (!input.imported && edit.cursor.visible && input.cursor && input.cursor.samples.length > 0) {
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

  let keys: FrameScene['keys'] = null
  if (!input.imported && edit.cursor.showKeys && input.cursor) {
    const hit = keyCaptionAt(input.cursor, source)
    if (hit && hit.opacity > 0)
      keys = { ...hit, fontSize: Math.round(Math.min(output.width, output.height) * 0.04) }
  }

  let captions: FrameScene['captions'] = null
  const cap = edit.captions
  if (cap.enabled && cap.lines.length > 0) {
    const hit = captionAt(cap.lines, source)
    if (hit) {
      const { line } = hit
      const useWords = !line.edited && line.words.length > 0
      // Dòng đã sửa / đã dịch: chia đều thời gian của dòng cho các từ để vẫn có hiệu ứng từng từ.
      const timed = useWords
        ? line.words.filter((w) => sourceToOutput(edit.clips, (w.start + w.end) / 2) !== null)
        : evenWords(line.text, line.start, line.end)
      let current = -1
      timed.forEach((w, i) => {
        if (source >= w.start) current = i
      })
      const highlight = cap.style === 'highlight'
      const [from, to] = captionChunk(timed.length, current, cap.look.maxWords)
      captions = {
        words: timed.slice(from, to).map((w, k) => ({
          text: cap.look.uppercase ? w.text.toLocaleUpperCase() : w.text,
          active: highlight && from + k === current,
          spoken: highlight ? from + k <= current : true,
          since: source - w.start,
          keyword: isCaptionKeyword(w.text, line.keywords),
        })),
        style: cap.style,
        look: cap.look,
        fontSize: Math.round(Math.min(output.width, output.height) * 0.05 * cap.size),
        translation: cap.bilingual && line.translation ? line.translation : null,
        // Emoji chỉ hiện ở nhóm từ cuối khi dòng chia thành nhiều nhóm (cuối câu).
        emoji: line.emoji && to >= timed.length ? line.emoji : null,
        lineSince: source - line.start,
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
    keys,
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
      background: cam.background,
      framing,
      border: 0,
      borderColor: cam.borderColor,
    }
  const rect = cameraRect(output, cam.size, { x: cam.x, y: cam.y })
  return {
    rect,
    shape: cam.shape,
    beauty: cam.beauty,
    background: cam.background,
    framing,
    border: cam.border * rect.width * 0.06,
    borderColor: cam.borderColor,
  }
}

/** Từ của một dòng không có thời gian từng từ: chia đều thời gian dòng. */
function evenWords(text: string, start: number, end: number) {
  const parts = text.split(/\s+/).filter(Boolean)
  const step = (end - start) / Math.max(1, parts.length)
  return parts.map((t, i) => ({ text: t, start: start + step * i, end: start + step * (i + 1) }))
}
