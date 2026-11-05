import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";

type ProductSummary = { name: string; type: string; image_url: string | null };
type ManualOrder = {
  id: string;
  order_no: string;
  product_id: string;
  buyer_wallet_raw: string;
  buyer_user_id: string | null;
  amount: number | string;
  currency: string;
  status: string;
  payment_tx_hash: string | null;
  delivery_tx_hash: string | null;
  delivery_reference: string | null;
  admin_note: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
  product: ProductSummary | null;
};
type OrderLog = {
  id: string;
  order_id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "等待付款",
  payment_confirmed: "已确认收款 · 待交付",
  delivery_pending: "交付处理中",
  delivered: "已交付",
  cancelled: "已取消",
  refunded: "已退款",
  manual_review: "人工复核",
};

const FILTERS = [
  { value: "all", label: "全部订单" },
  { value: "awaiting_payment", label: "等待付款" },
  { value: "payment_confirmed", label: "待交付" },
  { value: "delivery_pending", label: "交付处理中" },
  { value: "delivered", label: "已交付" },
  { value: "manual_review", label: "人工复核" },
] as const;

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function shortWallet(value: string) {
  return value.length > 24 ? value.slice(0, 12) + "…" + value.slice(-8) : value;
}

export function ManualProductOrdersAdminPage() {
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || userData.user?.id !== ADMIN_UID || userData.user.is_anonymous) {
        throw new Error("当前账号不是授权管理员。");
      }

      const { data, error: orderError } = await supabase
        .from("manual_product_orders")
        .select("id, order_no, product_id, buyer_wallet_raw, buyer_user_id, amount, currency, status, payment_tx_hash, delivery_tx_hash, delivery_reference, admin_note, paid_at, delivered_at, created_at, product:products(name, type, image_url)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (orderError) throw orderError;

      const rows = (data ?? []) as unknown as ManualOrder[];
      setOrders(rows);

      if (rows.length) {
        const { data: logRows, error: logError } = await supabase
          .from("manual_product_order_logs")
          .select("id, order_id, action, old_status, new_status, note, created_at")
          .in("order_id", rows.map((row) => row.id))
          .order("created_at", { ascending: false });
        if (logError) throw logError;
        setLogs((logRows ?? []) as OrderLog[]);
      } else {
        setLogs([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取商品交付订单失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!term) return true;
      return [
        order.order_no,
        order.product?.name ?? "",
        order.buyer_wallet_raw,
        order.payment_tx_hash ?? "",
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [orders, filter, search]);

  async function completeDelivery(order: ManualOrder) {
    if (busyOrder) return;
    const deliveryReference = (references[order.id] ?? "").trim();
    const note = (notes[order.id] ?? "").trim();
    if (!deliveryReference) {
      setError("请填写交付凭证，例如 Telegram 交付记录或可核验的交付编号。");
      return;
    }
    if (!["payment_confirmed", "delivery_pending"].includes(order.status)) {
      setError("只有已确认收款的订单才能完成交付。");
      return;
    }

    setBusyOrder(order.id);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "admin-complete-manual-product-delivery",
        { body: { order_id: order.id, delivery_reference: deliveryReference, note } },
      );
      if (invokeError) throw new Error(invokeError.message || "交付记录请求失败。");
      if (data?.success !== true || data?.status !== "delivered") {
        throw new Error(typeof data?.error === "string" ? data.error : "交付记录未能确认。");
      }
      setMessage("订单 " + order.order_no + " 已记录为交付完成。");
      setReferences((current) => ({ ...current, [order.id]: "" }));
      setNotes((current) => ({ ...current, [order.id]: "" }));
      await loadOrders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "记录商品交付失败。");
    } finally {
      setBusyOrder("");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE · ADMIN</p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">商品订单交付</h1>
          <p className="mt-2 text-sm text-zinc-400">管理员上传的用户名、匿名号码和收藏礼物订单。确认收款后，在此记录人工交付。</p>
        </div>
        <button type="button" onClick={() => void loadOrders()} disabled={loading} className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">
          {loading ? "读取中…" : "刷新订单"}
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-300">{message}</p>}

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单号、商品名称、买家钱包或交易哈希…" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-sky-400/50" />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={filter === item.value ? "rounded-full bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"}>
              {item.label}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-zinc-500">{visibleOrders.length} / {orders.length} 笔订单</span>
        </div>
      </section>

      {loading && <p className="py-8 text-center text-sm text-zinc-400">正在读取商品订单…</p>}
      {!loading && visibleOrders.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm text-zinc-400">没有符合条件的商品订单。</div>}

      <section className="space-y-4">
        {visibleOrders.map((order) => {
          const canDeliver = ["payment_confirmed", "delivery_pending"].includes(order.status);
          const orderLogs = logs.filter((log) => log.order_id === order.id);
          return (
            <article key={order.id} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {order.product?.image_url && <img src={order.product.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">{order.order_no}</p>
                    <h2 className="mt-1 truncate text-lg font-semibold text-white">{order.product?.name ?? "商品已不存在"}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{order.product?.type ?? "—"} · {dateLabel(order.created_at)}</p>
                  </div>
                </div>
                <span className={order.status === "delivered" ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300" : order.status === "manual_review" ? "rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300" : "rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200"}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>

              <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-3">
                <div><p className="text-xs text-zinc-500">订单金额</p><p className="mt-1 text-sm font-semibold text-white">{Number(order.amount).toFixed(4)} {order.currency}</p></div>
                <div><p className="text-xs text-zinc-500">买家钱包</p><p className="mt-1 break-all text-xs text-zinc-300" title={order.buyer_wallet_raw}>{shortWallet(order.buyer_wallet_raw)}</p></div>
                <div><p className="text-xs text-zinc-500">确认付款时间</p><p className="mt-1 text-sm text-zinc-300">{dateLabel(order.paid_at)}</p></div>
              </div>

              {order.payment_tx_hash && <p className="break-all text-xs text-zinc-400">付款交易：<a href={"https://tonviewer.com/transaction/" + encodeURIComponent(order.payment_tx_hash)} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{order.payment_tx_hash}</a></p>}
              {order.delivery_reference && <p className="break-all text-xs text-zinc-400">交付凭证：{order.delivery_reference}</p>}
              {order.admin_note && <p className="text-xs text-zinc-400">管理员备注：{order.admin_note}</p>}

              {canDeliver && (
                <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-zinc-400">
                    交付凭证（必填）
                    <input value={references[order.id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [order.id]: event.target.value }))} maxLength={512} placeholder="Telegram 交付记录 / 交付编号" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    管理员备注（选填）
                    <input value={notes[order.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} maxLength={2000} placeholder="交付说明" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
                  </label>
                  <button type="button" onClick={() => void completeDelivery(order)} disabled={Boolean(busyOrder) || !(references[order.id] ?? "").trim()} className="rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2">
                    {busyOrder === order.id ? "正在保存…" : "确认商品已交付"}
                  </button>
                </div>
              )}

              {order.status === "awaiting_payment" && <p className="border-t border-white/10 pt-3 text-xs text-amber-200">等待买家付款核实。未确认链上到账前，不允许交付。</p>}
              {order.status === "delivered" && <p className="border-t border-white/10 pt-3 text-xs text-emerald-300">交付完成 · {dateLabel(order.delivered_at)}</p>}

              {orderLogs.length > 0 && (
                <details className="border-t border-white/10 pt-3">
                  <summary className="cursor-pointer text-xs text-zinc-400">操作记录（{orderLogs.length}）</summary>
                  <div className="mt-3 space-y-2">
                    {orderLogs.map((log) => <div key={log.id} className="text-xs text-zinc-500"><span className="text-zinc-300">{log.action}</span> · {log.old_status ?? "—"} → {log.new_status ?? "—"} · {dateLabel(log.created_at)}{log.note ? <p className="mt-1 text-zinc-500">{log.note}</p> : null}</div>)}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
