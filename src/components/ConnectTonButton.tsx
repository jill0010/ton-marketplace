import { TonConnectButton } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function ConnectTonButton() {
  const { language } = useLanguage()
  const labelClass = language === "zh" || language === "zh-TW"
    ? "wallet-connect-label-zh"
    : "wallet-connect-label-en"

  return (
    <TonConnectButton className={`wallet-connect-shape ${labelClass} !h-10 !min-w-[148px]`} />
  )
}
