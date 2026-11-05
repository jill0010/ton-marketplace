import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

function TonTokenLogo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="h-[18px] w-[18px] shrink-0">
      <circle cx="16" cy="16" r="16" fill="#fff" fillOpacity="0.18" />
      <path d="M9.1 8.5h13.8c1.1 0 1.8 1.2 1.2 2.2l-6.9 12.1c-.5.9-1.8.9-2.3 0L8 10.7c-.6-1 .1-2.2 1.1-2.2Z" fill="#fff" />
      <path d="M12.2 12h7.6L16 18.8 12.2 12Z" fill="#0098EA" />
    </svg>
  )
}

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
          void tonConnectUI.openSingleWalletModal(wallet!.device.appName)
        } else {
          void tonConnectUI.openModal()
        }
      }}
      aria-label={connected ? "Open connected TON wallet" : label}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border-0 bg-[#0098EA] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0088D1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12]"
    >
      <TonTokenLogo />
      <span>{label}</span>
      {connected && (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 6 4.5 4 4.5-4" />
        </svg>
      )}
    </button>
  )
}
