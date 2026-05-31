import { es } from './es'
import { en } from './en'
import { createContext, useContext } from 'react'
import type { TranslationKey } from './es'

export type Lang = 'es' | 'en'
export type { TranslationKey }

const translations = { es, en }

export function t(key: TranslationKey, lang: Lang = 'es'): string {
  return translations[lang]?.[key] ?? translations['es'][key] ?? key
}

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'es',
  setLang: () => {},
})

export function useLang() {
  return useContext(LangContext)
}

export function useT() {
  const { lang } = useLang()
  return (key: TranslationKey) => t(key, lang)
}
