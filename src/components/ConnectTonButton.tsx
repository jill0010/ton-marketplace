import { useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function ConnectTonButton() {
  const { t } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()

  return (
    <button
      type="button"
      onClick={() => void tonConnectUI.openModal()}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-transparent bg-gradient-to-b from-[#2588f5] to-[#1264d8] px-4 text-sm font-semibold text-white shadow-md shadow-blue-950/30 transition hover:from-[#3b98ff] hover:to-[#2478ed]"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
        <path d="M3.2 5.2h17.6L12 20.1 3.2 5.2Z" />
        <path d="M12 5.2v11.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {t("Connect TON", "连接钱包")}
    </button>
  )
}
