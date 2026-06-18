import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_APP_LOCALE,
  type AppLocale
} from '../../../shared/schemas/settings'
import en from './locales/en'
import zhCN from './locales/zh-CN'

export const supportedLocales: AppLocale[] = ['en', 'zh-CN']

export const resources = {
  en: {
    translation: en
  },
  'zh-CN': {
    translation: zhCN
  }
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_APP_LOCALE,
  fallbackLng: DEFAULT_APP_LOCALE,
  supportedLngs: supportedLocales,
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
})

export default i18n
