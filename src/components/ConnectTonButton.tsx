import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function ConnectTonButton() {
  const { language } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()
  const wallet = useTonWallet()
  const address = useTonAddress()

  const connected = Boolean(wallet && address)
  const label = connected
    ? `${address.slice(0, 6)}…${address.slice(-5)}`
    : language === "zh" || language === "zh-TW"
      ? "连接TON"
      : "Connect TON"

  return (
    <button
      type="button"
      onClick={() => {
        if (connected) {
          void tonConnectUI.openSingleWalletModal()
        } else {
          void tonConnectUI.openModal()
        }
      }}
      aria-label={connected ? "Open connected TON wallet" : label}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border-0 bg-[#0098EA] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0088D1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12]"
    >
      {label}
      {connected && (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 6 4.5 4 4.5-4" />
        </svg>
      )}
    </button>
  )
}
