import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_SETTINGS } from '@lumora/core'
import { en } from './locales/en'
import { vi } from './locales/vi'

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: DEFAULT_SETTINGS.language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
