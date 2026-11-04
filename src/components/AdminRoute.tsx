
import { useEffect, useState } from "react"
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78"

export function AdminRoute() {
  const navigate = useNavigate()

  const [status, setStatus] = useState<
    "loading" | "allowed" | "denied"
  >("loading")
  const [logoutError, setLogoutError] = useState("")

  useEffect(() => {
    let active = true

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!active) return

      if (error || data.session?.user.id !== ADMIN_UID) {
        if (data.session && data.session.user.id !== ADMIN_UID) {
          await supabase.auth.signOut()
        }

        if (active) setStatus("denied")
        return
      }

      setStatus("allowed")
    }

    void checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return

      setStatus(
        session?.user.id === ADMIN_UID ? "allowed" : "denied",
      )
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    setLogoutError("")

    const { error } = await supabase.auth.signOut()

    if (error) {
      setLogoutError("退出失败，请重试：" + error.message)
      return
    }

    navigate("/admin/login", { replace: true })
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#0b0d12] text-zinc-300">
        正在验证管理员身份…
      </main>
    )
  }

  if (status === "denied") {
    return <Navigate to="/admin/login" replace />
  }

  return (
    <div className="min-h-svh bg-[#0b0d12] text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">
            TON MARKETPLACE · 管理后台
          </span>
          <Link to="/admin/premium-orders" className="text-sm text-zinc-300 hover:text-white">Premium 订单</Link>
          <Link to="/admin/premium-pricing" className="text-sm text-zinc-300 hover:text-white">Premium 定价</Link>
          <Link to="/admin/products" className="text-sm text-zinc-300 hover:text-white">商品管理</Link>
          <Link to="/admin/wallet-settings" className="text-sm text-zinc-300 hover:text-white">托管钱包</Link>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10"
        >
          退出登录
        </button>
      </header>

      {logoutError && (
        <p role="alert" className="mx-auto mt-4 max-w-5xl px-4 text-sm text-red-300">
          {logoutError}
        </p>
      )}

      <Outlet />
    </div>
  )
}
