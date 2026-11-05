import { useEffect } from "react"
import { useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function TonConnectLanguageSync() {
  const [tonConnectUI] = useTonConnectUI()
  const { language } = useLanguage()

  useEffect(() => {
    tonConnectUI.uiOptions = {
      language: language === "ru" || language === "ja" || language === "fr" || language === "es" ? language : language === "zh" || language === "zh-TW" ? "zh" : "en",
    }
  }, [language, tonConnectUI])

  return null
}
