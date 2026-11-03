import { useEffect, useRef, useState } from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"
import { ConnectTonButton } from "./ConnectTonButton"

function TonMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M3.2 5.2h17.6L12 20.1 3.2 5.2Z" /><path d="M12 5.2v11.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function FragmentBrand() {
  const { language } = useLanguage()
  const chinese = language === "zh" || language === "zh-TW"
  return (
    <Link to="/" aria-label={chinese ? "NFT 市场首页" : "NFT MARKET home"} className="inline-flex shrink-0 items-center gap-3 text-white">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-10 w-10 shrink-0 fill-current">
        <path d="M2.2 5.2h27.6L16 13.1 2.2 5.2Zm-.2 2.4 12.6 7.2L16 29 2 7.6Zm28 0L18 14.8 16 29 30 7.6Z" />
      </svg>
      <span className="font-[Arial,sans-serif] text-2xl font-black uppercase leading-none tracking-tight">
        {chinese ? "NFT 市场" : "NFT MARKET"}
      </span>
    </Link>
  )
}

export function Layout() {
  const { language, setLanguage, t } = useLanguage()
  const walletAddress = useTonAddress()
  const [tonConnectUI] = useTonConnectUI()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setAccountMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", closeOnOutside)
    return () => document.removeEventListener("mousedown", closeOnOutside)
  }, [])

  const shortAddress = walletAddress ? walletAddress.slice(0, 6) + "…" + walletAddress.slice(-5) : ""

  async function disconnectWallet() {
    setAccountMenuOpen(false)
    await tonConnectUI.disconnect()
    navigate("/")
  }

  return (
    <div className="min-h-svh bg-[#0b0d12] text-zinc-100">
      <header className="border-b border-white/10 bg-[#111720]/95">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-6 py-4">
          <FragmentBrand />

          <nav className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3">
            <label className="relative inline-flex items-center">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-sky-300">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as typeof language)}
                aria-label="Select language"
                className="h-10 cursor-pointer appearance-none rounded-xl border-0 bg-gradient-to-b from-[#202c3b] to-[#17212e] py-2 pl-9 pr-9 text-sm font-medium text-zinc-100 shadow-inner shadow-white/5 outline-none ring-0 transition focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              >
                <option value="en" className="bg-[#202c3b] text-zinc-100">English</option>
                <option value="zh" className="bg-[#202c3b] text-zinc-100">简体中文</option>
                <option value="zh-TW" className="bg-[#202c3b] text-zinc-100">繁體中文</option>
                <option value="ru" className="bg-[#202c3b] text-zinc-100">Русский</option>
                <option value="ar" className="bg-[#202c3b] text-zinc-100">العربية</option>
              </select>
              <svg viewBox="0 0 20 20" aria-hidden="true" className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-400">
                <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>

            {walletAddress ? (
              <div className="relative" ref={accountMenuRef}>
                <button type="button" aria-expanded={accountMenuOpen} aria-haspopup="menu" onClick={() => setAccountMenuOpen((open) => !open)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-transparent bg-gradient-to-b from-[#202c3b] to-[#17212e] px-4 text-sm font-semibold text-white shadow-inner shadow-white/5 transition hover:from-[#29394d] hover:to-[#1c2a3b]">
                  <TonMark />
                  <span>{shortAddress}</span>
                  <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 transition ${accountMenuOpen ? "rotate-180" : ""}`}>
                    <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {accountMenuOpen && (
                  <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#26313d] p-2 shadow-2xl">
                    <Link role="menuitem" to="/assets" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10"><span className="w-5 text-center">▣</span>{t("My Assets", "我的资产")}</Link>
                    <Link role="menuitem" to="/assets?type=phone_number" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10"><span className="w-5 text-center">◉</span>{t("My Numbers", "我的号码")}</Link>
                    <Link role="menuitem" to="/assets?type=gift" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10"><span className="w-5 text-center">◇</span>{t("My Gifts", "我的礼物")}</Link>
                    <Link role="menuitem" to="/my-bids" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10"><span className="w-5 text-center">◷</span>{t("My Bids", "我的出价")}</Link>
                    <div className="my-1 border-t border-white/10" />
                    <button role="menuitem" type="button" onClick={() => void disconnectWallet()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-zinc-100 hover:bg-white/10"><span className="w-5 text-center">⇥</span>{t("Disconnect wallet", "退出登录")}</button>
                  </div>
                )}
              </div>
            ) : (
              <ConnectTonButton />
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main>

      <footer className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-zinc-500">
          {t("Marketplace preview: search and filtering are available. Wallet payments are not enabled yet.", "商城演示阶段：支持搜索与筛选，钱包支付暂未启用。")}
        </p>
      </footer>
    </div>
  )
}
