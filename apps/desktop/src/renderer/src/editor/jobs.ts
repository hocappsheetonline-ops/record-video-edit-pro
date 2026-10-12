import { create } from 'zustand'

export interface Job {
  id: string
  label: string
  /** 0..1, null nếu không biết tiến độ. */
  progress: number | null
  status: 'running' | 'done' | 'error'
  error?: string
  /** Có thể hủy (bấm nút X). */
  cancel?: () => void
  startedAt: number
}

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'error'
  /** Nút hành động (ví dụ "Mở thư mục"). */
  action?: { label: string; run: () => void }
}

interface JobsState {
  jobs: Job[]
  toasts: Toast[]
  start(label: string, cancel?: () => void): string
  progress(id: string, progress: number | null, label?: string): void
  finish(id: string, error?: string): void
  clearDone(): void
  toast(t: Omit<Toast, 'id'>, ms?: number): string
  dismiss(id: string): void
}

let seq = 0
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/** Việc chạy nền (xuất video, nhập video, đọc kịch bản…) và thông báo nhỏ góc màn hình. */
export const useJobs = create<JobsState>((set, get) => ({
  jobs: [],
  toasts: [],
  start(label, cancel) {
    const id = nextId('j')
    set({
      jobs: [
        ...get().jobs,
        { id, label, progress: null, status: 'running', cancel, startedAt: Date.now() },
      ],
    })
    return id
  },
  progress(id, progress, label) {
    set({
      jobs: get().jobs.map((j) =>
        j.id === id ? { ...j, progress, ...(label ? { label } : {}) } : j,
      ),
    })
  },
  finish(id, error) {
    set({
      jobs: get().jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              status: error ? 'error' : 'done',
              error,
              progress: error ? j.progress : 1,
              cancel: undefined,
            }
          : j,
      ),
    })
  },
  clearDone() {
    set({ jobs: get().jobs.filter((j) => j.status === 'running') })
  },
  toast(t, ms = 4000) {
    const id = nextId('t')
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] })
    if (ms > 0) setTimeout(() => get().dismiss(id), ms)
    return id
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

/**
 * Chạy một việc nền có theo dõi: hiện trong danh sách Việc đang làm, báo lỗi bằng thông báo.
 * `task` nhận hàm báo tiến độ. Trả về kết quả của việc (hoặc ném lỗi như cũ).
 */
export async function runJob<T>(
  label: string,
  task: (progress: (p: number | null, label?: string) => void) => Promise<T>,
  options: { cancel?: () => void; errorText?: (e: unknown) => string } = {},
): Promise<T> {
  const jobs = useJobs.getState()
  const id = jobs.start(label, options.cancel)
  try {
    const result = await task((p, l) => useJobs.getState().progress(id, p, l))
    useJobs.getState().finish(id)
    return result
  } catch (e) {
    const text = options.errorText?.(e) ?? (e instanceof Error ? e.message : String(e))
    useJobs.getState().finish(id, text)
    throw e
  }
}
