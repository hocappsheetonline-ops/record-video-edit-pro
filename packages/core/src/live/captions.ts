/** Phụ đề trực tiếp: giữ vài câu gần nhất, ẩn sau một khoảng không có lời nói mới. */
export class LiveCaptionBuffer {
  private entries: { text: string; at: number }[] = []

  constructor(
    private readonly maxChars = 90,
    private readonly holdMs = 8000,
  ) {}

  push(text: string, at: number): void {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) return
    this.entries.push({ text: clean, at })
  }

  /** Văn bản hiển thị tại thời điểm `now`: các câu mới nhất, tối đa `maxChars` ký tự. */
  text(now: number): string {
    this.entries = this.entries.filter((e) => now - e.at <= this.holdMs)
    let out = ''
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const next = out ? `${this.entries[i]!.text} ${out}` : this.entries[i]!.text
      if (next.length > this.maxChars) {
        if (!out) out = `…${next.slice(-this.maxChars)}`
        break
      }
      out = next
    }
    return out
  }
}
