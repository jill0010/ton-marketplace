import { Link, Outlet } from "react-router-dom"
import { ConnectTonButton } from "./ConnectTonButton"
import { useLanguage } from "../lib/useLanguage"

export function Layout() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div className="min-h-svh bg-[#0b0d12] text-zinc-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="inline-flex items-center" aria-label="NFT MARKET">
            <img src="/fragment-wordmark.svg" alt="FRAGMENT" className="h-8 w-auto max-w-[190px]" />
            <span className="sr-only">NFT MARKET</span>
          </Link>

          <nav className="flex min-w-0 flex-wrap items-center gap-2">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              aria-label="Select language"
              className="max-w-full appearance-none rounded-xl border border-white/20 bg-[#151923] px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-sm outline-none transition hover:border-white/35 hover:bg-[#1b2230] focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
            >
              <option value="en">English</option>
              <option value="zh">简体中文</option>
              <option value="zh-TW">繁體中文</option>
              <option value="ru">Русский</option>
              <option value="ar">العربية</option>
            </select>

            <Link to="/assets" className="rounded-xl border border-white/15 px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-sky-400/50 hover:bg-white/5 hover:text-white">
              {t("My Assets", "我的资产")}
            </Link>
            <div className="flex items-center">
              <ConnectTonButton />
            </div>
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
