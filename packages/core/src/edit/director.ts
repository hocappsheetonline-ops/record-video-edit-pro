import {
  assistantCommandKey,
  normalizeAssistantCommands,
  type AssistantCommand,
  type RecipeStyle,
} from './assistant'
import { buildCaptionLines, linesOnOutput, type TranscriptWord } from './captions'
import type { ClickMark } from './cursor'
import type { EditState } from './edit-state'
import { cutPoints } from './transitions'
import { outputDuration, sourceToOutput, type Clip } from './timeline'

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
  /** Lời thoại có mốc thời gian trên video xuất (xem `transcriptExcerpt`), để AI đặt chữ / zoom / mốc đúng lúc. */
  transcript?: string
  /** Thời điểm bấm chuột trên video xuất (ms), để AI đặt zoom / mũi tên đúng chỗ bấm. */
  clicks?: number[]
  /** Tóm tắt bản dựng hiện tại (xem `editSummary`), để AI không làm trùng. */
  edit?: string
}

/** "1:05.2" cho 65 200 ms. */
function stamp(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100) / 10)
  const m = Math.floor(total / 60)
  const sec = total - m * 60
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`
}

/**
 * Lời thoại thành các dòng ngắn có mốc thời gian trên video xuất ("[0:03.5] câu nói"), bỏ phần đã
 * cắt; giới hạn số dòng và số ký tự để lời nhắc không quá dài (dòng cuối ghi "…" khi bị cắt).
 */
export function transcriptExcerpt(
  words: readonly TranscriptWord[],
  clips: readonly Clip[],
  limits: { maxLines?: number; maxChars?: number } = {},
): string {
  if (words.length === 0) return ''
  const maxLines = limits.maxLines ?? 80
  const maxChars = limits.maxChars ?? 4000
  const lines = linesOnOutput(
    buildCaptionLines(words, { maxChars: 60, maxDurationMs: 6000 }),
    clips,
  )
  const out: string[] = []
  let chars = 0
  for (const line of lines) {
    const text = `[${stamp(line.start)}] ${line.text}`
    if (out.length >= maxLines || chars + text.length > maxChars) {
      out.push('…')
      break
    }
    out.push(text)
    chars += text.length + 1
  }
  return out.join('\n')
}

/** Thời điểm bấm chuột trên video xuất (ms), gộp các lần bấm cách nhau dưới `gapMs`, tối đa `max`. */
export function outputClicks(
  clicks: readonly ClickMark[],
  clips: readonly Clip[],
  options: { gapMs?: number; max?: number } = {},
): number[] {
  const gap = options.gapMs ?? 500
  const max = options.max ?? 60
  const out: number[] = []
  const times = clicks
    .map((c) => sourceToOutput(clips, c.s))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b)
  for (const t of times) {
    const ms = Math.round(t)
    if (out.length > 0 && ms - out[out.length - 1]! < gap) continue
    out.push(ms)
    if (out.length >= max) break
  }
  return out
}

/** Một dòng tóm tắt bản dựng hiện tại (số đoạn cắt, zoom, lớp, nhạc, phụ đề…), bằng tiếng Anh cho AI. */
export function editSummary(edit: EditState): string {
  const parts: string[] = []
  parts.push(`duration ${Math.round(outputDuration(edit.clips) / 1000)} s`)
  parts.push(`${edit.clips.length} clip(s), ${cutPoints(edit.clips).length} cut(s)`)
  parts.push(`aspect ${edit.frame.aspect}${edit.frame.fill ? ' (fill)' : ''}`)
  parts.push(`${edit.zooms.length} zoom(s)`)
  parts.push(`${edit.transitions.length} transition(s)`)
  parts.push(`${edit.effects.length} effect(s)`)
  parts.push(`${edit.overlays.length} overlay(s)`)
  const music = edit.audioClips.filter((c) => c.kind === 'music').length
  const sfx = edit.audioClips.length - music
  parts.push(`${music} music track(s), ${sfx} sound effect(s)`)
  parts.push(
    edit.captions.enabled && edit.captions.lines.length > 0
      ? `captions on (${edit.captions.look.template})`
      : 'captions off',
  )
  if (edit.look.filter !== 'none') parts.push(`filter ${edit.look.filter}`)
  if (edit.markers.length > 0) parts.push(`${edit.markers.length} marker(s)`)
  if (edit.audio.duck.enabled) parts.push('music ducking on')
  return parts.join('; ')
}

/** Ngữ cảnh để mở rộng công thức dựng. */
export interface RecipeContext {
  hasCursor: boolean
  hasMusic: boolean
  durationMs: number
}

/**
 * Mở rộng một công thức dựng thành lệnh cụ thể, theo cách dựng video chuyên nghiệp:
 * - `youtube`: hướng dẫn dài 16:9 — cắt lặng / từ thừa, giọng sạch, zoom theo chuột mượt, hiện
 *   phím tắt, phụ đề hộp dưới, nhạc nền rất nhỏ tự giảm khi nói, mốc chương khi video > 1 phút.
 * - `shorts`: TikTok / Shorts / Reels — khung dọc, nhịp nhanh (cắt lặng, từ thừa), phụ đề TikTok
 *   to ở giữa, zoom theo chuột, chuyển cảnh zoom ngắn, nhạc nền nhỏ tự giảm khi nói.
 * - `vlog`: nói trước camera — cắt lặng, giọng sạch, phụ đề karaoke, tông ấm, nhạc nền nhẹ.
 * - `clean`: tối giản — chỉ cắt lặng, giọng sạch, phụ đề viền cả dòng, lề nhỏ.
 */
export function expandRecipe(style: RecipeStyle, ctx: RecipeContext): AssistantCommand[] {
  const out: AssistantCommand[] = []
  const music = (volume: number, duckLevel: number) => {
    if (!ctx.hasMusic) return
    out.push({ kind: 'music', query: '', volume })
    out.push({ kind: 'duck', enabled: true, level: duckLevel })
    out.push({ kind: 'fade', ms: 1500 })
  }
  switch (style) {
    case 'youtube':
      out.push({ kind: 'aspect', aspect: '16:9' })
      out.push({ kind: 'cutSilences' }, { kind: 'removeFillers' }, { kind: 'cleanAudio' })
      if (ctx.hasCursor) {
        out.push({ kind: 'autoZoom' })
        out.push({ kind: 'motion', cameraSpeed: 0.8, zoomMs: 600 })
        out.push({ kind: 'cursor', clickEffect: true, showKeys: true })
      }
      out.push({ kind: 'captions' }, { kind: 'captionsStyle', template: 'box' })
      out.push({ kind: 'captionsLayout', position: 'bottom', size: 1 })
      music(0.2, 0.25)
      if (ctx.durationMs > 60_000) out.push({ kind: 'chapters' })
      break
    case 'shorts':
      out.push({ kind: 'aspect', aspect: '9:16' })
      out.push({ kind: 'cutSilences' }, { kind: 'removeFillers' }, { kind: 'cleanAudio' })
      if (ctx.hasCursor) {
        out.push({ kind: 'autoZoom' })
        out.push({ kind: 'motion', cameraSpeed: 0.9, zoomMs: 400 })
      }
      out.push({ kind: 'captions' }, { kind: 'captionsStyle', template: 'tiktok' })
      out.push({ kind: 'captionsLayout', position: 'bottom', size: 1.2 })
      out.push({ kind: 'transitions', transition: 'zoom', ms: 300 })
      music(0.3, 0.2)
      break
    case 'vlog':
      out.push({ kind: 'cutSilences' }, { kind: 'removeFillers' }, { kind: 'cleanAudio' })
      out.push({ kind: 'captions' }, { kind: 'captionsStyle', template: 'karaoke' })
      out.push({ kind: 'filter', preset: 'warm', intensity: 0.6 })
      music(0.25, 0.25)
      break
    case 'clean':
      out.push({ kind: 'cutSilences' }, { kind: 'cleanAudio' })
      out.push({ kind: 'captions' }, { kind: 'captionsStyle', template: 'outline' })
      out.push({ kind: 'captionsLook', style: 'classic' })
      out.push({ kind: 'frame', padding: 0.04, shadow: 0.3 })
      break
  }
  return out
}

/**
 * Thay mỗi lệnh `recipe` bằng các lệnh của công thức; lệnh người dùng / AI nêu rõ được giữ nguyên
 * và thắng lệnh cùng loại của công thức (so theo khóa lệnh). Thứ tự: lệnh công thức đứng ở chỗ
 * của lệnh `recipe`.
 */
export function expandRecipes(
  commands: AssistantCommand[],
  ctx: RecipeContext,
): AssistantCommand[] {
  if (!commands.some((c) => c.kind === 'recipe')) return commands
  const explicit = new Set(
    commands.filter((c) => c.kind !== 'recipe').map((c) => assistantCommandKey(c)),
  )
  const out: AssistantCommand[] = []
  const seen = new Set<string>()
  for (const c of commands) {
    const items = c.kind === 'recipe' ? expandRecipe(c.style, ctx) : [c]
    for (const item of items) {
      const key = assistantCommandKey(item)
      if (seen.has(key)) continue
      // Lệnh của công thức nhường lệnh nêu rõ cùng loại (lệnh nêu rõ sẽ tới lượt sau hoặc đã có).
      if (c.kind === 'recipe' && explicit.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
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
  context: Pick<DirectorContext, 'musicTracks'> &
    Partial<Pick<DirectorContext, 'hasCursor' | 'durationMs'>>,
  memory: StyleMemory,
): DirectorPlan {
  const out = [
    ...expandRecipes(commands, {
      hasCursor: context.hasCursor ?? true,
      hasMusic: context.musicTracks.length > 0,
      durationMs: context.durationMs ?? 0,
    }),
  ]
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
