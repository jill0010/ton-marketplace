import { useState } from "react";
import { supabase } from "../lib/supabase";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";

type ParsedIdentifier = {
  type: "username" | "phone_number" | "gift";
  name: string;
};

function parseIdentifier(value: string): ParsedIdentifier | null {
  const input = value.trim();

  // Telegram collectible usernames can be exactly four characters.
  // Accept both "@name" and "name", then store a canonical "@name".
  const username = input.startsWith("@") ? input.slice(1) : input;
  if (/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(username)) {
    return { type: "username", name: `@${username.toLowerCase()}` };
  }

  // Accept common human formatting for collectible phone numbers.
  if (/^\+?888(?:[\s-]*\d){6,}$/.test(input)) {
    return { type: "phone_number", name: `+${input.replace(/\D/g, "")}` };
  }

  // Gift identifiers may be entered with or without the leading "#".
  const gift = input.startsWith("#") ? input.slice(1) : input;
  if (/^[a-zA-Z0-9_-]{3,32}$/.test(gift)) {
    return { type: "gift", name: `#${gift}` };
  }

  return null;
}

export function ProductAdminPage() {
  const [identifier, setIdentifier] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function publishManualListing() {
    if (busy) return;
    setMessage("");
    setSuccess(false);

    const parsed = parseIdentifier(identifier);
    if (!parsed) {
      setMessage("格式不正确。请输入 @用户名、+888 电话号码或 #礼物编号。");
      return;
    }

    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      setMessage("请输入大于 0 的有效 TON 售价。");
      return;
    }

    setBusy(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== ADMIN_UID) {
        throw new Error("当前账号不是授权管理员，请重新登录管理员账号。");
      }

      const { data: existing, error: lookupError } = await supabase
        .from("products")
        .select("id")
        .eq("name", parsed.name)
        .eq("type", parsed.type)
        .eq("delivery_mode", "manual")
        .eq("status", "listed")
        .limit(1);

      if (lookupError) throw new Error(`检查重复商品失败：${lookupError.message}`);
      if (existing?.length) {
        throw new Error("该标识已有正在出售的人工交付商品，请先在下架商品页面处理原商品。");
      }

      const { error: insertError } = await supabase.from("products").insert({
        name: parsed.name,
        type: parsed.type,
        description: "",
        price: amount,
        currency: "TON",
        image_url: null,
        status: "listed",
        delivery_mode: "manual",
        chain_status: "unverified",
      });

      if (insertError) throw new Error(`发布失败：${insertError.message}`);

      setSuccess(true);
      setMessage("商品已登记并公开展示，交付方式为管理员人工交付。下单付款功能尚未开放前，客户不会被扣款。");
      setIdentifier("");
      setPrice("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">管理员快速上传</h1>
          <p className="mt-2 text-sm text-zinc-400">
            仅需填写 Telegram NFT 标识和 TON 售价。此入口用于合作商家商品登记，不要求管理员连接钱包或预先托管 NFT。
          </p>
        </div>
        <a href="/admin/manage-products" className="rounded-full border border-green-400/40 px-4 py-2 text-sm font-medium text-green-300 hover:bg-green-400/10">
          下架商品
        </a>
      </header>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="space-y-2">
          <label htmlFor="admin-product-identifier" className="block text-sm text-zinc-300">商品标识</label>
          <input
            id="admin-product-identifier"
            value={identifier}
            onChange={(event) => { setIdentifier(event.target.value); setMessage(""); setSuccess(false); }}
            placeholder="@abcd（支持4位用户名）、+888 1234 5678 或 #礼物编号"
            disabled={busy}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
          <p className="text-xs text-zinc-500">支持：4–32 位用户名（可带 @）、+888 号码、礼物编号（可带 #）。</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="admin-product-price" className="block text-sm text-zinc-300">售价（TON）</label>
          <input
            id="admin-product-price"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(event) => { setPrice(event.target.value); setMessage(""); setSuccess(false); }}
            placeholder="请输入售价"
            disabled={busy}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          onClick={() => void publishManualListing()}
          disabled={busy}
          className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "正在登记商品……" : "确认发布（人工交付）"}
        </button>

        {message && (
          <p role="status" className={`break-words rounded-xl border p-3 text-sm ${success ? "border-emerald-400/30 text-emerald-200" : "border-white/10 text-zinc-200"}`}>
            {message}
          </p>
        )}
      </section>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
        重要：管理员登记不代表 NFT 已由商城持有或完成链上验证。商品会明确标注“人工交付”；当前购买/收款功能尚未启用，不能据此向客户收款。
      </div>
    </div>
  );
}
