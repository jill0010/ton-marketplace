import { Link, NavLink, Outlet } from "react-router-dom"
import { useLanguage } from "../lib/language"

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
            TON Market
          </Link>

          <nav className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "zh" : "en")}
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
              aria-label={language === "en" ? "切换到中文" : "Switch to English"}
            >
              {language === "en" ? "中文" : "English"}
            </button>

            <NavLink to="/" end className={navClass}>
              {t("Home", "首页")}
            </NavLink>

            <NavLink to="/premium" className={navClass}>
              {t("Premium", "会员")}
            </NavLink>

            <NavLink to="/catalog" className={navClass}>
              {t("All Products", "全部商品")}
            </NavLink>

            <span className="rounded-full px-3 py-1.5 text-sm text-zinc-600">
              {t("Connect Wallet (Coming Soon)", "连接钱包（暂未启用）")}
            </span>
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

