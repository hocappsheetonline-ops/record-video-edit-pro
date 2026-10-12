import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { createFakeApi, sampleSummary } from '../test/fake-api'
import { EffectsTab, TransitionsTab } from './library/tabs'
import { YouTubeMusic } from './library/YouTubeMusic'
import { FiltersTab } from './LookPanels'
import { useEditorStore } from './store'
import { PREVIEW_ID, withPreview } from './try-preview'

async function setup() {
  const fake = createFakeApi()
  window.lumora = fake.api
  useEditorStore.getState().reset()
  await useEditorStore.getState().load(sampleSummary.folder)
  return fake.api
}

/** Rê chuột vào rồi chờ quá độ trễ bắt đầu xem thử. */
async function hover(el: HTMLElement) {
  fireEvent.pointerEnter(el)
  await waitFor(() => expect(useEditorStore.getState().preview).not.toBeNull())
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

describe('xem thử trong thư viện (như CapCut)', () => {
  it('rê chuột lên hiệu ứng: phát thử từ đầu phát, vẽ hiệu ứng tạm; rời ra thì trả lại như cũ', async () => {
    await setup()
    act(() => useEditorStore.getState().setTime(1000))
    render(<EffectsTab />)
    const card = screen.getByTestId('effect-add-vhs')
    await hover(card)
    const s = useEditorStore.getState()
    expect(s.preview).toEqual({ kind: 'effect', effect: 'vhs' })
    expect(s.previewWindow).toEqual({ start: 1000, end: 3500 })
    expect(s.playing).toBe(true)
    expect(s.time).toBe(1000)
    // Dự án không đổi: hiệu ứng chỉ nằm ở bản vẽ xem thử.
    expect(s.edit!.effects).toHaveLength(0)
    expect(withPreview(s.edit!, s.preview, s.previewWindow!.start).effects[0]).toMatchObject({
      id: PREVIEW_ID,
      kind: 'vhs',
      start: 1000,
    })
    // Đổi sang hiệu ứng khác khi đang xem thử: vẫn quay về chỗ ban đầu sau cùng.
    act(() => useEditorStore.getState().setTime(2200))
    fireEvent.pointerLeave(card)
    await hover(screen.getByTestId('effect-add-blur'))
    expect(useEditorStore.getState().preview).toEqual({ kind: 'effect', effect: 'blur' })
    fireEvent.pointerLeave(screen.getByTestId('effect-add-blur'))
    const after = useEditorStore.getState()
    expect(after.preview).toBeNull()
    expect(after.previewWindow).toBeNull()
    expect(after.playing).toBe(false)
    expect(after.time).toBe(1000)
    expect(after.edit!.effects).toHaveLength(0)
  })

  it('bấm thẻ khi đang xem thử: thôi xem thử rồi thêm thật tại đầu phát ban đầu', async () => {
    await setup()
    act(() => useEditorStore.getState().setTime(1500))
    render(<EffectsTab />)
    const card = screen.getByTestId('effect-add-shake')
    await hover(card)
    await userEvent.click(card)
    const s = useEditorStore.getState()
    expect(s.preview).toBeNull()
    expect(s.edit!.effects).toHaveLength(1)
    expect(s.edit!.effects[0]).toMatchObject({ kind: 'shake', start: 1500 })
    expect(s.playing).toBe(false)
  })

  it('lướt nhanh qua thẻ (chưa đủ độ trễ) thì không xem thử', async () => {
    await setup()
    render(<EffectsTab />)
    const card = screen.getByTestId('effect-add-glitch')
    fireEvent.pointerEnter(card)
    fireEvent.pointerLeave(card)
    await new Promise((r) => setTimeout(r, 300))
    expect(useEditorStore.getState().preview).toBeNull()
    expect(useEditorStore.getState().playing).toBe(false)
  })

  it('bộ lọc: xem thử theo đích đang chọn (cả video / clip); chuyển cảnh: phát thử quanh chỗ nối', async () => {
    await setup()
    render(
      <>
        <FiltersTab />
        <TransitionsTab />
      </>,
    )
    await hover(screen.getByTestId('filter-cinematic'))
    expect(useEditorStore.getState().preview).toEqual({
      kind: 'filter',
      filter: 'cinematic',
      target: { kind: 'all' },
    })
    expect(useEditorStore.getState().edit!.look.filter).toBe('none')
    fireEvent.pointerLeave(screen.getByTestId('filter-cinematic'))
    expect(useEditorStore.getState().preview).toBeNull()

    // Bản mẫu: clip 5 s + 2 s → chỗ nối ở 5000 ms.
    await hover(screen.getByTestId('lib-transition-slide'))
    const s = useEditorStore.getState()
    expect(s.preview).toMatchObject({ kind: 'transition', transition: 'slide' })
    expect(s.previewWindow).toEqual({ start: 4250, end: 5750 })
    expect(s.time).toBe(4250)
    expect(s.edit!.transitions).toHaveLength(0)
    fireEvent.pointerLeave(screen.getByTestId('lib-transition-slide'))
    expect(useEditorStore.getState().time).toBe(0)
  })

  it('nhạc trong kho: nút nghe thử bật / tắt, timeline dừng; bấm bài thì thôi nghe thử và thêm', async () => {
    const api = await setup()
    await api.addMusicPaths(['C:\\nhac\\Lofi Chill.mp3'], 'file')
    act(() => useEditorStore.getState().setPlaying(true))
    render(<YouTubeMusic />)
    const button = await screen.findByTestId('music-audition')
    await userEvent.click(button)
    expect(useEditorStore.getState().preview).toEqual({
      kind: 'music',
      url: 'lumora-media://library/music/music-1.mp3',
      name: 'Lofi Chill',
    })
    expect(useEditorStore.getState().playing).toBe(false)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(useEditorStore.getState().preview).toBeNull()
    expect(useEditorStore.getState().playing).toBe(true)
    act(() => useEditorStore.getState().setPlaying(false))

    await userEvent.click(button)
    await userEvent.click(screen.getByTestId('music-item'))
    await waitFor(() => expect(useEditorStore.getState().edit!.audioClips).toHaveLength(1))
    expect(useEditorStore.getState().preview).toBeNull()
  })
})
