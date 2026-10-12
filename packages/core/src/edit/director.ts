import { normalizeAssistantCommands, type AssistantCommand } from './assistant'
import type { EditState } from './edit-state'

/**
 * Đạo diễn AI: từ một câu yêu cầu, AI lập kế hoạch (tóm tắt, câu hỏi làm rõ nếu cần, danh sách
 * lệnh), app thực hiện; đồng thời nhớ thói quen chỉnh sửa của người dùng để lần sau làm đúng ý.
 */
export interface DirectorPlan {
  /** Một câu AI nói lại việc sẽ làm (để người dùng xác nhận). */
  summary: string
  /** Câu hỏi làm rõ (tối đa 2) khi yêu cầu còn mơ hồ; có câu hỏi thì chưa làm. */
  questions: string[]
  commands: AssistantCommand[]
}

export interface DirectorMessage {
  role: 'user' | 'ai'
  text: string
  at: number
}

export interface DirectorContext {
  language: string
  durationMs: number
  hasTranscript: boolean
  hasCursor: boolean
  /** Tên các bài trong kho nhạc (để AI chọn nhạc nền). */
  musicTracks: string[]
  /** Tên các dự án khác (để "làm giống dự án X"). */
  projects: string[]
  /** Thói quen đã học + quy tắc người dùng dặn (văn bản ngắn). */
  memory: string
  /** Vài lượt hội thoại gần nhất của dự án này. */
  history: DirectorMessage[]
}

export function normalizeDirectorPlan(input: unknown): DirectorPlan {
  const r = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const questions = Array.isArray(r.questions)
    ? r.questions
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim().slice(0, 200))
        .slice(0, 2)
    : []
  return {
    summary: typeof r.summary === 'string' ? r.summary.trim().slice(0, 300) : '',
    questions,
    commands: normalizeAssistantCommands(r.commands),
  }
}

/** Thói quen chỉnh sửa học từ các dự án đã làm + quy tắc người dùng dặn ("luôn…"). */
export interface StyleMemory {
  version: 1
  /** Quy tắc người dùng dặn, mỗi dòng một câu. */
  rules: string[]
  /** Số lần dùng từng lựa chọn: { captionsTemplate: { tiktok: 5 }, filter: {...}, ... }. */
  counts: Record<string, Record<string, number>>
  /** Dự án đã học (để không đếm trùng). */
  learned: string[]
  updatedAt: number
}

export const EMPTY_MEMORY: StyleMemory = {
  version: 1,
  rules: [],
  counts: {},
  learned: [],
  updatedAt: 0,
}

const MAX_RULES = 30
const MAX_LEARNED = 200

export function rememberRule(memory: StyleMemory, rule: string, now = Date.now()): StyleMemory {
  const text = rule.trim().replace(/\s+/g, ' ').slice(0, 200)
  if (!text) return memory
  // Đã có quy tắc giống (không phân biệt hoa thường) thì giữ nguyên bản cũ.
  if (memory.rules.some((r) => r.toLowerCase() === text.toLowerCase())) return memory
  return { ...memory, rules: [...memory.rules, text].slice(-MAX_RULES), updatedAt: now }
}

export function forgetRule(memory: StyleMemory, rule: string, now = Date.now()): StyleMemory {
  return { ...memory, rules: memory.rules.filter((r) => r !== rule), updatedAt: now }
}

function bump(counts: StyleMemory['counts'], key: string, value: string) {
  const bucket = { ...(counts[key] ?? {}) }
  bucket[value] = (bucket[value] ?? 0) + 1
  counts[key] = bucket
}

/** Câu người dùng gõ có phải là một quy tắc lâu dài ("luôn…", "từ nay…", "lần sau…")? */
export function isStandingRule(text: string): boolean {
  return /^\s*(luôn|từ nay|lần sau|mặc định|always|from now on|next time|by default)\b/i.test(text)
}

/**
 * Học từ bản chỉnh sửa của một dự án (gọi khi dự án được lưu): đếm mẫu phụ đề, bộ lọc, khung
 * hình, chuyển cảnh, hiệu ứng, âm lượng nhạc nền đang dùng. Mỗi dự án chỉ học một lần cho từng
 * lựa chọn (đếm lại khi người dùng đổi).
 */
