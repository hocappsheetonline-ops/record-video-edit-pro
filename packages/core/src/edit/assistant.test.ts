import { describe, expect, it } from 'vitest'
import { normalizeAssistantCommands, parseAssistantRequest } from './assistant'

describe('parseAssistantRequest', () => {
  it('hiểu yêu cầu tiếng Việt nhiều lệnh một lúc', () => {
    expect(
      parseAssistantRequest(
        'Cắt khoảng lặng, bỏ từ thừa, thêm phụ đề, bộ lọc cổ điển, tốc độ 1,5x, làm video dọc 9:16, tiêu đề "Mở đầu khóa học", cắt 5 giây đầu và bỏ 10 giây cuối',
      ),
    ).toEqual([
      { kind: 'cutSilences' },
      { kind: 'removeFillers' },
      { kind: 'captions' },
      { kind: 'title', text: 'Mở đầu khóa học' },
      { kind: 'filter', preset: 'vintage', intensity: 1 },
      { kind: 'speed', factor: 1.5 },
      { kind: 'aspect', aspect: '9:16' },
      { kind: 'trimStart', ms: 5000 },
      { kind: 'trimEnd', ms: 10_000 },
    ])
  })

  it('hiểu tiếng Anh, "tự biên tập" gom nhiều bước, không hiểu thì rỗng', () => {
    expect(
      parseAssistantRequest('remove silences and add captions, cinematic filter, speed up'),
    ).toEqual([
      { kind: 'cutSilences' },
      { kind: 'captions' },
      { kind: 'filter', preset: 'cinematic', intensity: 1 },
      { kind: 'speed', factor: 1.5 },
    ])
    expect(parseAssistantRequest('tự biên tập cho gọn').map((c) => c.kind)).toEqual([
      'cutSilences',
      'removeFillers',
      'autoZoom',
      'cleanAudio',
    ])
    expect(parseAssistantRequest('xin chào')).toEqual([])
    expect(parseAssistantRequest('')).toEqual([])
  })

  it('normalize: bỏ lệnh sai, giới hạn giá trị, bỏ trùng', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'speed', factor: 99 },
        { kind: 'speed', factor: 2 },
        { kind: 'filter', preset: 'nope' },
        { kind: 'aspect', aspect: '9:16' },
        { kind: 'title', text: '  ' },
        { kind: 'trimStart', ms: -5 },
        { kind: 'trimEnd', ms: 2500.4 },
        'junk',
        { kind: 'captions' },
      ]),
    ).toEqual([
      { kind: 'speed', factor: 8 },
      { kind: 'aspect', aspect: '9:16' },
      { kind: 'trimEnd', ms: 2500 },
      { kind: 'captions' },
    ])
    expect(normalizeAssistantCommands('x')).toEqual([])
  })
})

