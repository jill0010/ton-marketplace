import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

function TonLogo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="h-[18px] w-[18px] shrink-0">
      <path d="M9.1 5.5h13.8c2.2 0 3.6 2.4 2.5 4.3L17.9 24c-.9 1.6-2.9 1.6-3.8 0L6.6 9.8c-1.1-1.9.3-4.3 2.5-4.3Z" fill="currentColor" />
      <path d="M12.2 9h7.6L16 16.1 12.2 9Z" fill="#248BDA" />
    </svg>
  )
}

export function ConnectTonButton() {
  const { language } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()
  const wallet = useTonWallet()
  const address = useTonAddress()
  const connected = Boolean(wallet && address)
  const label = language === "zh" || language === "zh-TW" ? "连接 TON" : "Connect TON"

  function handleClick() {
    if (connected && wallet) {
      void tonConnectUI.openSingleWalletModal(wallet.device.appName)
      return
    }

    const event = new CustomEvent("ton-marketplace:connect-ton", { cancelable: true })
    const notHandled = window.dispatchEvent(event)
    if (notHandled) void tonConnectUI.openModal()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={connected ? "Open connected TON wallet" : label}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-[#248BDA] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1679c5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12]"
    >
      <TonLogo />
      <span>{connected && address ? `${address.slice(0, 6)}…${address.slice(-5)}` : label}</span>
      {connected && <span aria-hidden="true" className="text-xs">⌄</span>}
    </button>
  )
}
