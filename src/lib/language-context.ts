import { createContext } from "react"

export type Language = "en" | "zh" | "zh-TW" | "ru" | "ar"

export type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (english: string, chinese: string) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