describe('lệnh mở rộng (hầu hết tính năng chỉnh sửa)', () => {
  it('normalize: đọc đúng từng lệnh mới, kẹp giá trị, điền mặc định', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'cutRange', fromMs: 1000, toMs: 2500.7 },
        { kind: 'freeze', atMs: 3000 },
        { kind: 'flip', axis: 'horizontal' },
        { kind: 'rotate', degrees: 90 },
        { kind: 'volume', target: 'mic', level: 5 },
        { kind: 'voiceFx', voice: 'robot' },
        { kind: 'fade', ms: 99_999 },
        { kind: 'sound', sound: 'tada', atMs: 500 },
        { kind: 'zoomLevel', scale: 9 },
        { kind: 'zoomAt', atMs: 2000 },
        { kind: 'motion', zoomMs: 100 },
        { kind: 'frame', padding: 0.9, fill: true },
        { kind: 'background', color: '#1E1B4B' },
        { kind: 'cursor', visible: false },
        { kind: 'camera', shape: 'square', position: 'top-left', beauty: true },
        { kind: 'text', text: ' Xin chào ', atMs: 1000, template: 'neon', position: 'bottom' },
        { kind: 'sticker', emoji: '🔥', atMs: 2000 },
        { kind: 'shape', shape: 'arrow', atMs: 0, x: 0.8, y: 1.7 },
        { kind: 'adjust', setting: 'brightness', value: 0.333 },
        { kind: 'adjust', setting: 'grain', value: -1 },
        { kind: 'captionsLayout', position: 'top' },
        { kind: 'translate', language: 'EN', bilingual: true },
        { kind: 'marker', atMs: 4000, label: 'Mốc' },
        { kind: 'chapters' },
        { kind: 'track', row: 'effects', hidden: true },
        { kind: 'clear', target: 'music' },
        { kind: 'shorts', seconds: 45 },
        { kind: 'export', resolution: 720, format: 'mp4', fps: 60 },
      ]),
    ).toEqual([
      { kind: 'cutRange', fromMs: 1000, toMs: 2501 },
      { kind: 'freeze', atMs: 3000, ms: 2000 },
      { kind: 'flip', axis: 'horizontal' },
      { kind: 'rotate', degrees: 90 },
      { kind: 'volume', target: 'mic', level: 2 },
      { kind: 'voiceFx', voice: 'robot' },
      { kind: 'fade', ms: 10_000 },
      { kind: 'sound', sound: 'tada', atMs: 500 },
      { kind: 'zoomLevel', scale: 5 },
      { kind: 'zoomAt', atMs: 2000, ms: 3000, scale: 2 },
      { kind: 'motion', zoomMs: 250 },
      { kind: 'frame', padding: 0.45, fill: true },
      { kind: 'background', color: '#1e1b4b', color2: '' },
      { kind: 'cursor', visible: false },
      { kind: 'camera', shape: 'square', position: 'top-left', beauty: true },
      {
        kind: 'text',
        text: 'Xin chào',
        atMs: 1000,
        ms: 3000,
        template: 'neon',
        position: 'bottom',
      },
      { kind: 'sticker', emoji: '🔥', atMs: 2000, ms: 3000, position: 'center' },
      { kind: 'shape', shape: 'arrow', atMs: 0, ms: 3000, x: 0.8, y: 1, color: '#ef4444' },
      { kind: 'adjust', setting: 'brightness', value: 0.33 },
      { kind: 'adjust', setting: 'grain', value: 0 },
      { kind: 'captionsLayout', position: 'top' },
      { kind: 'translate', language: 'en', bilingual: true },
      { kind: 'marker', atMs: 4000, label: 'Mốc' },
      { kind: 'chapters' },
      { kind: 'track', row: 'effects', hidden: true },
      { kind: 'clear', target: 'music' },
      { kind: 'shorts', mode: 'fixed', seconds: 45, vertical: true, count: 3 },
      { kind: 'export', resolution: 720, format: 'mp4', fps: 60 },
    ])
  })

  it('normalize: bỏ lệnh thiếu dữ liệu; trùng theo mục / thời điểm mới bị bỏ', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'cutRange', fromMs: 3000, toMs: 1000 },
        { kind: 'freeze' },
        { kind: 'rotate', degrees: 45 },
        { kind: 'volume', target: 'tv', level: 1 },
        { kind: 'background', color: 'xanh' },
        { kind: 'motion' },
        { kind: 'frame' },
        { kind: 'camera' },
        { kind: 'text', text: '' },
        { kind: 'shape', shape: 'triangle', atMs: 0 },
        { kind: 'translate', language: 'tiếng anh' },
        { kind: 'track', row: 'clips' },
        { kind: 'clear', target: 'everything' },
        { kind: 'adjust', setting: 'contrast', value: 0.2 },
        { kind: 'adjust', setting: 'contrast', value: 0.9 },
        { kind: 'adjust', setting: 'saturation', value: 0.2 },
        { kind: 'marker', atMs: 1000, label: 'a' },
        { kind: 'marker', atMs: 1000, label: 'b' },
        { kind: 'marker', atMs: 2000, label: 'c' },
        { kind: 'clear', target: 'zooms' },
        { kind: 'clear', target: 'zooms' },
        { kind: 'clear', target: 'effects' },
      ]),
    ).toEqual([
      { kind: 'adjust', setting: 'contrast', value: 0.2 },
      { kind: 'adjust', setting: 'saturation', value: 0.2 },
      { kind: 'marker', atMs: 1000, label: 'a' },
      { kind: 'marker', atMs: 2000, label: 'c' },
      { kind: 'clear', target: 'zooms' },
      { kind: 'clear', target: 'effects' },
    ])
  })

  it('từ khóa: mức zoom không bị hiểu nhầm thành tốc độ, không kéo theo tự zoom', () => {
    expect(parseAssistantRequest('đặt mức zoom 2.5x')).toEqual([{ kind: 'zoomLevel', scale: 2.5 }])
    expect(parseAssistantRequest('zoom theo chuột, tốc độ 1.5x').map((c) => c.kind)).toEqual([
      'autoZoom',
      'speed',
    ])
  })

  it('từ khóa: bỏ nhạc / zoom / phụ đề / bộ lọc thành lệnh clear, không thêm lại', () => {
    expect(parseAssistantRequest('bỏ nhạc nền và xóa hết zoom, tắt phụ đề, bỏ bộ lọc')).toEqual([
      { kind: 'clear', target: 'zooms' },
      { kind: 'clear', target: 'music' },
      { kind: 'clear', target: 'captions' },
      { kind: 'clear', target: 'filter' },
    ])
    expect(parseAssistantRequest('remove the music').map((c) => c.kind)).toEqual(['clear'])
  })

  it('từ khóa: tắt tiếng, lật, xoay, webcam, con trỏ, phụ đề trên, dịch, chương, video ngắn', () => {
    expect(
      parseAssistantRequest(
        'tắt tiếng mic, lật ngang, xoay 180 độ, ẩn webcam, hiện con trỏ, phụ đề ở trên, dịch phụ đề sang tiếng Anh, thêm chương',
      ),
    ).toEqual([
      { kind: 'captions' },
      { kind: 'captionsLayout', position: 'top' },
      { kind: 'translate', language: 'en', bilingual: false },
      { kind: 'volume', target: 'mic', level: 0 },
      { kind: 'flip', axis: 'horizontal' },
      { kind: 'rotate', degrees: 180 },
      { kind: 'camera', visible: false },
      { kind: 'cursor', visible: true },
      { kind: 'chapters' },
    ])
    expect(parseAssistantRequest('chia thành các video ngắn mỗi 30 giây, dọc')).toEqual([
      { kind: 'aspect', aspect: '9:16' },
      { kind: 'shorts', mode: 'fixed', seconds: 30, vertical: true, count: 3 },
    ])
    expect(parseAssistantRequest('phụ đề song ngữ tiếng Nhật')).toEqual([
      { kind: 'captions' },
      { kind: 'translate', language: 'ja', bilingual: true },
    ])
    expect(parseAssistantRequest('mute system audio')).toEqual([
      { kind: 'cleanAudio' },
      { kind: 'volume', target: 'system', level: 0 },
    ])
  })
})

