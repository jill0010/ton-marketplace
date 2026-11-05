import { createContext } from "react"

export type Language = "en" | "ru" | "ja" | "fr" | "es" | "zh" | "zh-TW" | "ar"

export type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (english: string, chinese: string) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
