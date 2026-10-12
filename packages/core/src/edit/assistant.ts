import { CAPTION_TEMPLATES, type CaptionTemplate } from './caption-style'
import { EFFECT_KINDS, type EffectKind } from './effects'
import { ASPECTS, type Aspect } from './layout'
import { FILTER_PRESETS, type FilterPreset } from './look'
import { RESOLUTIONS, type Resolution } from './layout'
import { TRANSITION_KINDS, type TransitionKind } from './transitions'

/**
 * Lệnh chỉnh sửa mà trợ lý AI (kiểu EditPilot của CapCut) có thể ra: người dùng mô tả bằng lời,
 * Claude (hoặc bộ phân tích từ khóa khi không có key) đổi thành danh sách lệnh, app thực hiện.
 */
export type AssistantCommand =
  | { kind: 'cutSilences' }
  | { kind: 'removeFillers' }
  | { kind: 'autoZoom' }
  | { kind: 'captions' }
  | { kind: 'cleanAudio' }
  | { kind: 'title'; text: string }
  | { kind: 'filter'; preset: FilterPreset; intensity: number }
  | { kind: 'speed'; factor: number }
  | { kind: 'aspect'; aspect: Aspect }
  | { kind: 'trimStart'; ms: number }
  | { kind: 'trimEnd'; ms: number }
  /** Hiệu ứng hình tại đầu video và mỗi chỗ nối clip. */
  | { kind: 'effect'; effect: EffectKind }
  /** Chuyển cảnh cho mọi chỗ nối. */
  | { kind: 'transitions'; transition: TransitionKind }
  /** Nhạc nền từ kho nhạc của tôi (tìm theo từ khóa trong tên bài), âm lượng 0–1. */
  | { kind: 'music'; query: string; volume: number }
  /** Mẫu phụ đề (tiktok, karaoke, neon…). */
  | { kind: 'captionsStyle'; template: CaptionTemplate }
  /** Đặt cài đặt xuất rồi xuất luôn. */
  | { kind: 'export'; resolution: Resolution; format: 'mp4' | 'gif' }
  /** Áp dụng phong cách (khung hình, bộ lọc, phụ đề, chuyển động…) của một dự án mẫu. */
  | { kind: 'styleFrom'; project: string }

export type AssistantKind = AssistantCommand['kind']

export const ASSISTANT_KINDS: readonly AssistantKind[] = [
  'cutSilences',
  'removeFillers',
  'autoZoom',
  'captions',
  'cleanAudio',
  'title',
  'filter',
  'speed',
  'aspect',
  'trimStart',
  'trimEnd',
  'effect',
  'transitions',
  'music',
  'captionsStyle',
  'export',
  'styleFrom',
]

/** Thông tin về video gửi kèm yêu cầu để AI ra lệnh phù hợp. */
export interface AssistantContext {
  language: string
  durationMs: number
  hasTranscript: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Kiểm tra dữ liệu lệnh (từ Claude hoặc từ file) và bỏ lệnh sai; lệnh trùng chỉ giữ một. */
export function normalizeAssistantCommands(input: unknown): AssistantCommand[] {
  if (!Array.isArray(input)) return []
  const out: AssistantCommand[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    let cmd: AssistantCommand | null = null
    switch (r.kind) {
      case 'cutSilences':
      case 'removeFillers':
      case 'autoZoom':
      case 'captions':
      case 'cleanAudio':
        cmd = { kind: r.kind }
        break
      case 'title':
        if (typeof r.text === 'string' && r.text.trim())
          cmd = { kind: 'title', text: r.text.trim().slice(0, 80) }
        break
      case 'filter':
        if (FILTER_PRESETS.includes(r.preset as FilterPreset))
          cmd = {
            kind: 'filter',
            preset: r.preset as FilterPreset,
            intensity: typeof r.intensity === 'number' ? clamp(r.intensity, 0.1, 1) : 1,
          }
        break
      case 'speed':
        if (typeof r.factor === 'number' && Number.isFinite(r.factor) && r.factor > 0)
          cmd = { kind: 'speed', factor: clamp(Number(r.factor.toFixed(2)), 0.25, 8) }
        break
      case 'aspect':
        if (ASPECTS.includes(r.aspect as Aspect))
          cmd = { kind: 'aspect', aspect: r.aspect as Aspect }
        break
      case 'trimStart':
      case 'trimEnd':
        if (typeof r.ms === 'number' && r.ms > 0)
          cmd = { kind: r.kind, ms: Math.round(clamp(r.ms, 1, 3_600_000)) }
        break
      case 'effect':
        if (EFFECT_KINDS.includes(r.effect as EffectKind))
          cmd = { kind: 'effect', effect: r.effect as EffectKind }
        break
      case 'transitions':
        if (TRANSITION_KINDS.includes(r.transition as TransitionKind))
          cmd = { kind: 'transitions', transition: r.transition as TransitionKind }
        break
      case 'music':
        cmd = {
          kind: 'music',
          query: typeof r.query === 'string' ? r.query.trim().slice(0, 60) : '',
          volume: typeof r.volume === 'number' ? clamp(r.volume, 0.05, 1) : 0.4,
        }
        break
      case 'captionsStyle':
        if (CAPTION_TEMPLATES.includes(r.template as CaptionTemplate))
          cmd = { kind: 'captionsStyle', template: r.template as CaptionTemplate }
        break
      case 'export':
        cmd = {
          kind: 'export',
          resolution: RESOLUTIONS.includes(r.resolution as Resolution)
            ? (r.resolution as Resolution)
            : 1080,
          format: r.format === 'gif' ? 'gif' : 'mp4',
        }
        break
      case 'styleFrom':
        if (typeof r.project === 'string' && r.project.trim())
          cmd = { kind: 'styleFrom', project: r.project.trim().slice(0, 200) }
        break
    }
    if (!cmd) continue
    const key = cmd.kind === 'trimStart' || cmd.kind === 'trimEnd' ? cmd.kind : cmd.kind
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cmd)
  }
  return out
}