describe('lệnh mới 1.8.0: che vùng, tự giảm nhạc, hiện phím tắt', () => {
  it('từ khóa: hiện phím tắt, giảm nhạc khi nói, khảm vùng', () => {
    const vi = parseAssistantRequest('hiện phím tắt, giảm nhạc khi nói, khảm vùng mật khẩu')
    expect(vi).toEqual(
      expect.arrayContaining([
        { kind: 'cursor', showKeys: true },
        { kind: 'duck', enabled: true },
        { kind: 'blur', mode: 'pixelate', atMs: 0, ms: 600_000, x: 0.5, y: 0.5, size: 0.3 },
      ]),
    )
    const en = parseAssistantRequest('show shortcuts and duck the music, blur the area')
    expect(en).toEqual(
      expect.arrayContaining([
        { kind: 'cursor', showKeys: true },
        { kind: 'duck', enabled: true },
        { kind: 'blur', mode: 'blur', atMs: 0, ms: 600_000, x: 0.5, y: 0.5, size: 0.3 },
      ]),
    )
    expect(parseAssistantRequest('tắt phím tắt')).toEqual([{ kind: 'cursor', showKeys: false }])
  })

  it('chuẩn hóa: kẹp giá trị, mặc định khi thiếu, bỏ lệnh thiếu dữ liệu bắt buộc', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'duck', enabled: true, level: 5 },
        { kind: 'duck', enabled: 'yes' },
        { kind: 'blur', atMs: 1000 },
        { kind: 'blur', mode: 'pixelate', atMs: 2000, ms: 500, x: 2, y: -1, size: 9 },
        { kind: 'blur', mode: 'blur' },
        { kind: 'cursor', showKeys: true },
      ]),
    ).toEqual([
      { kind: 'duck', enabled: true, level: 0.8 },
      { kind: 'blur', mode: 'blur', atMs: 1000, ms: 3000, x: 0.5, y: 0.5, size: 0.3 },
      { kind: 'blur', mode: 'pixelate', atMs: 2000, ms: 500, x: 1, y: 0, size: 1 },
      { kind: 'cursor', showKeys: true },
    ])
  })
})

