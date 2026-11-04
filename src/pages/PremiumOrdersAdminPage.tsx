import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useLanguage } from "../lib/useLanguage"

type PremiumOrder = {
  id: string
  order_no: string
  buyer_wallet: string | null
  recipient_username: string
  plan_name: string
  gram_amount: number | string
  gram_usd_rate: number | string
  usd_amount: number | string | null
  payment_method: string
  payment_address: string
  status: string
  created_at: string
  expires_at: string
  paid_at: string | null
  completed_at: string | null
}

type PremiumPayment = {
  id: string
  order_id: string
  network: string
  tx_hash: string
  sender_wallet: string | null
  receiver_wallet: string
  amount: number | string
  chain_status: string
  admin_confirmed: boolean
  admin_confirmed_at: string | null
  chain_timestamp: string | null
}

type DeliveryInput = { reference: string; note: string }

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78"

function dateLabel(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

export function PremiumOrdersAdminPage() {
  const { t } = useLanguage()
  const [orders, setOrders] = useState<PremiumOrder[]>([])
  const [payments, setPayments] = useState<PremiumPayment[]>([])
  const [inputs, setInputs] = useState<Record<string, DeliveryInput>>({})
  const [loading, setLoading] = useState(true)
  const [busyOrder, setBusyOrder] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || userData.user?.id !== ADMIN_UID) {
        throw new Error("当前账号不是授权管理员。")
      }
      const { data, error: orderError } = await supabase
        .from("premium_orders")
        .select("id, order_no, buyer_wallet, recipient_username, plan_name, gram_amount, gram_usd_rate, usd_amount, payment_method, payment_address, status, created_at, expires_at, paid_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(200)
      if (orderError) throw orderError
      const rows = (data ?? []) as PremiumOrder[]
      setOrders(rows)
      if (rows.length) {
        const { data: paymentRows, error: paymentError } = await supabase
          .from("premium_payments")
          .select("id, order_id, network, tx_hash, sender_wallet, receiver_wallet, amount, chain_status, admin_confirmed, admin_confirmed_at, chain_timestamp")
          .in("order_id", rows.map((order) => order.id))
        if (paymentError) throw paymentError
        setPayments((paymentRows ?? []) as PremiumPayment[])
      } else {
        setPayments([])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取 Premium 订单失败。")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadOrders() }, [loadOrders])

  async function confirmPayment(order: PremiumOrder, payment: PremiumPayment) {
    if (busyOrder) return
    if (payment.chain_status !== "confirmed") {
      setError("链上交易尚未确认，不能人工确认收款。")
      return
    }
    setBusyOrder(order.id)
    setError("")
    setMessage("")
    try {
      const now = new Date().toISOString()

      // Make this action safely retryable if either write previously succeeded.
      if (!payment.admin_confirmed) {
        const { error: paymentError } = await supabase
          .from("premium_payments")
          .update({ admin_confirmed: true, admin_confirmed_at: now })
          .eq("id", payment.id)
          .eq("admin_confirmed", false)
        if (paymentError) throw paymentError
      }

      const { data: updatedOrder, error: orderError } = await supabase
        .from("premium_orders")
        .update({ status: "paid", updated_at: now })
        .eq("id", order.id)
        .in("status", ["payment_detected", "paid"])
        .select("id, status")
        .maybeSingle()
      if (orderError) throw orderError

      if (!updatedOrder) {
        const { data: currentOrder, error: currentOrderError } = await supabase
          .from("premium_orders")
          .select("status")
          .eq("id", order.id)
          .maybeSingle()
        if (currentOrderError || currentOrder?.status !== "paid") {
          throw currentOrderError ?? new Error("The order could not be moved to the paid state. Retry this action.")
        }
      }

      if (!payment.admin_confirmed || order.status !== "paid") {
        const { error: logError } = await supabase.from("premium_order_logs").insert({
          order_id: order.id,
          actor_id: ADMIN_UID,
          action: "admin_confirmed_payment",
          old_status: order.status,
          new_status: "paid",
          note: "Administrator confirmed the on-chain GRAM payment.",
        })
        if (logError) console.error("Premium payment audit log failed", logError.message)
      }
      setMessage("订单 " + order.order_no + " 已确认收款。请完成 Telegram Premium 人工开通后，再标记为已完成。")
      await loadOrders()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认收款失败。")
    } finally {
      setBusyOrder("")
    }
  }

  async function completeDelivery(order: PremiumOrder) {
    if (busyOrder) return
    if (order.status !== "paid" && order.status !== "processing") {
      setError("请先确认收款，再记录 Premium 开通。")
      return
    }
    setBusyOrder(order.id)
    setError("")
    setMessage("")
    const input = inputs[order.id] ?? { reference: "", note: "" }
    const now = new Date().toISOString()
    try {
      // Write the delivery receipt first. If the order update then fails,
      // the administrator can retry without creating a duplicate receipt.
      const { data: existingDelivery, error: existingDeliveryError } = await supabase
        .from("premium_delivery_logs")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle()
      if (existingDeliveryError) throw existingDeliveryError

      if (!existingDelivery) {
        const { error: deliveryError } = await supabase.from("premium_delivery_logs").insert({
          order_id: order.id,
          recipient_username: order.recipient_username,
          plan_name: order.plan_name,
          delivery_method: "manual_telegram",
          delivery_reference: input.reference.trim() || null,
          operator_id: ADMIN_UID,
          delivered_at: now,
          delivery_status: "completed",
          note: input.note.trim() || "Manually activated by administrator.",
        })
        if (deliveryError) throw deliveryError
      }

      const { data: updatedOrder, error: orderError } = await supabase
        .from("premium_orders")
        .update({ status: "completed", completed_at: now, updated_at: now })
        .eq("id", order.id)
        .in("status", ["paid", "processing", "completed"])
        .select("id, status")
        .maybeSingle()
      if (orderError) throw orderError

      if (!updatedOrder) {
        const { data: currentOrder, error: currentOrderError } = await supabase
          .from("premium_orders")
          .select("status")
          .eq("id", order.id)
          .maybeSingle()
        if (currentOrderError || currentOrder?.status !== "completed") {
          throw currentOrderError ?? new Error("The order could not be marked completed. Retry this action.")
        }
      }

      if (!existingDelivery) {
        const { error: logError } = await supabase.from("premium_order_logs").insert({
          order_id: order.id,
          actor_id: ADMIN_UID,
          action: "manual_premium_delivery_completed",
          old_status: order.status,
          new_status: "completed",
          note: input.note.trim() || "Manually activated by administrator.",
        })
        if (logError) console.error("Premium delivery audit log failed", logError.message)
      }
      setMessage("订单 " + order.order_no + " 已记录为人工开通完成。")
      await loadOrders()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "记录 Premium 开通失败。")
    } finally {
      setBusyOrder("")
    }
  }

  const paymentByOrder = new Map(payments.map((payment) => [payment.order_id, payment]))

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE · ADMIN</p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{t("Premium orders", "Premium 订单管理")}</h1>
          <p className="mt-2 text-sm text-zinc-400">{t("Review on-chain GRAM payments and record manual Telegram Premium delivery.", "核对 GRAM 链上收款，并记录 Telegram Premium 人工开通。")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/premium-pricing" className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">{t("Premium pricing", "会员定价")}</Link>
          <button type="button" onClick={() => void loadOrders()} disabled={loading} className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">{loading ? t("Loading…", "读取中…") : t("Refresh", "刷新")}</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-300">{message}</p>}
      {loading && <p className="py-8 text-center text-sm text-zinc-400">{t("Loading orders…", "正在读取订单……")}</p>}
      {!loading && !error && orders.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm text-zinc-400">{t("No Premium orders yet.", "目前还没有 Premium 订单。")}</div>}

      <section className="space-y-4">
        {orders.map((order) => {
          const payment = paymentByOrder.get(order.id)
          const amount = order.payment_method === "GRAM"
            ? Number(order.gram_amount).toFixed(2) + " GRAM"
            : Number(order.usd_amount ?? 0).toFixed(2) + " USDT"
          const canConfirm = order.status === "payment_detected" && payment?.chain_status === "confirmed"
          const canComplete = order.status === "paid" || order.status === "processing"
          const input = inputs[order.id] ?? { reference: "", note: "" }
          return (
            <article key={order.id} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">{order.order_no}</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{order.plan_name} · @{order.recipient_username}</h2>
                  <p className="mt-1 break-all text-xs text-zinc-500">{order.buyer_wallet ?? "Buyer wallet not recorded"}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200">{order.status}</span>
              </div>

              <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-4">
                <div><p className="text-xs text-zinc-500">{t("Amount", "订单金额")}</p><p className="mt-1 text-sm font-semibold text-white">{amount}</p></div>
                <div><p className="text-xs text-zinc-500">{t("Payment method", "支付方式")}</p><p className="mt-1 text-sm text-white">{order.payment_method === "GRAM" ? "GRAM · TON Mainnet" : order.payment_method}</p></div>
                <div><p className="text-xs text-zinc-500">{t("Created", "创建时间")}</p><p className="mt-1 text-sm text-white">{dateLabel(order.created_at)}</p></div>
                <div><p className="text-xs text-zinc-500">{t("Expires", "过期时间")}</p><p className="mt-1 text-sm text-white">{dateLabel(order.expires_at)}</p></div>
              </div>

              {payment && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-zinc-300">{t("On-chain payment", "链上付款记录")} · {payment.chain_status}</p>
                    <span className={payment.admin_confirmed ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{payment.admin_confirmed ? t("Admin confirmed", "管理员已确认") : t("Awaiting admin confirmation", "等待管理员确认")}</span>
                  </div>
                  <p className="break-all text-xs text-zinc-400">{t("Sender", "付款钱包")}：{payment.sender_wallet ?? "—"}</p>
                  <p className="break-all text-xs text-zinc-400">{t("Transaction", "交易哈希")}：<a href={payment.network === "TON_MAINNET" ? "https://tonviewer.com/transaction/" + encodeURIComponent(payment.tx_hash) : "https://tronscan.org/#/transaction/" + encodeURIComponent(payment.tx_hash)} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{payment.tx_hash}</a></p>
                  <p className="text-xs text-zinc-500">{t("Chain time", "链上时间")}：{dateLabel(payment.chain_timestamp)}</p>
                </div>
              )}

              {canComplete && (
                <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-zinc-400">
                    {t("Delivery reference (optional)", "开通凭证（选填）")}
                    <input value={input.reference} onChange={(event) => setInputs((current) => ({ ...current, [order.id]: { ...input, reference: event.target.value } }))} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/30" placeholder="Telegram receipt / reference" />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    {t("Admin note (optional)", "管理员备注（选填）")}
                    <input value={input.note} onChange={(event) => setInputs((current) => ({ ...current, [order.id]: { ...input, note: event.target.value } }))} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/30" placeholder={t("Manual delivery note", "人工开通备注")} />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                {canConfirm && payment && <button type="button" onClick={() => void confirmPayment(order, payment)} disabled={Boolean(busyOrder)} className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-300 disabled:opacity-50">{busyOrder === order.id ? t("Saving…", "保存中…") : t("Confirm payment received", "确认收到款项")}</button>}
                {canComplete && <button type="button" onClick={() => void completeDelivery(order)} disabled={Boolean(busyOrder)} className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50">{busyOrder === order.id ? t("Saving…", "保存中…") : t("Mark Premium activated", "标记 Premium 已开通")}</button>}
                {order.status === "completed" && <span className="text-sm text-emerald-300">{t("Premium delivery recorded", "已记录 Premium 开通完成")} · {dateLabel(order.completed_at)}</span>}
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
