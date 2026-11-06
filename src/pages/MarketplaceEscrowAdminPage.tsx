import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type EscrowOrder = {
  id: string;
  chain_order_id: string | number;
  product_id: string | number;
  escrow_id: string | number;
  buyer_wallet_raw: string;
  seller_wallet_raw: string;
  treasury_wallet_raw: string;
  nft_item_raw: string;
  collection_raw: string;
  gross_nano: string | number;
  platform_fee_nano: string | number;
  seller_proceeds_nano: string | number;
  processing_reserve_nano: string | number;
  fee_bps: string | number;
  status: string;
  delivery_status: string;
  seller_payout_status: string;
  platform_payout_status: string;
  buyer_refund_status: string;
  payment_tx_hash: string | null;
  delivery_tx_hash: string | null;
  created_at: string;
  updated_at: string;
};
type Payout = {
  id: string;
  order_id: string;
  payout_kind: string;
  beneficiary_wallet_raw: string;
  amount_nano: string | number;
  status: string;
  dispatch_tx_hash: string | null;
  recipient_tx_hash: string | null;
  finalized_at: string | null;
};
type Event = { id: number; order_id: string; event_type: string; details: Record<string, unknown>; created_at: string };
type Observation = { id: string; order_id: string | null; observation_kind: string; transaction_hash: string; success: boolean; finalized: boolean; observed_at: string };

const FILTERS = [
  ["all", "全部状态"],
  ["payment_confirmed", "已收款"],
  ["delivery_pending", "待交付"],
  ["delivery_confirmed", "已交付"],
  ["settlement_pending", "待结算"],
  ["payouts_dispatched", "已发起分账"],
  ["refund_pending", "退款处理中"],
  ["refund_dispatched", "已发起退款"],
  ["manual_review", "人工复核"],
  ["completed", "已完成"],
  ["refunded", "已退款"],
] as const;

const STATUS_LABELS: Record<string, string> = {
  payment_confirmed: "已确认付款",
  delivery_pending: "NFT 交付处理中",
  delivery_confirmed: "NFT 已交付",
  settlement_pending: "等待资金结算",
  payouts_dispatched: "卖家及平台分账已发起",
  refund_pending: "退款处理中",
  refund_dispatched: "退款已发起",
  manual_review: "人工复核",
  completed: "交易完成",
  refunded: "已退款",
};