describe('lệnh AI 1.9.0: công thức dựng, hiệu ứng / tốc độ / chuyển cảnh theo thời điểm, kiểu chữ phụ đề, thẻ kết', () => {
  it('hiểu phong cách dựng theo từ khóa, không nhầm "phụ đề kiểu TikTok" với công thức', () => {
    expect(parseAssistantRequest('Dựng kiểu YouTube chuyên nghiệp cho mình')).toContainEqual({
      kind: 'recipe',
      style: 'youtube',
    })
    const shorts = parseAssistantRequest('Làm thành video TikTok hoàn chỉnh, nhạc lofi')
    expect(shorts).toContainEqual({ kind: 'recipe', style: 'shorts' })
    expect(shorts).toContainEqual({ kind: 'aspect', aspect: '9:16' })
    expect(parseAssistantRequest('edit this like a vlog')).toContainEqual({
      kind: 'recipe',
      style: 'vlog',
    })
    expect(parseAssistantRequest('làm bản tối giản, sạch sẽ')).toContainEqual({
      kind: 'recipe',
      style: 'clean',
    })
    expect(parseAssistantRequest('phụ đề kiểu TikTok').some((c) => c.kind === 'recipe')).toBe(false)
  })

  it('thẻ kết và kiểu phụ đề theo từ khóa', () => {
    expect(parseAssistantRequest('thêm thẻ kết: Đăng ký kênh nhé')).toEqual([
      { kind: 'outro', text: 'Đăng ký kênh nhé', ms: 4000, template: 'title' },
    ])
    expect(parseAssistantRequest('phụ đề in hoa, phụ đề hiện cả dòng')).toEqual([
      { kind: 'captions' },
      { kind: 'captionsLook', uppercase: true, style: 'classic' },
    ])
  })

  it('chuẩn hóa lệnh mới: kẹp giá trị, mặc định, bỏ lệnh thiếu dữ liệu', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'recipe', style: 'youtube' },
        { kind: 'recipe', style: 'nope' },
        { kind: 'effectAt', effect: 'flash', atMs: 1000 },
        { kind: 'effectAt', effect: 'shake', atMs: 2000, ms: 50, intensity: 9 },
        { kind: 'effectAt', effect: 'nope', atMs: 0 },
        { kind: 'speedRange', fromMs: 1000, toMs: 3000, factor: 40 },
        { kind: 'speedRange', fromMs: 3000, toMs: 1000, factor: 2 },
        { kind: 'speedCurve', preset: 'hero' },
        { kind: 'speedCurve', preset: 'custom', atMs: 0 },
        { kind: 'transitionAt', atMs: 2500, transition: 'slide' },
        { kind: 'transitionAt', atMs: 2500, transition: 'zoom', ms: 5 },
        { kind: 'captionsLook', font: 'anton', color: 'red', highlightColor: '#FF0000' },
        { kind: 'captionsLook', maxWords: 99, uppercase: 'yes', style: 'classic' },
        { kind: 'captionsLook' },
        { kind: 'outro', text: '  Đăng ký  ', ms: 100 },
        { kind: 'outro', text: '' },
        { kind: 'transitions', transition: 'fadeBlack', ms: 50_000 },
        { kind: 'export', resolution: 1080, format: 'mp4', enhance: true },
      ]),
    ).toEqual([
      { kind: 'recipe', style: 'youtube' },
      { kind: 'effectAt', effect: 'flash', atMs: 1000, ms: 1500, intensity: 0.7 },
      { kind: 'effectAt', effect: 'shake', atMs: 2000, ms: 200, intensity: 1 },
      { kind: 'speedRange', fromMs: 1000, toMs: 3000, factor: 16 },
      { kind: 'speedCurve', preset: 'hero', atMs: 0 },
      { kind: 'transitionAt', atMs: 2500, transition: 'slide', ms: 600 },
      { kind: 'captionsLook', font: 'anton', highlightColor: '#ff0000' },
      { kind: 'outro', text: 'Đăng ký', ms: 1000, template: 'title' },
      { kind: 'transitions', transition: 'fadeBlack', ms: 3000 },
      { kind: 'export', resolution: 1080, format: 'mp4', enhance: true },
    ])
  })
})

