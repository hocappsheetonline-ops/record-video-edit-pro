/**
 * Mỗi track bắt đầu ghi ở thời điểm hơi khác nhau. Tính thời điểm (giây) cần phát của một track
 * để khớp với track chính đang ở `masterTime`. Kết quả âm nghĩa là track đó chưa bắt đầu.
 */
export function syncedTime(
  masterTime: number,
  masterStartedAt: number,
  otherStartedAt: number,
): number {
  return masterTime + (masterStartedAt - otherStartedAt) / 1000
}

/** Chỉ chỉnh lại khi lệch đủ nhiều, tránh giật hình do tua liên tục. */
export const SYNC_TOLERANCE_S = 0.15

export function needsResync(current: number, target: number): boolean {
  return Math.abs(current - target) > SYNC_TOLERANCE_S
}