const FILTER_WORDS: [RegExp, FilterPreset][] = [
  [/điện ảnh|cinematic|cinema/i, 'cinematic'],
  [/cổ điển|vintage|retro/i, 'vintage'],
  [/\blạnh\b|\bcold\b|\bcool\b/i, 'cold'],
  [/\bấm\b|\bwarm\b/i, 'warm'],
  [/đen trắng|trắng đen|black and white|\bb&w\b|\bbw\b|grayscale/i, 'bw'],
  [/phai màu|\bfade(d)?\b/i, 'fade'],
  [/rực rỡ|\bvivid\b|saturated/i, 'vivid'],
  [/\bnoir\b/i, 'noir'],
  [/\bpastel\b/i, 'pastel'],
  [/xanh cam|teal.?orange|teal and orange/i, 'tealOrange'],
  [/hoàng hôn|\bsunset\b/i, 'sunset'],
]

/** "1,5x", "x2", "2 lần", "1.5 times", "gấp đôi" → hệ số tốc độ. */
function parseSpeed(text: string): number | null {
  const m =
    /(?:x\s*(\d+(?:[.,]\d+)?))|(?:(\d+(?:[.,]\d+)?)\s*(?:x|lần|times|×))/i.exec(text) ??
    /(?:tốc độ|speed)\D{0,12}(\d+(?:[.,]\d+)?)/i.exec(text)
  const n = m ? Number((m[1] ?? m[2] ?? '').replace(',', '.')) : NaN
  if (Number.isFinite(n) && n > 0) return n
  if (/gấp đôi|double|twice/i.test(text)) return 2
  if (/chậm lại|slow(er| down)?|slow motion/i.test(text)) return 0.5
  if (/nhanh (lên|hơn)|faster|speed up/i.test(text)) return 1.5
  return null
}

/** "5 giây", "10s", "1 phút" → ms. */
function parseSeconds(part: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(giây|s\b|sec|seconds?|phút|min|minutes?)/i.exec(part)
  if (!m) return null
  const n = Number(m[1]!.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * (/phút|min/i.test(m[2]!) ? 60_000 : 1000))
}

/**
 * Hiểu yêu cầu bằng từ khóa (tiếng Việt / tiếng Anh) khi không có key Claude, hoặc để bổ sung
 * khi Claude không trả lệnh nào. Không hiểu thì trả về mảng rỗng.
 */
