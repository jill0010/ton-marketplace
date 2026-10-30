import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

export type Language = "en" | "zh"

type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (english: string, chinese: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return localStorage.getItem("ton-marketplace-language") === "zh"
        ? "zh"
        : "en"
    } catch {
      return "en"
    }
  })

  function setLanguage(next: Language) {
    setLanguageState(next)
    try {
      localStorage.setItem("ton-marketplace-language", next)
    } catch {
      // Language selection still works for the current session.
    }
  }

  const t = (english: string, chinese: string) =>
    language === "en" ? english : chinese

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN"
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider")
  }
  return context
}
