import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TonConnectButton } from "@tonconnect/ui-react";
import { anonymousSupabase, ensureAnonymousSession, supabase } from "../lib/supabase";
import { useVerifiedTonWallet } from "../hooks/useVerifiedTonWallet";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";

type Asset = {
  address: string;
  type: "username" | "phone_number" | "gift";
  name: string;
  item_index: string;
};

function parseIdentifier(value: string):
  | { type: Asset["type"]; value: string }
  | null {
  const input = value.trim();
  if (/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(input)) {
    return { type: "username", value: input.slice(1).toLowerCase() };
  }
  if (/^\+888(?:[\s-]*\d){6,}$/.test(input)) {
    return { type: "phone_number", value: input.replace(/\D/g, "") };
  }
  if (/^#[a-zA-Z0-9_-]{3,32}$/.test(input)) {
    return { type: "gift", value: input.slice(1).toLowerCase() };
  }
  return null;
}

function matchesAsset(asset: Asset, identifier: { type: Asset["type"]; value: string }) {
  if (asset.type !== identifier.type) return false;
  const name = asset.name.trim().toLowerCase();
  if (identifier.type === "username") {
    return name.replace(/^@/, "") === identifier.value;
  }
  if (identifier.type === "phone_number") {
    return name.replace(/\D/g, "") === identifier.value;
  }
  const serial = name.match(/#([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
  return serial === identifier.value ||
    asset.item_index === identifier.value ||
    asset.item_index.replace(/^0+/, "") === identifier.value.replace(/^0+/, "");
}

export function ProductAdminPage() {
  const navigate = useNavigate();
  const { walletAddress, connecting, verifying, proofMessage, isWalletVerified, connectAndVerifyWallet } =
    useVerifiedTonWallet();
  const [identifier, setIdentifier] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleContinue() {
    if (busy) return;
    const parsed = parseIdentifier(identifier);
    if (!parsed) {
      setMessage("格式不正确。请使用 @用户名、+888 电话号码或 #礼物编号。");
      return;
    }
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      setMessage("请输入大于 0 的有效 TON 售价。");
      return;
    }
    if (!isWalletVerified || !walletAddress) {
      setMessage("请先连接并完成 TON 主网钱包签名验证。");
      return;
    }

    setBusy(true);
    setMessage("正在核验管理员身份、钱包持有权和 Telegram 官方 NFT 集合……");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== ADMIN_UID) {
        throw new Error("当前账号不是授权管理员。");
      }

      await ensureAnonymousSession();
      const { data, error } = await anonymousSupabase.functions.invoke(
        "nft-wallet-assets",
        { body: { wallet_address: walletAddress } },
      );
      if (error || data?.success !== true || !Array.isArray(data.items)) {
        throw new Error(data?.error || error?.message || "无法读取已验证钱包中的 NFT。");
      }

      const assets = data.items as Asset[];
      const matches = assets.filter((asset) => matchesAsset(asset, parsed));
      if (matches.length === 0) {
        throw new Error("没有找到匹配的 NFT。请确认该资产属于当前已验证的钱包，且属于商城启用的 Telegram 官方 NFT 集合。");
      }
      if (matches.length > 1) {
        throw new Error("找到多个匹配资产，无法安全确定唯一 NFT。请使用更精确的礼物编号。");
      }

      const asset = matches[0];
      const params = new URLSearchParams({
        adminQuick: "1",
        asset: asset.address,
        price: String(amount),
      });
      navigate("/publish?" + params.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "核验失败，请稍后重试。");
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
            输入 Telegram NFT 标识和售价。图片、名称及描述均从链上 NFT 元数据读取。
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.assign("/admin/manage-products")}
          className="rounded-full border border-green-400/40 px-4 py-2 text-sm font-medium text-green-300 hover:bg-green-400/10"
        >
          下架商品
        </button>
      </header>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="space-y-2">
          <h2 className="font-medium text-white">管理员钱包验证</h2>
          {!walletAddress ? (
            <button
              type="button"
              onClick={() => void connectAndVerifyWallet()}
              disabled={connecting || verifying}
              className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {connecting ? "正在连接……" : "连接并验证 TON 主网钱包"}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="break-all rounded-xl bg-black/20 p-3 text-xs text-zinc-400">{walletAddress}</p>
              <TonConnectButton />
              {!isWalletVerified && (
                <button
                  type="button"
                  onClick={() => void connectAndVerifyWallet()}
                  disabled={connecting || verifying}
                  className="w-full rounded-full border border-white/20 px-5 py-3 text-sm text-white disabled:opacity-50"
                >
                  {verifying ? "正在验证……" : "重新连接并验证钱包"}
                </button>
              )}
            </div>
          )}
          {proofMessage && <p className="text-xs text-zinc-400">{proofMessage}</p>}
          <p className="text-xs text-zinc-500">
            只读取通过 TON Proof 验证的钱包资产；服务端还会核对官方 NFT 集合及当前持有人。
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="admin-product-identifier" className="block text-sm text-zinc-300">商品标识</label>
          <input
            id="admin-product-identifier"
            value={identifier}
            onChange={(event) => { setIdentifier(event.target.value); setMessage(""); }}
            placeholder="@username、+888 1234 5678 或 #123456"
            disabled={busy}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
          <p className="text-xs text-zinc-500">支持：@用户名、+888 号码、#礼物编号。</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="admin-product-price" className="block text-sm text-zinc-300">售价（TON）</label>
          <input
            id="admin-product-price"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(event) => { setPrice(event.target.value); setMessage(""); }}
            placeholder="请输入售价"
            disabled={busy}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleContinue()}
          disabled={busy || !isWalletVerified}
          className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "正在链上核验……" : "验证 NFT 并继续托管上架"}
        </button>

        {message && <p role="status" className="break-words rounded-xl border border-white/10 p-3 text-sm text-zinc-200">{message}</p>}
      </section>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
        输入标识不会直接创建公开商品。只有后续 Marketplace V2 链上托管登记、NFT 转移和服务端核验全部成功后，商品才会公开上架。
      </div>
    </div>
  );
}