describe('tự dựng 1.12.0: findMusic, broll, shorts highlights', () => {
  it('normalize: findMusic lọc ký tự lạ / kẹp âm lượng, broll cần query + atMs, shorts có mode highlights và count', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'findMusic', mood: ' Upbeat, corporate!! ', tempo: 'fast', volume: 3 },
        { kind: 'findMusic', mood: 'x', tempo: 'bogus' },
        { kind: 'broll', query: ' typing on laptop ', atMs: 2500.4, ms: 100 },
        { kind: 'broll', query: '', atMs: 0 },
        { kind: 'broll', query: 'city', atMs: 9000 },
        { kind: 'shorts', mode: 'highlights', count: 12 },
        { kind: 'shorts', mode: 'bogus' },
      ]),
    ).toEqual([
      { kind: 'findMusic', mood: 'Upbeat corporate', tempo: 'fast', volume: 1 },
      { kind: 'broll', query: 'typing on laptop', atMs: 2500, ms: 1000 },
      { kind: 'broll', query: 'city', atMs: 9000, ms: 4000 },
      { kind: 'shorts', mode: 'highlights', seconds: 60, vertical: true, count: 10 },
    ])
    // findMusic trùng loại chỉ giữ lệnh đầu; mặc định nhịp vừa, âm lượng 0.25.
    expect(normalizeAssistantCommands([{ kind: 'findMusic' }])).toEqual([
      { kind: 'findMusic', mood: '', tempo: 'medium', volume: 0.25 },
    ])
  })

  it('từ khóa: "tự tìm nhạc nền vui nhanh" → findMusic; "chia ra làm 2-3 video short" → highlights', () => {
    expect(parseAssistantRequest('tự tìm nhạc nền vui nhanh và nhỏ')).toEqual([
      { kind: 'findMusic', mood: 'vui', tempo: 'fast', volume: 0.15 },
    ])
    expect(parseAssistantRequest('find calm music')).toEqual([
      { kind: 'findMusic', mood: 'calm', tempo: 'slow', volume: 0.25 },
    ])
    expect(parseAssistantRequest('chia video này ra làm 2-3 video short')).toEqual([
      { kind: 'aspect', aspect: '9:16' },
      { kind: 'shorts', mode: 'highlights', seconds: 60, vertical: true, count: 3 },
    ])
    expect(parseAssistantRequest('cắt thành các đoạn ngắn hay nhất')).toEqual([
      { kind: 'shorts', mode: 'highlights', seconds: 60, vertical: false, count: 3 },
    ])
    // "nhạc lofi" (không có "tìm") vẫn là lệnh music từ kho như trước.
    expect(parseAssistantRequest('thêm nhạc lofi')).toEqual([
      { kind: 'music', query: 'lofi', volume: 0.4 },
    ])
  })
})

