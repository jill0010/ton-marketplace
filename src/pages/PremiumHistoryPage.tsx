import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTonAddress } from "@tonconnect/ui-react"
import { anonymousSupabase, ensureAnonymousSession } from "../lib/supabase"
import { useLanguage } from "../lib/useLanguage"
import { ConnectTonButton } from "../components/ConnectTonButton"

type PremiumOrder = {
  id: string
  order_no: string
  recipient_username: string
  plan_name: string
  usd_amount: number | string
  payment_method: string
  status: string
  created_at: string
  expires_at: string | null
  paid_at: string | null
  completed_at: string | null
}

type PremiumPayment = {
  order_id: string
  network: string
  tx_hash: string
  chain_status: string
  admin_confirmed: boolean
}

const STATUS_LABELS: Record<string, [string, string]> = {
  pending: ["Awaiting payment", "等待付款"],
  payment_submitted: ["Payment submitted · Awaiting verification", "已提交付款 · 等待链上核实"],
  payment_detected: ["Payment detected · Awaiting review", "已检测付款 · 等待审核"],
  paid: ["Paid", "已付款"],
  processing: ["Processing", "处理中"],
  completed: ["Completed", "已完成"],
  expired: ["Expired", "已过期"],
  cancelled: ["Cancelled", "已取消"],
  exception: ["Requires support", "需要联系客服"],
}

function formatDate(value: string | null, language: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function PremiumHistoryPage() {
  const { t, language } = useLanguage()
  const walletAddress = useTonAddress()
  const [orders, setOrders] = useState<PremiumOrder[]>([])
  const [payments, setPayments] = useState<PremiumPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadHistory = useCallback(async () => {
    if (!walletAddress) {
      setOrders([])
      setPayments([])
      setLoading(false)
      setError("")
      return
    }
    setLoading(true)
    setError("")
    try {
      await ensureAnonymousSession()
      const { data, error: ordersError } = await anonymousSupabase
        .from("premium_orders")
        .select("id, order_no, recipient_username, plan_name, usd_amount, payment_method, status, created_at, expires_at, paid_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(100)

      if (ordersError) throw ordersError
      const rows = (data ?? []) as PremiumOrder[]
      setOrders(rows)

      if (rows.length) {
        const { data: paymentRows, error: paymentsError } = await anonymousSupabase
          .from("premium_payments")
          .select("order_id, network, tx_hash, chain_status, admin_confirmed")
          .in("order_id", rows.map((order) => order.id))
        if (paymentsError) throw paymentsError
        setPayments((paymentRows ?? []) as PremiumPayment[])
      } else {
        setPayments([])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Unable to load transaction history.", "暂时无法读取交易记录。"))
    } finally {
      setLoading(false)
    }
  }, [t, walletAddress])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const paymentByOrder = new Map(payments.map((payment) => [payment.order_id, payment]))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!walletAddress ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-400/10 text-sky-300">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
              <path d="M3.5 10h17M7 14h3" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">{t("Connect your wallet to view transaction history", "连接钱包后查看交易记录")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">{t("Connect the TON wallet you use on this marketplace to continue.", "请连接你在本商城使用的 TON 钱包后继续查看。")}</p>
          <div className="mt-5 flex justify-center"><ConnectTonButton /></div>
          <Link to="/premium" className="mt-5 inline-block text-sm text-sky-300 hover:underline">{t("Back to Premium", "返回会员购买")}</Link>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {t("Transaction history", "交易记录")}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {t("Your Telegram Premium orders and payment status.", "查看你的 Telegram Premium 订单及付款状态。")}
          </p>
        </div>
        <button type="button" onClick={() => void loadHistory()} disabled={loading} className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50">
          {loading ? t("Loading…", "读取中…") : t("Refresh", "刷新")}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && <p className="py-8 text-center text-sm text-zinc-400">{t("Loading transaction history…", "正在读取交易记录…")}</p>}

      {!loading && !error && orders.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-400/10 text-sky-300">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
              <path d="M14 3.75v4h4M8.5 12h7M8.5 15.5h7" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-white">{t("No transactions yet", "暂无交易记录")}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t("Your Premium orders will appear here after you create an order.", "创建 Premium 订单后，记录会显示在这里。")}</p>
          <Link to="/premium" className="mt-5 inline-flex rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-300">
            {t("Buy Telegram Premium", "购买 Telegram Premium")}
          </Link>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => {
            const payment = paymentByOrder.get(order.id)
            const [statusEn, statusZh] = STATUS_LABELS[order.status] ?? [order.status, order.status]
            const completed = order.status === "completed"
            const detected = order.status === "payment_detected"
            return (
              <article key={order.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">{t("Order", "订单号")} · {order.order_no}</p>
                    <h2 className="mt-1 text-base font-semibold text-white">{order.plan_name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{t("Recipient", "收件人")}：@{order.recipient_username}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${completed ? "bg-emerald-400/10 text-emerald-300" : detected ? "bg-amber-400/10 text-amber-300" : "bg-white/10 text-zinc-300"}`}>
                    {language === "zh" ? statusZh : statusEn}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-zinc-500">{t("Amount", "金额")}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{Number(order.usd_amount).toFixed(2)} USDT</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">{t("Payment method", "支付方式")}</p>
                    <p className="mt-1 text-sm text-white">{order.payment_method === "USDT_TRC20" ? "USDT · TRC20" : order.payment_method}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">{t("Created", "创建时间")}</p>
                    <p className="mt-1 text-sm text-white">{formatDate(order.created_at, language)}</p>
                  </div>
                </div>
                {payment && (
                  <div className="space-y-1 border-t border-white/10 pt-3">
                    <p className="text-xs text-zinc-500">{t("Transaction ID", "交易哈希（TxID）")}</p>
                    <a href={`https://tronscan.org/#/transaction/${encodeURIComponent(payment.tx_hash)}`} target="_blank" rel="noreferrer" className="block break-all text-xs text-sky-300 hover:underline">
                      {payment.tx_hash}
                    </a>
                    <p className="text-xs text-zinc-500">
                      {payment.admin_confirmed ? t("Payment confirmed by administrator", "管理员已确认收款") : t("On-chain payment detected; awaiting administrator confirmation", "已检测到链上付款，等待管理员确认")}
                    </p>
                  </div>
                )}
                {order.completed_at && (
                  <p className="text-xs text-emerald-300">{t("Completed", "完成时间")}：{formatDate(order.completed_at, language)}</p>
                )}
              </article>
            )
          })}
        </div>
      )}

      <div className="text-center">
        <Link to="/premium" className="text-sm text-sky-300 hover:underline">← {t("Back to Premium", "返回会员购买")}</Link>
      </div>
      </>
      )}
    </div>
  )
}