export function parseAssistantRequest(text: string): AssistantCommand[] {
  const t = text.trim()
  if (!t) return []
  const out: AssistantCommand[] = []
  const push = (c: AssistantCommand) => {
    if (!out.some((x) => x.kind === c.kind)) out.push(c)
  }
  if (/tự biên tập|tự chỉnh|auto.?edit|làm gọn|dọn dẹp|clean ?up|tidy/i.test(t)) {
    push({ kind: 'cutSilences' })
    push({ kind: 'removeFillers' })
    push({ kind: 'autoZoom' })
    push({ kind: 'cleanAudio' })
  }
  if (/khoảng lặng|im lặng|khoảng trống|silence|silent|pause|dead air/i.test(t))
    push({ kind: 'cutSilences' })
  if (/từ thừa|từ đệm|nói lặp|ừm|filler|stutter|repeat/i.test(t)) push({ kind: 'removeFillers' })
  if (/zoom|phóng to theo chuột|phóng to chỗ bấm/i.test(t)) push({ kind: 'autoZoom' })
  if (/phụ đề|caption|subtitle/i.test(t)) push({ kind: 'captions' })
  if (/tạp âm|lọc ồn|tiếng ồn|giọng rõ|chuẩn hóa|noise|audio|voice|loudness/i.test(t))
    push({ kind: 'cleanAudio' })

  const title = /(?:tiêu đề|title)\s*(?:là|:|=|["“'])?\s*["“']?([^"”'\n,;.]{2,80})/i.exec(t)
  if (title) push({ kind: 'title', text: title[1]!.trim() })

  for (const [re, preset] of FILTER_WORDS)
    if (re.test(t) && /bộ lọc|filter|màu|tông|look|style|kiểu/i.test(t)) {
      push({ kind: 'filter', preset, intensity: 1 })
      break
    }

  if (/tốc độ|speed|nhanh|chậm|fast|slow|\d\s*x\b|x\s*\d|gấp đôi|lần/i.test(t)) {
    const factor = parseSpeed(t)
    if (factor) push({ kind: 'speed', factor })
  }

  // "phụ đề kiểu TikTok" nói về mẫu phụ đề, không phải khung dọc: bỏ cụm đó trước khi đoán khung.
  const forAspect = t.replace(/(?:phụ đề|caption|subtitle)[^,.;]*/gi, '')
  if (/9\s*:\s*16|dọc|vertical|tiktok|shorts|reels|portrait/i.test(forAspect))
    push({ kind: 'aspect', aspect: '9:16' })
  else if (/1\s*:\s*1|vuông|square/i.test(forAspect)) push({ kind: 'aspect', aspect: '1:1' })
  else if (/16\s*:\s*9|ngang|landscape|youtube/i.test(forAspect))
    push({ kind: 'aspect', aspect: '16:9' })
  else if (/4\s*:\s*3/.test(forAspect)) push({ kind: 'aspect', aspect: '4:3' })

  const start =
    /(?:cắt|bỏ|xóa|trim|cut|remove|skip)\s+(.{0,24}?)(?:đầu|first|beginning|intro|start)/i.exec(t)
  const startMs = start ? parseSeconds(start[1]!) : null
  if (startMs) push({ kind: 'trimStart', ms: startMs })
  const end = /(?:cắt|bỏ|xóa|trim|cut|remove)\s+(.{0,24}?)(?:cuối|last|end(ing)?|outro)/i.exec(t)
  const endMs = end ? parseSeconds(end[1]!) : null
  if (endMs) push({ kind: 'trimEnd', ms: endMs })

  for (const [re, effect] of EFFECT_WORDS)
    if (re.test(t)) {
      push({ kind: 'effect', effect })
      break
    }
  if (/chuyển cảnh|transition/i.test(t)) {
    const transition = TRANSITION_WORDS.find(([re]) => re.test(t))?.[1] ?? 'fadeBlack'
    push({ kind: 'transitions', transition })
  }
  if (/nhạc|music|soundtrack/i.test(t) && !/tắt nhạc|bỏ nhạc|no music|mute music/i.test(t)) {
    const query =
      /(?:nhạc nền|nhạc|music)\s+(?:kiểu\s+|nền\s+)?([\p{L}\d][\p{L}\d\s-]{1,24}?)(?=[,.;]|\s+(?:và|rồi|và|then|and)\b|$)/iu.exec(
        t,
      )?.[1] ?? ''
    const quiet = /nhỏ|nhẹ|quiet|soft|low/i.test(t)
    push({ kind: 'music', query: query.trim(), volume: quiet ? 0.25 : 0.4 })
  }
  const template = CAPTION_WORDS.find(([re]) => re.test(t))?.[1]
  if (template) {
    push({ kind: 'captions' })
    push({ kind: 'captionsStyle', template })
  }
  if (/xuất|export|render|lưu video|save video/i.test(t)) {
    const res = /(2160|4k|1440|1080|720)/i.exec(t)?.[1]
    push({
      kind: 'export',
      resolution: res === '4k' ? 2160 : res ? (Number(res) as 720 | 1080 | 1440 | 2160) : 1080,
      format: /\bgif\b/i.test(t) ? 'gif' : 'mp4',
    })
  }
  return normalizeAssistantCommands(out)
}

const EFFECT_WORDS: [RegExp, EffectKind][] = [
  [/rung lắc|rung|shake/i, 'shake'],
  [/glitch|nhiễu số/i, 'glitch'],
  [/\bvhs\b|băng cũ/i, 'vhs'],
  [/pháo giấy|confetti|ăn mừng|celebrat/i, 'confetti'],
  [/lóe sáng|flash/i, 'flash'],
  [/nhún theo nhịp|pulse|beat/i, 'pulse'],
  [/viền tối|vignette/i, 'vignette'],
]
const TRANSITION_WORDS: [RegExp, TransitionKind][] = [
  [/trắng|white/i, 'fadeWhite'],
  [/lóe|flash/i, 'flash'],
  [/phóng|zoom/i, 'zoom'],
  [/nhòe|mờ dần|blur/i, 'blur'],
  [/lướt|slide/i, 'slide'],
  [/glitch/i, 'glitch'],
  [/đen|black|mờ/i, 'fadeBlack'],
]
const CAPTION_WORDS: [RegExp, CaptionTemplate][] = [
  [/phụ đề.{0,20}(tiktok|kiểu tiktok)|tiktok.{0,12}caption/i, 'tiktok'],
  [/karaoke/i, 'karaoke'],
  [/neon/i, 'neon'],
  [/phụ đề.{0,20}(nảy|bounce)/i, 'bounceWord'],
  [/phụ đề.{0,20}(bật|pop)/i, 'popWord'],
  [/phụ đề.{0,20}(gạch chân|underline)/i, 'underline'],
  [/phụ đề.{0,20}(viền|outline)/i, 'outline'],
  [/phụ đề.{0,20}(hộp|khối|box)/i, 'box'],
]
