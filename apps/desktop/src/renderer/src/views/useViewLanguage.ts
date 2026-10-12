import { useEffect } from 'react'
import i18n from '../i18n'
import { lumora } from '../api'

/** Cửa sổ phụ (thanh điều khiển, chọn vùng) dùng cùng ngôn ngữ với app. */
export function useViewLanguage(): void {
  useEffect(() => {
    void lumora()
      .getSettings()
      .then((s) => i18n.changeLanguage(s.language))
      .catch(() => undefined)
  }, [])
}