export function learnFromEdit(
  memory: StyleMemory,
  projectId: string,
  edit: EditState,
  now = Date.now(),
): StyleMemory {
  const counts: StyleMemory['counts'] = Object.fromEntries(
    Object.entries(memory.counts).map(([k, v]) => [k, { ...v }]),
  )
  const seen = new Set(memory.learned)
  const learned = [...memory.learned]
  const note = (key: string, value: string) => {
    const tag = `${projectId}|${key}|${value}`
    if (seen.has(tag)) return
    seen.add(tag)
    learned.push(tag)
    bump(counts, key, value)
  }
  if (edit.captions.enabled && edit.captions.lines.length > 0)
    note('captionsTemplate', edit.captions.look.template)
  if (edit.look.filter !== 'none') note('filter', edit.look.filter)
  note('aspect', edit.frame.aspect)
  const transition = edit.transitions[0]?.kind
  if (transition) note('transition', transition)
  for (const effect of new Set(edit.effects.map((e) => e.kind))) note('effect', effect)
  const music = edit.audioClips.find((c) => c.kind === 'music')
  if (music) note('musicVolume', String(Math.round(music.volume * 10) / 10))
  if (edit.audio.micFx.noise !== 'off' || edit.audio.micFx.enhance) note('cleanAudio', 'yes')
  if (edit.zooms.length > 0) note('autoZoom', 'yes')
  if (learned.length === memory.learned.length) return memory
  return {
    ...memory,
    counts,
    learned: learned.slice(-MAX_LEARNED),
    updatedAt: now,
  }
}

/** Lựa chọn hay dùng nhất của một mục (null nếu chưa học). */
export function topChoice(memory: StyleMemory, key: string): string | null {
  const bucket = memory.counts[key]
  if (!bucket) return null
  const best = Object.entries(bucket).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : null
}

/** Văn bản ngắn gửi cho AI: thói quen (mục: lựa chọn ×số lần) và quy tắc đã dặn. */
export function memorySummary(memory: StyleMemory, language = 'vi'): string {
  const vi = language.toLowerCase().startsWith('vi')
  const parts: string[] = []
  const habits = Object.entries(memory.counts)
    .map(([key, bucket]) => {
      const best = Object.entries(bucket).sort((a, b) => b[1] - a[1])[0]
      return best ? `${key}=${best[0]} (×${best[1]})` : ''
    })
    .filter(Boolean)
  if (habits.length > 0) parts.push(`${vi ? 'Thói quen' : 'Habits'}: ${habits.join(', ')}`)
  if (memory.rules.length > 0)
    parts.push(`${vi ? 'Quy tắc người dùng' : 'User rules'}:\n- ${memory.rules.join('\n- ')}`)
  return parts.join('\n')
}

/**
 * Lập kế hoạch không cần model (hoặc bổ sung cho model): lệnh hiểu theo từ khóa + thói quen đã
 * học (phụ đề thì dùng mẫu quen, nhạc thì âm lượng quen) + câu hỏi làm rõ khi thiếu thông tin.
 */
export function planLocally(
  commands: AssistantCommand[],
  context: Pick<DirectorContext, 'musicTracks'>,
  memory: StyleMemory,
): DirectorPlan {
  const out = [...commands]
  const has = (kind: AssistantCommand['kind']) => out.some((c) => c.kind === kind)
  const questions: string[] = []
  if (has('captions') && !has('captionsStyle')) {
    const template = topChoice(memory, 'captionsTemplate')
    if (template) out.push(normalizeAssistantCommands([{ kind: 'captionsStyle', template }])[0]!)
  }
  if (has('music')) {
    if (context.musicTracks.length === 0)
      questions.push(
        'Kho nhạc của bạn đang trống. Thêm nhạc ở Thư viện → Âm thanh → YouTube rồi thử lại, hay bỏ qua nhạc nền?',
      )
    else {
      const volume = topChoice(memory, 'musicVolume')
      if (volume)
        out.forEach((c, i) => {
          if (c.kind === 'music' && c.volume === 0.4) out[i] = { ...c, volume: Number(volume) }
        })
    }
  }
  return { summary: '', questions, commands: normalizeAssistantCommands(out) }
}