function nanoLabel(value: string | number) {
  try {
    const nano = BigInt(String(value));
    const whole = nano / 1_000_000_000n;
    const fraction = (nano % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
    return whole.toString() + (fraction ? "." + fraction : "") + " TON";
  } catch {
    return "—";
  }
}
function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
function shortAddress(value: string) {
  return value.length > 24 ? value.slice(0, 12) + "…" + value.slice(-8) : value;
}

export function MarketplaceEscrowAdminPage() {
  const [orders, setOrders] = useState<EscrowOrder[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-marketplace-orders", {
        body: { status: filter, limit: 100 },
      });
      if (invokeError) throw new Error(invokeError.message || "读取托管订单失败。");
      if (data?.success !== true) throw new Error(typeof data?.error === "string" ? data.error : "读取托管订单失败。");
      setOrders((data.orders ?? []) as EscrowOrder[]);
      setPayouts((data.payouts ?? []) as Payout[]);
      setEvents((data.events ?? []) as Event[]);
      setObservations((data.observations ?? []) as Observation[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取托管订单失败。");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => [
      String(order.chain_order_id),
      String(order.product_id),
      order.buyer_wallet_raw,
      order.seller_wallet_raw,
      order.nft_item_raw,
      order.payment_tx_hash ?? "",
      order.delivery_tx_hash ?? "",
    ].some((value) => value.toLowerCase().includes(term)));
  }, [orders, search]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE · ADMIN</p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">普通用户交易托管</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">只读监控链上托管订单、NFT 交付、卖家 97% 收款、平台 3% 手续费及退款状态。链上合约状态为最终依据，此后台不直接改写资金状态。</p>
        </div>
        <button type="button" onClick={() => void loadOrders()} disabled={loading} className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">{loading ? "读取中…" : "刷新订单"}</button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{error}</p>}

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索链上订单号、商品编号、钱包地址或交易哈希…" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-sky-400/50" />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={filter === value ? "rounded-full bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"}>{label}</button>)}
          <span className="ml-auto self-center text-xs text-zinc-500">{visibleOrders.length} 笔</span>
        </div>
      </section>

      {loading && <p className="py-8 text-center text-sm text-zinc-400">正在读取链上托管订单…</p>}
      {!loading && visibleOrders.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm text-zinc-400">当前没有符合条件的托管订单。</div>}

      <section className="space-y-4">
        {visibleOrders.map((order) => {
          const orderPayouts = payouts.filter((item) => item.order_id === order.id);
          const orderEvents = events.filter((item) => item.order_id === order.id);
          const orderObservations = observations.filter((item) => item.order_id === order.id);
          return (
            <article key={order.id} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-500">链上订单 #{order.chain_order_id} · 商品 #{order.product_id} · Escrow #{order.escrow_id}</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{nanoLabel(order.gross_nano)}</h2>
                  <p className="mt-1 text-xs text-zinc-500">创建：{dateLabel(order.created_at)} · 更新：{dateLabel(order.updated_at)}</p>
                </div>
                <span className={order.status === "completed" ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300" : order.status === "manual_review" ? "rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300" : "rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200"}>{STATUS_LABELS[order.status] ?? order.status}</span>
              </div>

              <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-zinc-500">买家钱包</p><p className="mt-1 break-all text-xs text-zinc-300" title={order.buyer_wallet_raw}>{shortAddress(order.buyer_wallet_raw)}</p></div>
                <div><p className="text-xs text-zinc-500">卖家钱包</p><p className="mt-1 break-all text-xs text-zinc-300" title={order.seller_wallet_raw}>{shortAddress(order.seller_wallet_raw)}</p></div>
                <div><p className="text-xs text-zinc-500">NFT 项目地址</p><p className="mt-1 break-all text-xs text-zinc-300" title={order.nft_item_raw}>{shortAddress(order.nft_item_raw)}</p></div>
                <div><p className="text-xs text-zinc-500">平台托管钱包</p><p className="mt-1 break-all text-xs text-zinc-300" title={order.treasury_wallet_raw}>{shortAddress(order.treasury_wallet_raw)}</p></div>
              </div>

              <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-zinc-500">买家付款</p><p className="mt-1 text-sm text-white">{nanoLabel(order.gross_nano)}</p></div>
                <div><p className="text-xs text-zinc-500">卖家应收（97%）</p><p className="mt-1 text-sm text-white">{nanoLabel(order.seller_proceeds_nano)}</p></div>
                <div><p className="text-xs text-zinc-500">平台手续费（3%）</p><p className="mt-1 text-sm text-white">{nanoLabel(order.platform_fee_nano)}</p></div>
                <div><p className="text-xs text-zinc-500">NFT 交付状态</p><p className="mt-1 text-sm text-white">{order.delivery_status}</p></div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-xs text-zinc-400">
                <span>卖家结算：{order.seller_payout_status}</span><span>平台结算：{order.platform_payout_status}</span><span>买家退款：{order.buyer_refund_status}</span><span>手续费：{order.fee_bps} bps</span>
              </div>

              {order.payment_tx_hash && <p className="break-all text-xs text-zinc-400">付款交易：<a href={"https://tonviewer.com/transaction/" + encodeURIComponent(order.payment_tx_hash)} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{order.payment_tx_hash}</a></p>}
              {order.delivery_tx_hash && <p className="break-all text-xs text-zinc-400">NFT 交付交易：<a href={"https://tonviewer.com/transaction/" + encodeURIComponent(order.delivery_tx_hash)} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{order.delivery_tx_hash}</a></p>}

              {orderPayouts.length > 0 && <details className="border-t border-white/10 pt-3"><summary className="cursor-pointer text-xs text-zinc-300">资金分账记录（{orderPayouts.length}）</summary><div className="mt-3 space-y-3">{orderPayouts.map((payout) => <div key={payout.id} className="rounded-lg bg-black/20 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-white">{payout.payout_kind}</span><span className="text-zinc-400">{payout.status}</span></div><p className="mt-1 text-zinc-300">{nanoLabel(payout.amount_nano)} · {shortAddress(payout.beneficiary_wallet_raw)}</p>{payout.dispatch_tx_hash && <a className="mt-1 block break-all text-sky-300" href={"https://tonviewer.com/transaction/" + encodeURIComponent(payout.dispatch_tx_hash)} target="_blank" rel="noreferrer">分账发送：{payout.dispatch_tx_hash}</a>}{payout.recipient_tx_hash && <a className="mt-1 block break-all text-sky-300" href={"https://tonviewer.com/transaction/" + encodeURIComponent(payout.recipient_tx_hash)} target="_blank" rel="noreferrer">收款确认：{payout.recipient_tx_hash}</a>}</div>)}</div></details>}

              {orderObservations.length > 0 && <details className="border-t border-white/10 pt-3"><summary className="cursor-pointer text-xs text-zinc-300">链上核验记录（{orderObservations.length}）</summary><div className="mt-3 space-y-2">{orderObservations.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-zinc-300">{item.observation_kind} · {item.success ? "成功" : "失败"} · {item.finalized ? "已最终确认" : "未最终确认"}</span><a className="break-all text-sky-300" href={"https://tonviewer.com/transaction/" + encodeURIComponent(item.transaction_hash)} target="_blank" rel="noreferrer">{item.transaction_hash}</a></div>)}</div></details>}

              {orderEvents.length > 0 && <details className="border-t border-white/10 pt-3"><summary className="cursor-pointer text-xs text-zinc-300">订单操作日志（{orderEvents.length}）</summary><div className="mt-3 space-y-2">{orderEvents.map((item) => <div key={item.id} className="text-xs text-zinc-500"><span className="text-zinc-300">{item.event_type}</span> · {dateLabel(item.created_at)}<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-zinc-500">{JSON.stringify(item.details, null, 2)}</pre></div>)}</div></details>}
            </article>
          );
        })}
      </section>
    </main>
  );
}
