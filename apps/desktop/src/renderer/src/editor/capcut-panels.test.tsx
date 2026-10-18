import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { createFakeApi, sampleSummary } from '../test/fake-api'
import { OverlayProps } from './ItemProps'
import { EffectsTab } from './library/tabs'
import { AudioMixProps, CursorProps } from './ProjectProps'
import { useEditorStore } from './store'

async function setup() {
  const fake = createFakeApi()
  window.lumora = fake.api
  useEditorStore.getState().reset()
  await useEditorStore.getState().load(sampleSummary.folder)
  return fake.api
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

describe('che vùng riêng tư', () => {
  it('thẻ trong Hiệu ứng thêm vùng che tại đầu phát, không hoạt ảnh, kích thước tự do', async () => {
    await setup()
    act(() => useEditorStore.getState().setTime(1200))
    render(<EffectsTab />)
    await userEvent.click(screen.getByTestId('blur-add-pixelate'))
    const s = useEditorStore.getState()
    expect(s.edit!.overlays).toHaveLength(1)
    const o = s.edit!.overlays[0]!
    expect(o).toMatchObject({
      kind: 'blur',
      blurMode: 'pixelate',
      start: 1200,
      size: 0.3,
      aspect: 1.6,
    })
    expect(o.anim.in).toBe('none')
    expect(s.selection).toEqual({ kind: 'overlay', id: o.id })
  })

  it('bảng thuộc tính: đổi kiểu che, độ mạnh và tỉ lệ', async () => {
    await setup()
    useEditorStore.getState().addOverlay({ kind: 'blur', blurMode: 'blur' })
    const id = useEditorStore.getState().edit!.overlays[0]!.id
    const { rerender } = render(
      <OverlayProps overlay={useEditorStore.getState().edit!.overlays[0]!} />,
    )
    expect(screen.getByTestId('blur-props')).toBeTruthy()
    await userEvent.click(screen.getByTestId('blur-mode-pixelate'))
    const current = () => useEditorStore.getState().edit!.overlays.find((o) => o.id === id)!
    expect(current().blurMode).toBe('pixelate')
    rerender(<OverlayProps overlay={current()} />)
    fireEvent.change(screen.getByTestId('blur-strength'), { target: { value: '0.9' } })
    expect(current().blurStrength).toBeCloseTo(0.9)
    fireEvent.change(screen.getByTestId('blur-aspect'), { target: { value: '3' } })
    expect(current().aspect).toBe(3)
  })
})

describe('con trỏ và nhạc nền', () => {
  it('bật hiện phím tắt', async () => {
    await setup()
    render(<CursorProps edit={useEditorStore.getState().edit!} />)
    await userEvent.click(screen.getByTestId('cursor-show-keys'))
    expect(useEditorStore.getState().edit!.cursor.showKeys).toBe(true)
  })

  it('tự giảm nhạc: bật mới hiện mức, mức mặc định 30 %', async () => {
    await setup()
    const { rerender } = render(<AudioMixProps edit={useEditorStore.getState().edit!} />)
    expect(screen.queryByTestId('audio-duck-level')).toBeNull()
    await userEvent.click(screen.getByTestId('audio-duck'))
    const edit = useEditorStore.getState().edit!
    expect(edit.audio.duck).toEqual({ enabled: true, level: 0.3 })
    rerender(<AudioMixProps edit={edit} />)
    expect(screen.getByTestId('audio-duck-level')).toBeTruthy()
  })
})
