import { useEffect } from "react"
import { useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function TonConnectLanguageSync() {
  const [tonConnectUI] = useTonConnectUI()
  const { language } = useLanguage()

  useEffect(() => {
    tonConnectUI.uiOptions = {
      language: language === "ru" ? "ru" : "en",
    }
  }, [language, tonConnectUI])

  return null
}
