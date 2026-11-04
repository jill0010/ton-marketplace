import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78"

export function AdminResetPasswordPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let settled = false

    const finishCheck = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null, failure?: string) => {
      if (!active || settled) return
      settled = true
      if (failure) setError(failure)
      setHasSession(session?.user.id === ADMIN_UID)
      setChecking(false)
      window.clearTimeout(timeoutId)
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      finishCheck(session)
    })

    const timeoutId = window.setTimeout(() => {
      finishCheck(
        null,
        "验证重置链接超时。链接可能已失效，或浏览器未能完成验证。请返回登录页重新发送一封密码重置邮件，再使用最新邮件中的链接。",
      )
    }, 15000)

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      finishCheck(
        data.session,
        sessionError ? "无法验证重置链接，请返回登录页重新发送密码重置邮件。" : undefined,
      )
    }).catch(() => {
      finishCheck(null, "验证重置链接时发生错误。请返回登录页重新发送密码重置邮件。")
    })

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")

    if (password.length < 8) {
      setError("密码至少需要 8 个字符。")
      return
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。")
      return
    }

    setSaving(true)
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      if (data.user?.id !== ADMIN_UID) {
        await supabase.auth.signOut()
        throw new Error("当前重置链接不属于管理员账号。")
      }
      setMessage("管理员密码已更新，正在进入后台…")
      window.setTimeout(() => navigate("/admin/products", { replace: true }), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : "密码更新失败，请重新发送重置邮件。")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#0b0d12] px-4 py-10 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE</p>
        <h1 className="mt-3 text-2xl font-semibold">设置管理员新密码</h1>
        {checking ? (
          <p className="mt-4 text-sm text-zinc-400">正在验证重置链接…</p>
        ) : !hasSession ? (
          <div className="mt-5 space-y-4">
            <p role="alert" className="text-sm text-zinc-300">
              {error || "重置链接无效、已过期，或不是管理员账号的链接。请返回登录页重新发送密码重置邮件。"}
            </p>
            <button type="button" onClick={() => navigate("/admin/login")} className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black">返回管理员登录</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="new-admin-password" className="mb-2 block text-sm text-zinc-300">新密码（至少 8 个字符）</label>
              <input id="new-admin-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40" placeholder="输入新密码" />
            </div>
            <div>
              <label htmlFor="confirm-admin-password" className="mb-2 block text-sm text-zinc-300">确认新密码</label>
              <input id="confirm-admin-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40" placeholder="再次输入新密码" />
            </div>
            {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
            {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-300">{message}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "正在保存…" : "保存新密码"}</button>
          </form>
        )}
      </section>
    </main>
  )
}
