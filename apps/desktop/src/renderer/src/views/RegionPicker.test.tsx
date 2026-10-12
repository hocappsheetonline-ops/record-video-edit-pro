import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { createFakeApi } from '../test/fake-api'
import { RegionPicker } from './RegionPicker'

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
  // jsdom chưa có pointer capture.
  Element.prototype.setPointerCapture = () => {}
})

function drag(from: [number, number], to: [number, number]) {
  const el = screen.getByTestId('region-picker')
  fireEvent.pointerDown(el, { button: 0, clientX: from[0], clientY: from[1], pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(el, { clientX: to[0], clientY: to[1], pointerId: 1 })
}

describe('RegionPicker', () => {
  it('kéo chuột để chọn vùng (kể cả kéo ngược) rồi xác nhận', async () => {
    const { api } = createFakeApi()
    window.lumora = api
    render(<RegionPicker />)
    drag([500, 400], [100, 150])
    await userEvent.click(screen.getByTestId('region-confirm'))
    expect(api.submitRegion).toHaveBeenCalledWith({ x: 100, y: 150, width: 400, height: 250 })
  })

  it('Esc để hủy', async () => {
    const { api } = createFakeApi()
    window.lumora = api
    render(<RegionPicker />)
    await userEvent.keyboard('{Escape}')
    expect(api.submitRegion).toHaveBeenCalledWith(null)
  })

  it('Enter để xác nhận; vùng quá nhỏ thì không cho', async () => {
    const { api } = createFakeApi()
    window.lumora = api
    render(<RegionPicker />)
    drag([10, 10], [15, 15])
    expect(screen.queryByTestId('region-confirm')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(api.submitRegion).not.toHaveBeenCalled()
    drag([10, 10], [210, 110])
    await userEvent.keyboard('{Enter}')
    expect(api.submitRegion).toHaveBeenCalledWith({ x: 10, y: 10, width: 200, height: 100 })
  })
})
