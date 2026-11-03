import { useEffect, useRef, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition",
    isActive
      ? "bg-white/10 text-white"
      : "text-zinc-400 hover:bg-white/5 hover:text-white",
  ].join(" ")

function TonMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M4.2 6.2A2.2 2.2 0 0 1 6.1 5h11.8a2.2 2.2 0 0 1 1.9 3.3l-6.1 10.2a2 2 0 0 1-3.4 0L4.2 8.3a2.2 2.2 0 0 1 0-2.1Zm3.1 1.2 4.7 8 4.7-8H7.3Z" />
    </svg>
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
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", closeOnOutside)
    return () => document.removeEventListener("mousedown", closeOnOutside)
  }, [])

  const shortAddress = walletAddress
    ? walletAddress.slice(0, 6) + "…" + walletAddress.slice(-5)
    : ""

  async function disconnectWallet() {
    setAccountMenuOpen(false)
    await tonConnectUI.disconnect()
    navigate("/")
  }

  return (
    <div className="min-h-svh bg-[#0b0d12] text-zinc-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-sm font-semibold tracking-wide">
            NFT Market
          </Link>

          <nav className="flex min-w-0 flex-wrap items-center gap-2">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              aria-label="Select language"
              className="max-w-full rounded-full border border-white/15 bg-[#151923] px-3 py-2 text-sm text-zinc-200"
            >
              <option value="en">English</option>
              <option value="zh">简体中文</option>
              <option value="zh-TW">繁體中文</option>
              <option value="ru">Русский</option>
              <option value="ar">العربية</option>
            </select>

            <NavLink to="/" end className={navClass}>
              {t("Home", "首页")}
            </NavLink>

            {walletAddress ? (
              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-400"
                >
                  <TonMark />
                  <span>{shortAddress}</span>
                  <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 transition ${accountMenuOpen ? "rotate-180" : ""}`}>
                    <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#26313d] p-2 shadow-2xl"
                  >
                    <Link role="menuitem" to="/assets" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10">
                      <span className="w-5 text-center">▣</span>{t("My Assets", "我的资产")}
                    </Link>
                    <Link role="menuitem" to="/assets?type=phone_number" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10">
                      <span className="w-5 text-center">◉</span>{t("My Numbers", "我的号码")}
                    </Link>
                    <Link role="menuitem" to="/assets?type=gift" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10">
                      <span className="w-5 text-center">◇</span>{t("My Gifts", "我的礼物")}
                    </Link>
                    <Link role="menuitem" to="/my-bids" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-100 hover:bg-white/10">
                      <span className="w-5 text-center">◷</span>{t("My Bids", "我的出价")}
                    </Link>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => void disconnectWallet()}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-zinc-100 hover:bg-white/10"
                    >
                      <span className="w-5 text-center">⇥</span>{t("Disconnect wallet", "退出登录")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void tonConnectUI.openModal()}
                className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
              >
                {t("Connect wallet", "连接钱包")}
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-zinc-500">
          {t(
            "Marketplace preview: search and filtering are available. Wallet payments are not enabled yet.",
            "商城演示阶段：支持搜索与筛选，钱包支付暂未启用。"
          )}
        </p>
      </footer>
    </div>
  )
}
