// Tạo lại model rnnoise (định dạng "rnnoise-nu model file version 1") với lớp VAD GRU được đệm
// thêm nơ-ron rỗng sao cho mọi lớp GRU có số đầu vào chia hết cho 4.
//
// Lý do: bộ lọc arnndn của FFmpeg (6.1 → 7.1) tính tích vô hướng trên FFALIGN(số đầu vào, 4) phần
// tử, đọc lố vài phần tử của mảng tạm trên stack chưa được gán. Trọng số ở phần đệm bằng 0, nhưng
// nếu rác trên stack là NaN/Inf thì 0 × NaN = NaN và trạng thái mạng hỏng cả file → lọc tạp âm kém
// một cách ngẫu nhiên (thấy rõ trên Windows). Model gốc somnolent-hogwash có noise_gru 90 đầu vào và
// denoise_gru 114 đầu vào (không chia hết cho 4). Thêm 2 nơ-ron vào vad_gru (24 → 26, mọi trọng số
// và bias bằng 0, kích hoạt tanh nên đầu ra luôn đúng 0) làm các lớp sau thành 92 và 116 đầu vào,
// kết quả tính toán không đổi.
//
// Cách dùng: node scripts/pad-rnnoise-model.mjs <model gốc> <model ra>
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Cách dùng: node scripts/pad-rnnoise-model.mjs <model gốc> <model ra>')
  process.exit(1)
}

const text = readFileSync(input, 'utf8')
const newline = text.indexOf('\n')
const header = text.slice(0, newline)
if (header.trim() !== 'rnnoise-nu model file version 1')
  throw new Error('Không phải model rnnoise-nu')
const tokens = text
  .slice(newline + 1)
  .trim()
  .split(/\s+/)
  .map(Number)
let pos = 0
const take = (n) => {
  const out = tokens.slice(pos, pos + n)
  if (out.length !== n) throw new Error('Model bị cụt')
  pos += n
  return out
}

function readDense() {
  const [m, n, act] = take(3)
  return { m, n, act, weights: take(m * n), bias: take(n) }
}
function readGru() {
  const [m, n, act] = take(3)
  return { m, n, act, input: take(m * n * 3), recurrent: take(n * n * 3), bias: take(n * 3) }
}

const inputDense = readDense()
const vadGru = readGru()
const noiseGru = readGru()
const denoiseGru = readGru()
const denoiseOutput = readDense()
const vadOutput = readDense()
if (pos !== tokens.length) throw new Error('Model có dữ liệu thừa')

const PAD = (4 - ((inputDense.n + vadGru.n + 42) % 4)) % 4
if (PAD === 0) {
  writeFileSync(output, text)
  console.log('Model đã thẳng hàng, giữ nguyên')
  process.exit(0)
}

// Trọng số đầu vào GRU trong file: với mỗi đầu vào k, mỗi cổng g (3), mỗi nơ-ron j.
const gruInput = (layer, mapInput, newM, newN) => {
  const out = []
  for (let k = 0; k < newM; k++) {
    const src = mapInput(k)
    for (let g = 0; g < 3; g++)
      for (let j = 0; j < newN; j++)
        out.push(src === null || j >= layer.n ? 0 : layer.input[(src * 3 + g) * layer.n + j])
  }
  return out
}
const gruRecurrent = (layer, newN) => {
  const out = []
  for (let k = 0; k < newN; k++)
    for (let g = 0; g < 3; g++)
      for (let j = 0; j < newN; j++)
        out.push(k >= layer.n || j >= layer.n ? 0 : layer.recurrent[(k * 3 + g) * layer.n + j])
  return out
}
const gruBias = (layer, newN) => {
  const out = []
  for (let g = 0; g < 3; g++)
    for (let j = 0; j < newN; j++) out.push(j >= layer.n ? 0 : layer.bias[g * layer.n + j])
  return out
}

const vadN = vadGru.n + PAD
const dense = inputDense.n
// vad_gru: đầu vào giữ nguyên, thêm nơ-ron rỗng.
const vad = {
  m: vadGru.m,
  n: vadN,
  act: vadGru.act,
  input: gruInput(vadGru, (k) => k, vadGru.m, vadN),
  recurrent: gruRecurrent(vadGru, vadN),
  bias: gruBias(vadGru, vadN),
}
// noise_gru: [dense, vad (đệm), đặc trưng] — chèn đầu vào rỗng sau phần vad gốc.
const noiseMap = (k) => (k < dense + vadGru.n ? k : k < dense + vadN ? null : k - PAD)
const noise = {
  ...noiseGru,
  m: noiseGru.m + PAD,
  input: gruInput(noiseGru, noiseMap, noiseGru.m + PAD, noiseGru.n),
}
// denoise_gru: [vad (đệm), noise, đặc trưng].
const denoiseMap = (k) => (k < vadGru.n ? k : k < vadN ? null : k - PAD)
const denoise = {
  ...denoiseGru,
  m: denoiseGru.m + PAD,
  input: gruInput(denoiseGru, denoiseMap, denoiseGru.m + PAD, denoiseGru.n),
}
// vad_output: trọng số dense theo thứ tự [đầu vào][nơ-ron]; thêm đầu vào rỗng ở cuối.
const vadOut = {
  ...vadOutput,
  m: vadN,
  weights: [...vadOutput.weights, ...new Array(PAD * vadOutput.n).fill(0)],
}

const lines = [header]
const dense2 = (l) => lines.push(`${l.m} ${l.n} ${l.act}`, l.weights.join(' '), l.bias.join(' '))
const gru2 = (l) =>
  lines.push(`${l.m} ${l.n} ${l.act}`, l.input.join(' '), l.recurrent.join(' '), l.bias.join(' '))
dense2(inputDense)
gru2(vad)
gru2(noise)
gru2(denoise)
dense2(denoiseOutput)
dense2(vadOut)
writeFileSync(output, `${lines.join('\n')}\n`)
console.log(
  `vad_gru ${vadGru.n} → ${vadN}; noise_gru ${noise.m} đầu vào; denoise_gru ${denoise.m} đầu vào`,
)
