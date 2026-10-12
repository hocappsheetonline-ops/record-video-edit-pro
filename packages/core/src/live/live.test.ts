import { describe, expect, it } from 'vitest'
import { LiveCaptionBuffer } from './captions'
import { mergeComments, parseFacebookComments, parseYouTubeChat } from './comments'
import { isValidServer, parseDestinations, redactUrl, streamUrl } from './destinations'
import { containRect, coverCrop, studioSlots } from './layout'

const size = { width: 1280, height: 720 }

describe('studioSlots', () => {
  it('solo: một người toàn khung (giữ 16:9)', () => {
    const { people, screen } = studioSlots('solo', size, 3, true)
    expect(screen).toBeNull()
    expect(people).toHaveLength(1)
    expect(people[0]!.width / people[0]!.height).toBeCloseTo(16 / 9)
  })

  it('grid: các ô không chồng nhau và nằm trong khung', () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const { people } = studioSlots('grid', size, count, false)
      expect(people).toHaveLength(count)
      for (const [i, a] of people.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(0)
        expect(a.y + a.height).toBeLessThanOrEqual(720)
        for (const b of people.slice(i + 1)) {
          const overlap =
            a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height
          expect(overlap).toBe(false)
        }
      }
    }
  })

  it('screen: màn hình to bên trái, người bên phải', () => {
    const { screen, people } = studioSlots('screen', size, 2, true)
    expect(screen!.width).toBeGreaterThan(size.width * 0.6)
    expect(people.every((p) => p.x > screen!.x + screen!.width)).toBe(true)
  })

  it('pip: một người ở góc dưới phải; không có màn hình thì thành lưới', () => {
    const { screen, people } = studioSlots('pip', size, 2, true)
    expect(people).toHaveLength(1)
    expect(people[0]!.x).toBeGreaterThan(size.width / 2)
    expect(screen).not.toBeNull()
    expect(studioSlots('pip', size, 2, false).people).toHaveLength(2)
  })

  it('cover/contain', () => {
    expect(coverCrop({ width: 640, height: 480 }, { width: 160, height: 90 })).toEqual({
      x: 0,
      y: 60,
      width: 640,
      height: 360,
    })
    expect(
      containRect({ width: 100, height: 100 }, { x: 0, y: 0, width: 200, height: 100 }),
    ).toEqual({ x: 50, y: 0, width: 100, height: 100 })
  })
})

describe('destinations', () => {
  it('ghép URL phát', () => {
    expect(streamUrl('rtmp://a.rtmp.youtube.com/live2/', ' abcd-1234 ')).toBe(
      'rtmp://a.rtmp.youtube.com/live2/abcd-1234',
    )
  })

  it('chỉ chấp nhận RTMP/RTMPS', () => {
    expect(isValidServer('rtmps://live-api-s.facebook.com:443/rtmp')).toBe(true)
    expect(isValidServer('http://x.com/live')).toBe(false)
    expect(isValidServer('rtmp://')).toBe(false)
  })

  it('đọc danh sách đích phát, bỏ mục sai', () => {
    expect(
      parseDestinations([
        { id: 'yt', platform: 'youtube', name: 'Kênh', server: 'rtmp://a.rtmp.youtube.com/live2' },
        { platform: 'custom', server: 'ftp://x' },
        { platform: 'weird', server: 'rtmp://127.0.0.1/live', enabled: false },
      ]),
    ).toEqual([
      {
        id: 'yt',
        platform: 'youtube',
        name: 'Kênh',
        server: 'rtmp://a.rtmp.youtube.com/live2',
        enabled: true,
      },
      {
        id: 'd2',
        platform: 'custom',
        name: 'custom',
        server: 'rtmp://127.0.0.1/live',
        enabled: false,
      },
    ])
  })

  it('che stream key khi hiển thị', () => {
    expect(redactUrl('rtmp://a.rtmp.youtube.com/live2/abcd-efgh-1234')).toBe(
      'rtmp://a.rtmp.youtube.com/live2/abc•••',
    )
  })
})

describe('comments', () => {
  it('đọc chat YouTube', () => {
    const parsed = parseYouTubeChat({
      nextPageToken: 'n1',
      pollingIntervalMillis: 1000,
      items: [
        {
          id: 'a',
          snippet: { displayMessage: 'Hay quá!', publishedAt: '2026-01-01T00:00:01Z' },
          authorDetails: { displayName: 'Lan' },
        },
        { id: 'b' },
      ],
    })
    expect(parsed).toEqual({
      comments: [
        {
          id: 'yt-a',
          platform: 'youtube',
          author: 'Lan',
          text: 'Hay quá!',
          at: Date.parse('2026-01-01T00:00:01Z'),
        },
      ],
      nextPageToken: 'n1',
      pollMs: 2000,
    })
  })

  it('đọc bình luận Facebook', () => {
    expect(
      parseFacebookComments({
        data: [
          {
            id: '1',
            message: 'Chào',
            created_time: '2026-01-01T00:00:00+0000',
            from: { name: 'Minh' },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'fb-1',
        platform: 'facebook',
        author: 'Minh',
        text: 'Chào',
        at: Date.parse('2026-01-01T00:00:00Z'),
      },
    ])
  })

  it('gộp không trùng, sắp xếp theo thời gian, giới hạn số lượng', () => {
    const c = (id: string, at: number) => ({
      id,
      platform: 'youtube' as const,
      author: 'a',
      text: id,
      at,
    })
    expect(mergeComments([c('a', 1), c('b', 3)], [c('b', 3), c('c', 2)]).map((x) => x.id)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(mergeComments([], [c('a', 1), c('b', 2), c('c', 3)], 2).map((x) => x.id)).toEqual([
      'b',
      'c',
    ])
  })
})

describe('LiveCaptionBuffer', () => {
  it('giữ các câu gần nhất trong giới hạn ký tự và ẩn khi im lặng lâu', () => {
    const buffer = new LiveCaptionBuffer(20, 5000)
    buffer.push('Xin chào', 0)
    buffer.push('các bạn', 1000)
    expect(buffer.text(1500)).toBe('Xin chào các bạn')
    buffer.push('hôm nay mình demo', 2000)
    expect(buffer.text(2500)).toBe('hôm nay mình demo')
    expect(buffer.text(9000)).toBe('')
  })
})
