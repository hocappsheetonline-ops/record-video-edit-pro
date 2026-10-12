/**
 * Xóa phông (chroma key) cho video / ảnh meme, chạy trên mảng điểm ảnh RGBA (ImageData.data).
 *
 * - Phông có màu (xanh lá, xanh dương…): điểm ảnh càng "trội" kênh màu đó so với hai kênh còn lại
 *   thì càng trong suốt; viền chuyển mềm và khử ám màu phông lên chủ thể (spill).
 * - Phông đen / trắng: dựa trên độ sáng.
 *
 * `strength` 0..1: càng lớn xóa càng mạnh (ăn cả vùng hơi giống màu phông).
 */
export function chromaKey(data: Uint8ClampedArray, keyColor: string, strength: number): void {
  const key = parseHex(keyColor)
  if (!key) return
  const s = Math.max(0, Math.min(1, strength))
  const soft = 0.12
  const spread = Math.max(...key) - Math.min(...key)
  if (spread > 0.3) {
    // Kênh trội của màu phông: 0 = đỏ, 1 = xanh lá, 2 = xanh dương.
    const c = key.indexOf(Math.max(...key))
    const a = (c + 1) % 3
    const b = (c + 2) % 3
    const threshold = 0.3 - 0.25 * s
    for (let i = 0; i < data.length; i += 4) {
      const main = data[i + c]!
      const other = Math.max(data[i + a]!, data[i + b]!)
      const dominance = (main - other) / 255
      if (dominance <= 0) continue
      const alpha = clamp01((threshold + soft - dominance) / soft)
      data[i + 3] = Math.round(data[i + 3]! * alpha)
      // Khử ám màu phông ở viền và trên chủ thể.
      data[i + c] = other
    }
    return
  }
  const dark = key[0]! + key[1]! + key[2]! < 1.5
  const threshold = 0.05 + 0.35 * s
  for (let i = 0; i < data.length; i += 4) {
    const y = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255
    const v = dark ? y : 1 - y
    const alpha = clamp01((v - threshold) / soft)
    if (alpha < 1) data[i + 3] = Math.round(data[i + 3]! * alpha)
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255]
}
