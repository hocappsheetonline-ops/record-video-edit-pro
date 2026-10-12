import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { createFakeApi } from '../test/fake-api'
import { CacheCard, formatBytes } from './CacheCard'

beforeEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

describe('CacheCard', () => {
  it('hiện dung lượng bộ nhớ đệm và xóa được', async () => {
    const fake = createFakeApi()
    window.lumora = fake.api
    render(<CacheCard />)
    expect(await screen.findByText('5.0 MB')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('cache-clear'))
    expect(fake.api.cacheClear).toHaveBeenCalled()
    expect(await screen.findByText('0 B')).toBeInTheDocument()
    expect(screen.getByTestId('cache-clear')).toBeDisabled()
  })

  it('định dạng dung lượng', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB')
  })
})
