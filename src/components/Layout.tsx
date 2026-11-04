import { Link, NavLink, Outlet } from "react-router-dom"
import { TonConnectButton } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition",
    isActive
      ? "bg-white/10 text-white"
      : "text-zinc-400 hover:bg-white/5 hover:text-white",
  ].join(" ")

export function Layout() {
  const { language, setLanguage, t } = useLanguage()

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

            <NavLink to="/catalog" className={navClass}>
              {t("All Products", "全部商品")}
            </NavLink>
            <NavLink to="/fragment-market" className={navClass}>
              {t("Fragment Market", "Fragment 市场")}
            </NavLink>

            <div className="flex items-center">
              <TonConnectButton className="wallet-connect-button" />
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
