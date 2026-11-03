
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"
import {
  anonymousSupabase,
  ensureAnonymousSession,
  supabase,
} from "../lib/supabase"

type Plan = {
  id: "month" | "quarter" | "half-year" | "year"
  period: string
  periodZh: string
  marketUsd: number
  discount: string
}

type PricingRow = {
  id: Plan["id"]
  period: string
  market_usd: number | string
}

type MarketQuote = {
  priceUsd: number
  updatedAt: number
}

type TelegramProfile = {
  username: string
  displayName: string
  bio: string | null
  extra: string | null
  avatarUrl: string | null
  profileUrl: string
}

const INITIAL_PLANS: Plan[] = [
  { id: "year", period: "12 months", periodZh: "12 个月", marketUsd: 27.99, discount: "-72%" },
  { id: "half-year", period: "6 months", periodZh: "6 个月", marketUsd: 14.99, discount: "-57%" },
  { id: "quarter", period: "3 months", periodZh: "3 个月", marketUsd: 10.99, discount: "-35%" },
  { id: "month", period: "1 month", periodZh: "1 个月", marketUsd: 4.29, discount: "-18%" },
]

export function PremiumPage() {
  const { t } = useLanguage()
  const [username, setUsername] = useState("")
  const [telegramProfile, setTelegramProfile] = useState<TelegramProfile | null>(null)
  const [profileLookup, setProfileLookup] = useState<"idle" | "loading" | "found" | "not-found" | "error">("idle")
  const [profileLookupMessage, setProfileLookupMessage] = useState("")

  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<Plan["id"]>("year")
  const [paymentMethod, setPaymentMethod] = useState<"GRAM" | "USDT_TRC20">("USDT_TRC20")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [marketQuote, setMarketQuote] = useState<MarketQuote | null>(null)
  const [orderLoading, setOrderLoading] = useState(false)
  const [activeOrder, setActiveOrder] = useState<{
    id: string; orderNo: string; paymentAddress: string; amount: string; expiresAt: string; usdAmount: string
  } | null>(null)
  const [txHash, setTxHash] = useState("")
  const [paymentChecking, setPaymentChecking] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState("")
  const [copyMessage, setCopyMessage] = useState("")

  // 输入 Telegram 用户名后，延迟查询公开头像和资料，避免每个按键都请求。
  useEffect(() => {
    let active = true
    const normalizedUsername = username.trim().replace(/^@+/, "")
    setTelegramProfile(null)
    setProfileLookupMessage("")

    if (
      normalizedUsername.length < 5 ||
      normalizedUsername.length > 32 ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(normalizedUsername)
    ) {
      setProfileLookup("idle")
      return () => {
        active = false
      }
    }

    setProfileLookup("loading")
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await ensureAnonymousSession()
          if (!active) return

          const { data, error } = await anonymousSupabase.functions.invoke(
            "telegram-user-profile",
            { body: { username: normalizedUsername } },
          )

          if (!active) return

          if (error) {
            throw new Error(
              typeof data?.error === "string"
                ? data.error
                : error.message || "Telegram 资料查询失败",
            )
          }

          if (data?.success === true && data.profile) {
            setTelegramProfile(data.profile as TelegramProfile)
            setProfileLookup("found")
            return
          }

          setProfileLookup(
            data?.code === "USER_NOT_FOUND" ? "not-found" : "error",
          )
          setProfileLookupMessage(
            typeof data?.error === "string"
              ? data.error
              : "暂时无法读取该用户的公开资料。",
          )
        } catch (error) {
          if (!active) return
          setProfileLookup("error")
          setProfileLookupMessage(
            error instanceof Error
              ? error.message
              : "Telegram 资料查询失败，请稍后重试。",
          )
        }
      })()
    }, 500)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [username])

  // Load all administrator-configured Premium durations and USD prices.
  useEffect(() => {
    let active = true
    async function loadPricing() {
      setLoading(true)
      setLoadError("")
      const { data, error } = await supabase
        .from("premium_pricing")
        .select("id, period, market_usd")
        .in("id", ["month", "quarter", "half-year", "year"])
      if (!active) return
      if (error) {
        setLoadError(error.message)
        setPlans([])
      } else {
        const rows = (data ?? []) as PricingRow[]
        const next = INITIAL_PLANS.map((initial) => {
          const row = rows.find((item) => item.id === initial.id)
          const price = Number(row?.market_usd)
          return row && Number.isFinite(price) && price > 0
            ? { ...initial, period: row.period, marketUsd: price }
            : null
        }).filter((item): item is Plan => item !== null)
        if (next.length !== INITIAL_PLANS.length) {
          setLoadError("套餐价格尚未完整设置，请联系管理员。")
          setPlans([])
        } else {
          setPlans(next)
        }
      }
      setLoading(false)
    }
    void loadPricing()
    return () => { active = false }
  }, [])

  // =====================================================
  // 2. 获取 GRAM 实时行情
  // =====================================================

  useEffect(() => {
    let active = true

    async function loadMarketPrice() {
      const { data, error } = await supabase.functions.invoke(
        "gram-price",
        { method: "GET" },
      )

      if (!active) return

      const priceUsd = Number(data?.priceUsd)
      const updatedAt = Number(data?.updatedAt)
      const ageSeconds =
        Math.floor(Date.now() / 1000) - updatedAt

      if (
        error ||
        !Number.isFinite(priceUsd) ||
        priceUsd <= 0 ||
        !Number.isFinite(updatedAt) ||
        ageSeconds < -60 ||
        ageSeconds > 600
      ) {
        setMarketQuote(null)
        return
      }

      setMarketQuote({ priceUsd, updatedAt })
    }

    void loadMarketPrice()

    const timer = window.setInterval(() => {
      void loadMarketPrice()
    }, 60000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const selected = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0]


  // =====================================================

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {t("Buy Telegram Premium", "购买 Telegram Premium")}
        </h1>
        <svg
          aria-hidden="true"
          viewBox="0 0 48 48"
          className="h-7 w-7 shrink-0"
          fill="none"
        >
          <rect width="48" height="48" rx="14" fill="#229ED9" />
          <path
            d="M24 7.5 28.1 18.2 39 22.3 28.1 26.4 24 37.2 19.9 26.4 9 22.3 19.9 18.2 24 7.5Z"
            fill="white"
          />
          <path d="m35.4 8.2 1.2 3.1 3.1 1.2-3.1 1.2-1.2 3.1-1.2-3.1-3.1-1.2 3.1-1.2 1.2-3.1Z" fill="white" />
        </svg>
      </header>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">{t("Choose recipient", "选择收件人")}</h2>
        <label htmlFor="premium-username" className="sr-only">{t("Telegram username", "Telegram 用户名")}</label>
        <input
          id="premium-username"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/^@+/, ""))}
          placeholder={t("Enter Telegram username", "输入 Telegram 用户名")}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/10"
        />
        <div className="space-y-3" aria-live="polite">
          {profileLookup === "loading" && <p className="text-xs text-sky-300">{t("Searching Telegram profile…", "正在查询 Telegram 资料…")}</p>}
          {profileLookup === "not-found" && <p className="text-xs text-amber-300">{profileLookupMessage || t("Username not found.", "未找到该用户名。")}</p>}
          {profileLookup === "error" && <p className="text-xs text-amber-300">{profileLookupMessage || t("Public profile is unavailable.", "暂时无法读取公开资料。")}</p>}
          {profileLookup === "found" && telegramProfile && (
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              {telegramProfile.avatarUrl ? (
                <img src={telegramProfile.avatarUrl} alt={telegramProfile.displayName} referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xl font-semibold text-sky-200">{telegramProfile.displayName.slice(0, 1).toUpperCase()}</div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-sm font-semibold text-white">{telegramProfile.displayName}</p>
                <p className="text-xs text-sky-300">@{telegramProfile.username}</p>
                {telegramProfile.bio && <p className="whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">{telegramProfile.bio}</p>}
                {telegramProfile.extra && <p className="text-xs text-zinc-500">{telegramProfile.extra}</p>}
                <a href={telegramProfile.profileUrl} target="_blank" rel="noreferrer" className="inline-block pt-1 text-xs text-sky-300 hover:underline">{t("Open Telegram profile", "打开 Telegram 个人资料")}</a>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">{t("Choose duration", "选择持续时间")}</h2>
        {loading && <p className="text-sm text-zinc-400">{t("Loading prices…", "正在读取价格……")}</p>}
        {loadError && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{loadError}</p>}
        <div className="grid grid-cols-1 gap-3">
          {plans.map((plan) => {
            const gramAmount = marketQuote ? plan.marketUsd / marketQuote.priceUsd : null
            const active = selected?.id === plan.id
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`rounded-2xl border p-4 text-left transition ${active ? "border-sky-400 bg-white/[0.03]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 whitespace-nowrap">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 bg-transparent ${active ? "border-sky-400" : "border-zinc-500"}`}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-sky-400" />}
                    </span>
                    <span className="truncate text-sm font-semibold text-white">{t(plan.period, plan.periodZh)}</span>
                    <span className="shrink-0 rounded-full bg-sky-500 px-2 py-1 text-xs font-semibold text-white">{plan.discount}</span>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white">
                    <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 text-[11px] font-black text-slate-950">G</span>
                    {gramAmount ? gramAmount.toFixed(2) : "—"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-zinc-400">${plan.marketUsd.toFixed(2)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">{t("Payment method", "付款方式")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setPaymentMethod("GRAM")} className={`rounded-xl border p-4 text-left ${paymentMethod === "GRAM" ? "border-sky-400 bg-black/20" : "border-white/10 bg-black/20"}`}>
            <span className="block font-semibold text-white">GRAM</span>
            <span className="mt-1 block text-xs text-zinc-400">{t("TON network", "TON 网络")}</span>
          </button>
          <button type="button" onClick={() => setPaymentMethod("USDT_TRC20")} className={`rounded-xl border p-4 text-left ${paymentMethod === "USDT_TRC20" ? "border-sky-400 bg-black/20" : "border-white/10 bg-black/20"}`}>
            <span className="block font-semibold text-white">USDT</span>
            <span className="mt-1 block text-xs text-zinc-400">TRC20</span>
          </button>
        </div>

        {paymentMethod === "GRAM" && (
          <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-sm font-medium text-amber-200">{t("GRAM checkout is not yet enabled.", "GRAM 支付验证流程尚未启用。")}</p>
            <p className="text-xs leading-5 text-zinc-400">{t("Please choose USDT TRC20 for this checkout. No GRAM transfer will be requested.", "当前请使用 USDT TRC20 完成付款；此处不会发起 GRAM 转账。")}</p>
          </div>
        )}

        {paymentMethod === "USDT_TRC20" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-400">{t("Amount due", "应付金额")}</span>
              <span className="text-xl font-semibold text-white">{selected ? selected.marketUsd.toFixed(2) : "—"} USDT</span>
            </div>
            <p className="text-xs leading-5 text-zinc-500">{t("Send USDT on the TRON (TRC20) network only. Other networks are not supported.", "请仅通过 TRON（TRC20）网络转账 USDT，不支持其他网络。")}</p>
          </div>
        )}

        <button
          type="button"
          disabled={!selected || loading || Boolean(loadError) || orderLoading || paymentMethod !== "USDT_TRC20" || !username.trim() || profileLookup === "loading"}
          onClick={async () => {
            if (!selected || !username.trim() || paymentMethod !== "USDT_TRC20") return
            setOrderLoading(true)
            setPaymentStatus("")
            try {
              await ensureAnonymousSession()
              const { data, error } = await anonymousSupabase.functions.invoke("create-premium-order", {
                body: { plan_id: selected.id, payment_method: "USDT_TRC20", recipient_username: username.trim().replace(/^@+/, "") },
              })
              if (error || data?.success !== true) throw new Error(data?.error || error?.message || "创建订单失败")
              setActiveOrder({
                id: data.orderId,
                orderNo: data.orderNo,
                paymentAddress: data.paymentAddress,
                amount: String(data.amount),
                expiresAt: data.expiresAt,
                usdAmount: String(data.usdAmount),
              })
              setTxHash("")
              setCopyMessage("")
            } catch (error) {
              setPaymentStatus(error instanceof Error ? error.message : "创建订单失败")
            } finally {
              setOrderLoading(false)
            }
          }}
          className="w-full rounded-full bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {orderLoading ? t("Creating order…", "正在创建订单……") : t("Continue to payment", "继续付款")}
        </button>
        {paymentStatus && !activeOrder && <p role="alert" className="text-xs text-red-300">{paymentStatus}</p>}
      </section>

      {activeOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="usdt-payment-title">
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="usdt-payment-title" className="text-lg font-semibold text-white">{t("USDT TRC20 payment", "USDT TRC20 付款")}</h2>
              <button type="button" onClick={() => setActiveOrder(null)} className="rounded-full px-3 py-1 text-zinc-400 hover:bg-white/10" aria-label={t("Close", "关闭")}>✕</button>
            </div>
            <p className="text-xs text-zinc-400">{t("Order", "订单号")}：{activeOrder.orderNo}</p>
            <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(activeOrder.paymentAddress)}`}
                alt="USDT TRC20 receiving address QR code"
                width="200"
                height="200"
                className="h-48 w-48"
              />
              <p className="text-sm font-semibold text-black">{activeOrder.amount} USDT</p>
              <p className="text-xs text-zinc-600">TRON · TRC20</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">{t("Receiving address", "收款地址")}</p>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                <code className="min-w-0 flex-1 break-all text-xs text-white">{activeOrder.paymentAddress}</code>
                <button type="button" onClick={() => {
                  void navigator.clipboard.writeText(activeOrder.paymentAddress).then(() => setCopyMessage(t("Address copied", "地址已复制"))).catch(() => setCopyMessage(t("Copy failed", "复制失败")))
                }} className="shrink-0 rounded-lg bg-sky-400 px-3 py-2 text-xs font-semibold text-slate-950">{t("Copy", "复制")}</button>
              </div>
              {copyMessage && <p className="text-xs text-emerald-300">{copyMessage}</p>}
            </div>
            <p className="text-xs leading-5 text-amber-300">{t("Send the exact amount using TRC20 only. Network fees are paid separately. The order expires at ", "请仅通过 TRC20 网络支付准确金额，网络手续费另付。订单过期时间：")}{new Date(activeOrder.expiresAt).toLocaleString()}</p>
            <div className="space-y-2">
              <label htmlFor="usdt-tx-hash" className="text-xs text-zinc-400">{t("Transaction ID (TxID)", "交易哈希（TxID）")}</label>
              <input id="usdt-tx-hash" value={txHash} onChange={(event) => setTxHash(event.target.value.trim())} placeholder={t("Paste TRON transaction hash", "粘贴 TRON 交易哈希")} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-xs text-white outline-none focus:border-sky-400" />
              <button type="button" disabled={paymentChecking || !/^[a-fA-F0-9]{64}$/.test(txHash)} onClick={async () => {
                setPaymentChecking(true)
                setPaymentStatus("")
                try {
                  const { data, error } = await anonymousSupabase.functions.invoke("verify-usdt-payment", { body: { order_id: activeOrder.id, tx_hash: txHash } })
                  if (error || data?.success !== true) throw new Error(data?.error || error?.message || "链上付款尚未确认")
                  setPaymentStatus(data.telegramNotified ? t("Payment verified. Admin has been notified by Telegram.", "付款已核实，已通过 Telegram 通知管理员。") : t("Payment verified. Telegram notification is pending; the order is recorded.", "付款已核实，Telegram 通知待重试；订单已记录。"))
                } catch (error) {
                  setPaymentStatus(error instanceof Error ? error.message : "暂时无法核实交易")
                } finally {
                  setPaymentChecking(false)
                }
              }} className="w-full rounded-full bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
                {paymentChecking ? t("Verifying on TRON…", "正在核实 TRON 链上交易……") : t("Verify payment", "核实付款")}
              </button>
              {paymentStatus && <p role="status" className="text-xs leading-5 text-sky-300">{paymentStatus}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <a href="https://fragment.com/premium/history" target="_blank" rel="noreferrer" className="text-sm text-sky-300 hover:underline">
          {t("View transaction history", "查看交易历史")}
        </a>
        <div className="mt-3">
          <Link to="/catalog" className="text-xs text-zinc-500 hover:text-zinc-300">{t("Back to marketplace", "返回商城")}</Link>
        </div>
      </div>
    </div>
  )
}
