import { Link, NavLink, Outlet } from "react-router-dom"

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition",
    isActive
      ? "bg-white/10 text-white"
      : "text-zinc-400 hover:bg-white/5 hover:text-white",
  ].join(" ")

export function Layout() {
  return (
    <div className="min-h-svh bg-[#0b0d12] text-zinc-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-sm font-semibold tracking-wide">
            TON Market
          </Link>
          <nav className="flex min-w-0 flex-wrap items-center gap-2">
            <NavLink to="/" end className={navClass}>
              首页
            </NavLink>
            <NavLink to="/catalog" className={navClass}>
              全部商品
            </NavLink>
            <span className="rounded-full px-3 py-1.5 text-sm text-zinc-600">
              连接钱包（未启用）
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-zinc-500">
          阶段 1 演示：支持搜索与筛选。商品为假数据，尚未接入钱包支付与数据库。
        </p>
      </footer>
    </div>
  )
}
