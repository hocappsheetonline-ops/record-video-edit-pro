import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipLayer } from '../components/TooltipLayer'
import { snapDelta } from '../editor/snap'
import { useEditorStore } from '../editor/store'
import i18n from '../i18n'
import { useAppStore } from '../store/app'
import { createFakeApi, sampleSummary } from '../test/fake-api'
import { EditorPage } from './EditorPage'

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
  useEditorStore.getState().reset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

async function setup() {
  const fake = createFakeApi()
  window.lumora = fake.api
  useAppStore.setState({ page: 'editor', editorFolder: sampleSummary.folder })
  render(
    <>
      <EditorPage />
      <TooltipLayer />
    </>,
  )
  await screen.findByTestId('editor-title')
  return fake.api
}

const s = () => useEditorStore.getState()
const effects = () => s().edit!.effects.map((e) => [e.kind, e.start, e.end])

/** Thêm hiệu ứng tại thời điểm `at` (dài mặc định 1.5 giây). */
function addEffectAt(kind: 'shake' | 'glitch' | 'vhs', at: number) {
  act(() => {
    s().setTime(at)
    s().addEffect(kind)
  })
}

describe('timeline chuyên nghiệp', () => {
  it('Ctrl+click chọn nhiều; Ctrl+C / Ctrl+V dán tại đầu phát giữ khoảng cách; Delete xóa cả nhóm', async () => {
    await setup()
    addEffectAt('shake', 0)
    addEffectAt('glitch', 1000)
    const blocks = screen.getAllByTestId('timeline-effect')
    fireEvent.pointerDown(blocks[0]!)
    fireEvent.pointerDown(blocks[1]!, { ctrlKey: true })
    expect(s().selected.map((x) => x.kind)).toEqual(['effect', 'effect'])
    expect(screen.getAllByTestId('timeline-effect').map((b) => b.dataset.selected)).toEqual([
      'true',
      'true',
    ])
    const before = effects()
    await userEvent.keyboard('{Control>}c{/Control}')
    act(() => s().setTime(4000))
    await userEvent.keyboard('{Control>}v{/Control}')
    const pasted = effects().slice(2)
    expect(pasted).toEqual(
      before.map(([k, a, b]) => [k, (a as number) + 4000, Math.min(7000, (b as number) + 4000)]),
    )
    // Các mục vừa dán được chọn: Delete xóa cả hai.
    expect(s().selected).toHaveLength(2)
    await userEvent.keyboard('{Delete}')
    expect(effects()).toEqual(before)
    // Ctrl+Z trả lại.
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(effects()).toHaveLength(4)
  })

  it('Shift+Delete xóa dồn; Ctrl+D nhân đôi ngay sau mục; Ctrl+A chọn tất cả', async () => {
    await setup()
    addEffectAt('shake', 0)
    addEffectAt('glitch', 3000)
    const [first] = screen.getAllByTestId('timeline-effect')
    fireEvent.pointerDown(first!)
    const len = s().edit!.effects[0]!.end
    await userEvent.keyboard('{Shift>}{Delete}{/Shift}')
    expect(effects()).toEqual([['glitch', 3000 - len, 3000]])
    fireEvent.pointerDown(screen.getByTestId('timeline-effect'))
    await userEvent.keyboard('{Control>}d{/Control}')
    expect(effects()).toEqual([
      ['glitch', 3000 - len, 3000],
      ['glitch', 3000, 3000 + len],
    ])
    await userEvent.keyboard('{Control>}a{/Control}')
    expect(s().selected).toHaveLength(2)
  })

  it('menu chuột phải: nhân đôi lớp chữ, đưa lên trên cùng; chỗ trống: thêm marker, dán', async () => {
    await setup()
    act(() => s().addOverlay({ kind: 'text', text: 'A' }))
    act(() => s().addOverlay({ kind: 'text', text: 'B' }))
    const [a] = screen.getAllByTestId('timeline-overlay')
    fireEvent.contextMenu(a!)
    expect(screen.getByTestId('context-menu')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('menu-top'))
    expect(s().edit!.overlays.map((o) => o.text)).toEqual(['B', 'A'])
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getAllByTestId('timeline-overlay')[0]!)
    await userEvent.click(screen.getByTestId('menu-duplicate'))
    expect(s().edit!.overlays.map((o) => o.text)).toEqual(['B', 'A', 'B'])

    act(() => s().setTime(2500))
    fireEvent.contextMenu(screen.getByTestId('timeline-ruler'))
    await userEvent.click(screen.getByTestId('menu-marker'))
    expect(s().edit!.markers.map((m) => m.t)).toEqual([2500])
    expect(screen.getAllByTestId('timeline-marker')).toHaveLength(1)
    // Clip chính: menu có tách / tắt tiếng.
    fireEvent.contextMenu(screen.getAllByTestId('timeline-clip')[0]!)
    await userEvent.click(screen.getByTestId('menu-mute'))
    expect(s().edit!.clips[0]!.audio?.muted).toBe(true)
  })

  it('đầu hàng: ẩn hàng hiệu ứng, khóa hàng lớp phủ (không chọn được), tắt tiếng hàng âm thanh', async () => {
    await setup()
    act(() => s().addOverlay({ kind: 'text', text: 'A' }))
    act(() => s().select(null))
    await userEvent.click(screen.getByTestId('track-effects-hidden'))
    await userEvent.click(screen.getByTestId('track-overlays-locked'))
    await userEvent.click(screen.getByTestId('track-audio-muted'))
    expect(s().edit!.tracks).toMatchObject({
      effects: { hidden: true },
      overlays: { locked: true },
      audio: { muted: true },
    })
    expect(screen.getByTestId('track-effects-hidden')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerDown(screen.getByTestId('timeline-overlay'))
    expect(s().selection).toBeNull()
    await userEvent.keyboard('{Control>}a{/Control}')
    expect(s().selected).toHaveLength(0)
  })

  it('marker: phím M thêm, Shift+M / Ctrl+M nhảy, đổi tên trong bảng, chương YouTube lưu .txt', async () => {
    const api = await setup()
    act(() => s().setTime(1000))
    await userEvent.keyboard('m')
    act(() => s().setTime(5000))
    await userEvent.keyboard('m')
    act(() => s().setTime(3000))
    await userEvent.keyboard('{Shift>}m{/Shift}')
    expect(s().time).toBe(1000)
    await userEvent.keyboard('{Control>}m{/Control}')
    expect(s().time).toBe(5000)
    await userEvent.click(screen.getByTestId('tab-markers'))
    const labels = screen.getAllByTestId('marker-label')
    await userEvent.type(labels[0]!, 'Giới thiệu')
    await userEvent.type(labels[1]!, 'Demo')
    expect(screen.getByTestId('chapters-text')).toHaveTextContent(
      '0:00 Mở đầu 0:01 Giới thiệu 0:05 Demo',
    )
    await userEvent.click(screen.getByTestId('chapters-save'))
    await waitFor(() =>
      expect(api.saveExportText).toHaveBeenCalledWith(
        sampleSummary.folder,
        expect.stringMatching(/\.chapters\.txt$/),
        '0:00 Mở đầu\n0:01 Giới thiệu\n0:05 Demo',
      ),
    )
    await userEvent.click(screen.getAllByTestId('marker-delete')[0]!)
    expect(s().edit!.markers.map((m) => m.label)).toEqual(['Demo'])
  })

  it('hít dính: mép khối hút vào đầu phát / mép khối khác trong 8px; Alt hoặc tắt (N) thì không', async () => {
    await setup()
    addEffectAt('shake', 2000)
    act(() => s().setTime(5000))
    const pxPerMs = 0.1 // 8px = 80ms
    // Khối 1000..1500 kéo +460ms: mép cuối 1960 hút vào 2000 (mép đầu hiệu ứng kia).
    expect(snapDelta({ start: 1000, end: 1500 }, 'move', 460, pxPerMs, 'x')).toBe(500)
    expect(s().snapLine).toBe(2000)
    // Kéo mép cuối tới 4950: hút vào đầu phát 5000.
    expect(snapDelta({ start: 1000, end: 1500 }, 'end', 3450, pxPerMs, 'x')).toBe(3500)
    expect(snapDelta({ start: 1000, end: 1500 }, 'move', 460, pxPerMs, 'x', true)).toBe(460)
    expect(s().snapLine).toBeNull()
    await userEvent.keyboard('n')
    expect(s().snapping).toBe(false)
    expect(snapDelta({ start: 1000, end: 1500 }, 'move', 460, pxPerMs, 'x')).toBe(460)
  })
})
