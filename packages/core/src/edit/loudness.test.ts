import { describe, expect, it } from 'vitest'
import { LOUDNESS_SPECS, loudnormFilter, parseLoudnormJson } from './loudness'

/** Phần cuối stderr thật của `ffmpeg ... -af loudnorm=print_format=json -f null -`. */
const STDERR = `[Parsed_loudnorm_3 @ 0x55d0c]
{
	"input_i" : "-27.61",
	"input_tp" : "-4.47",
	"input_lra" : "18.06",
	"input_thresh" : "-39.20",
	"output_i" : "-14.13",
	"output_tp" : "-1.00",
	"output_lra" : "9.20",
	"output_thresh" : "-25.00",
	"normalization_type" : "dynamic",
	"target_offset" : "0.13"
}
`

describe('parseLoudnormJson', () => {
  it('đọc số đo lượt 1 từ stderr', () => {
    expect(parseLoudnormJson(`Input #0, wav...\n${STDERR}`)).toEqual({
      inputI: -27.61,
      inputTp: -4.47,
      inputLra: 18.06,
      inputThresh: -39.2,
      targetOffset: 0.13,
    })
  })

  it('im lặng hoàn toàn: -inf; stderr hỏng → null', () => {
    const silent = STDERR.replace('"-27.61"', '"-inf"').replace('"-4.47"', '"-inf"')
    expect(parseLoudnormJson(silent)?.inputI).toBe(-Infinity)
    expect(parseLoudnormJson('Error opening input')).toBeNull()
    expect(parseLoudnormJson('{ "input_i": "x" }')).toBeNull()
  })
})

describe('loudnormFilter', () => {
  const yt = LOUDNESS_SPECS.youtube

  it('YouTube: -14 LUFS, đỉnh -1 dBTP', () => {
    expect(yt).toEqual({ i: -14, tp: -1, lra: 11 })
    expect(loudnormFilter(yt)).toBe('loudnorm=I=-14:TP=-1:LRA=11')
  })

  it('có số đo thì chỉnh tuyến tính; LRA đích không nhỏ hơn LRA đo được', () => {
    expect(loudnormFilter(yt, parseLoudnormJson(STDERR))).toBe(
      'loudnorm=I=-14:TP=-1:LRA=19:measured_I=-27.61:measured_TP=-4.47:measured_LRA=18.06:' +
        'measured_thresh=-39.2:offset=0.13:linear=true',
    )
  })

  it('âm thanh im lặng thì bỏ qua (không kéo tiếng ồn lên)', () => {
    const m = parseLoudnormJson(STDERR)!
    expect(loudnormFilter(yt, { ...m, inputI: -Infinity })).toBeNull()
    expect(loudnormFilter(yt, { ...m, inputI: -80 })).toBeNull()
  })
})