describe('từ khóa hiệu ứng & chuyển cảnh mới', () => {
  it('nhận tên các hiệu ứng mới bằng tiếng Việt và tiếng Anh', () => {
    const effectOf = (text: string) => parseAssistantRequest(text).find((c) => c.kind === 'effect')
    expect(effectOf('thêm hiệu ứng lấp lánh')).toEqual({ kind: 'effect', effect: 'sparkle' })
    expect(effectOf('cho tuyết rơi')).toEqual({ kind: 'effect', effect: 'snow' })
    expect(effectOf('hiệu ứng tách màu RGB')).toEqual({ kind: 'effect', effect: 'rgbSplit' })
    expect(effectOf('add film grain')).toEqual({ kind: 'effect', effect: 'grain' })
    expect(effectOf('hiệu ứng phóng nhấn')).toEqual({ kind: 'effect', effect: 'zoomPunch' })
    expect(effectOf('thêm dải điện ảnh')).toEqual({ kind: 'effect', effect: 'letterbox' })
    expect(effectOf('hiệu ứng đèn rọi')).toEqual({ kind: 'effect', effect: 'spotlight' })
  })

  it('hiệu ứng màu chỉ nhận khi có chữ "hiệu ứng"; "bộ lọc cổ điển" vẫn là bộ lọc', () => {
    const kinds = (text: string) => parseAssistantRequest(text).map((c) => c.kind)
    expect(kinds('bộ lọc cổ điển')).toEqual(['filter'])
    expect(parseAssistantRequest('hiệu ứng đen trắng')).toEqual([{ kind: 'effect', effect: 'bw' }])
    expect(parseAssistantRequest('hiệu ứng tông ấm')).toEqual([{ kind: 'effect', effect: 'warm' }])
  })

  it('nhận các chuyển cảnh mới', () => {
    const tr = (text: string) => parseAssistantRequest(text).find((c) => c.kind === 'transitions')
    expect(tr('chuyển cảnh lia máy')).toEqual({ kind: 'transitions', transition: 'whip' })
    expect(tr('chuyển cảnh thu nhỏ')).toEqual({ kind: 'transitions', transition: 'zoomOut' })
    expect(tr('chuyển cảnh lướt lên')).toEqual({ kind: 'transitions', transition: 'slideUp' })
    expect(tr('chuyển cảnh lướt sang phải')).toEqual({
      kind: 'transitions',
      transition: 'slideRight',
    })
    expect(tr('transition wipe')).toEqual({ kind: 'transitions', transition: 'wipe' })
    expect(tr('chuyển cảnh vòng tròn')).toEqual({ kind: 'transitions', transition: 'iris' })
    expect(tr('chuyển cảnh lật thẻ')).toEqual({ kind: 'transitions', transition: 'flip' })
    expect(tr('chuyển cảnh xoay')).toEqual({ kind: 'transitions', transition: 'spin' })
    expect(tr('thêm chuyển cảnh')).toEqual({ kind: 'transitions', transition: 'fadeBlack' })
    // Mặc định chỉ ở chỗ đổi cảnh; nói rõ "mọi / tất cả chỗ nối" mới đặt ở mọi chỗ cắt.
    expect(tr('chuyển cảnh zoom ở mọi chỗ nối')).toEqual({
      kind: 'transitions',
      transition: 'zoom',
      all: true,
    })
    expect(tr('thêm chuyển cảnh cho tất cả đoạn cắt')).toEqual({
      kind: 'transitions',
      transition: 'fadeBlack',
      all: true,
    })
    expect(tr('zoom transition at every cut')).toEqual({
      kind: 'transitions',
      transition: 'zoom',
      all: true,
    })
  })
})

describe('phụ đề kiểu Captions 1.13.0: captionsEmoji, captionsKeywords, dub', () => {
  it('từ khóa: lồng tiếng (ngôn ngữ, giữ tiếng gốc), emoji, tô từ khóa; "bỏ emoji" không thêm emoji', () => {
    expect(parseAssistantRequest('lồng tiếng sang tiếng Anh, giữ tiếng gốc nhỏ')).toEqual([
      { kind: 'dub', language: 'en', keepOriginal: true },
    ])
    expect(parseAssistantRequest('dub this in japanese')).toEqual([
      { kind: 'dub', language: 'ja', keepOriginal: false },
    ])
    // Lồng tiếng đã bao gồm dịch: không thêm lệnh translate.
    expect(parseAssistantRequest('thuyết minh tiếng Anh').some((c) => c.kind === 'translate')).toBe(
      false,
    )
    expect(parseAssistantRequest('thêm emoji và tô từ khóa')).toEqual([
      { kind: 'captionsEmoji' },
      { kind: 'captionsKeywords' },
    ])
    // Nhắc tới phụ đề: bật phụ đề trước rồi mới tô từ khóa.
    expect(parseAssistantRequest('highlight keywords in the captions')).toEqual([
      { kind: 'captions' },
      { kind: 'captionsKeywords' },
    ])
    expect(parseAssistantRequest('bỏ emoji')).toEqual([])
  })

  it('normalize: dub cần mã ngôn ngữ, voiceName cắt 80 ký tự; lệnh không tham số giữ nguyên', () => {
    expect(
      normalizeAssistantCommands([
        { kind: 'dub', language: 'EN', keepOriginal: true, voiceName: ` ${'a'.repeat(100)} ` },
        { kind: 'dub', language: 'tiếng việt' },
        { kind: 'dub' },
        { kind: 'captionsEmoji', extra: 1 },
        { kind: 'captionsKeywords' },
      ]),
    ).toEqual([
      { kind: 'dub', language: 'en', keepOriginal: true, voiceName: 'a'.repeat(80) },
      { kind: 'captionsEmoji' },
      { kind: 'captionsKeywords' },
    ])
  })
})
