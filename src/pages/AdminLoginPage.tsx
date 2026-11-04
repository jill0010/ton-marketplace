import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78"

export function AdminLoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")
    setLoading(true)

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (loginError) {
        throw new Error("登录失败，请检查邮箱和密码。")
      }

      if (data.user?.id !== ADMIN_UID) {
        await supabase.auth.signOut()
        throw new Error("当前账号没有管理员权限。")
      }

      navigate("/admin/products", { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "登录失败，请稍后重试。",
      )
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordReset() {
    setError("")
    setNotice("")
    if (!email.trim()) {
      setError("请先输入管理员邮箱，再点击忘记密码。")
      return
    }

    setResetLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/admin/reset-password` },
      )
      if (resetError) throw resetError
      setNotice("密码重置邮件已发送。请打开最新邮件中的链接，在本页面设置新密码。")
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请稍后重试。")
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#0b0d12] px-4 py-10 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          TON MARKETPLACE
        </p>

        <h1 className="mt-3 text-2xl font-semibold">
          管理员登录
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          请使用已创建的 Supabase 管理员账号登录。
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-5">
          <div>
            <label htmlFor="admin-email" className="mb-2 block text-sm text-zinc-300">
              管理员邮箱
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40"
              placeholder="输入管理员邮箱"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-2 block text-sm text-zinc-300">
              密码
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40"
              placeholder="输入管理员密码"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-300">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "正在登录…" : "登录管理后台"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => void handlePasswordReset()}
          disabled={resetLoading}
          className="mt-4 w-full text-center text-sm text-zinc-400 underline decoration-zinc-600 underline-offset-4 hover:text-white disabled:opacity-50"
        >
          {resetLoading ? "正在发送…" : "忘记密码？发送重置邮件"}
        </button>
      </section>
    </main>
  )
}
