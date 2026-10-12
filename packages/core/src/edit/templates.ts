import type { ProjectTemplate } from '../settings'
import { withCaptionTemplate } from './caption-style'
import type { EditState } from './edit-state'

/**
 * Áp dụng mẫu dự án cho bản chỉnh sửa mới (lần đầu mở bản quay):
 * - `tutorial`: 16:9 như mặc định (video hướng dẫn, YouTube).
 * - `tiktok`: 9:16 phủ kín khung, tự cắt theo con trỏ; phụ đề kiểu TikTok ở giữa dưới.
 * - `square`: 1:1 (bài đăng mạng xã hội).
 */
export function applyProjectTemplate(edit: EditState, template: ProjectTemplate): EditState {
  if (template === 'tiktok')
    return {
      ...edit,
      frame: { ...edit.frame, aspect: '9:16', fill: true },
      captions: {
        ...edit.captions,
        look: { ...withCaptionTemplate(edit.captions.look, 'tiktok'), y: 0.7 },
      },
    }
  if (template === 'square') return { ...edit, frame: { ...edit.frame, aspect: '1:1' } }
  return edit
}
