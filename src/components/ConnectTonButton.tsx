import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function ConnectTonButton() {
  const { language, t } = useLanguage()
  const walletAddress = useTonAddress()
  const [tonConnectUI] = useTonConnectUI()
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  function handleButtonClick() {
    if (!walletAddress) {
      void tonConnectUI.openModal()
      return
    }
    setMenuOpen((open) => !open)
  }

  function openAssets() {
    setMenuOpen(false)
    navigate("/assets")
  }

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)} ... ${walletAddress.slice(-5)}`
    : ""

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleButtonClick}
        aria-haspopup={walletAddress ? "menu" : undefined}
        aria-expanded={walletAddress ? menuOpen : undefined}
        aria-label={walletAddress
          ? t("Wallet menu: ", "钱包菜单：") + shortAddress
          : t("Connect TON wallet", "连接 TON 钱包")}
        className={`inline-flex h-10 min-w-[148px] items-center justify-center gap-3 rounded-xl border border-transparent px-4 text-white shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12] ${menuOpen ? "bg-[#228bdc]" : "bg-[#2a3342] hover:bg-[#344052]"}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 shrink-0 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 5.2h17L12 20.3 3.5 5.2Z" />
          <path d="M3.5 5.2 12 20.3l2.7-15.1" />
        </svg>
        {walletAddress ? (
          <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em]">{shortAddress}</span>
        ) : (
          <span className="whitespace-nowrap text-sm font-semibold">
            {language === "zh" || language === "zh-TW" ? t("连接 TON", "连接 TON") : "Connect TON"}
          </span>
        )}
        <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 shrink-0 fill-none stroke-current opacity-75 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 7 6 6 6-6" />
        </svg>
      </button>

      {walletAddress && menuOpen && (
        <div role="menu" className="absolute right-0 z-50 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#202a38] p-1.5 shadow-2xl">
          <button
            type="button"
            role="menuitem"
            onClick={openAssets}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-none stroke-current text-sky-300" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
            </svg>
            {t("My Assets", "我的资产")}
          </button>
        </div>
      )}
    </div>
  )
}
