import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";

type TelegramProfile = { username: string; displayName: string; bio: string | null; extra: string | null; avatarUrl: string | null; profileUrl: string; source: string; };

type ResolvedNft = {
  type: "username" | "phone_number" | "gift";
  address: string;
  collection_address: string | null;
  item_index: string | null;
  name: string | null;
  description: string;
  image_url: string | null;
  telegram_url?: string;
  telegram_name?: string | null;
  verified_on_chain: boolean;
  source: string;
};

function parseIdentifier(value: string) {
  const input = value.trim();
  const username = input.startsWith("@") ? input.slice(1) : input;
  if (/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(username)) {
    return { type: "username" as const, name: `@${username.toLowerCase()}` };
  }
  if (/^\+?888(?:[\s-]*\d){6,}$/.test(input)) {
    return { type: "phone_number" as const, name: `+${input.replace(/\D/g, "")}` };
  }
  const giftLink = input.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/nft\/([a-zA-Z0-9_-]+)\/?$/i);
  if (giftLink) return { type: "gift" as const, name: `#${giftLink[1]}` };
  const gift = input.startsWith("#") ? input.slice(1) : input;
  if (/^[a-zA-Z0-9_-]{3,32}$/.test(gift)) return { type: "gift" as const, name: `#${gift}` };
  return null;
}

export function ProductAdminPage() {
  const [identifier, setIdentifier] = useState("");
  const [price, setPrice] = useState("");
  const [resolved, setResolved] = useState<ResolvedNft | null>(null);
  const [resolving, setResolving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [profilePreview, setProfilePreview] = useState<TelegramProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileRequestId = useRef(0);

  async function lookupUsernamePreview(username: string, requestId: number) {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-user-profile", {
        body: { username },
      });
      if (requestId !== profileRequestId.current) return;
      if (error || !data?.success || !data?.profile) {
        setProfilePreview(null);
        return;
      }
      setProfilePreview(data.profile as TelegramProfile);
    } catch {
      if (requestId === profileRequestId.current) setProfilePreview(null);
    } finally {
      if (requestId === profileRequestId.current) setProfileLoading(false);
    }
  }

  useEffect(() => {
    const requestId = ++profileRequestId.current;
    const parsed = parseIdentifier(identifier);
    if (parsed?.type !== "username") {
      profileRequestId.current += 1;
      setProfilePreview(null);
      setProfileLoading(false);
      return;
    }
    const username = parsed.name.replace(/^@/, "");
    const timer = window.setTimeout(() => void lookupUsernamePreview(username, requestId), 650);
    return () => window.clearTimeout(timer);
  }, [identifier]);

  async function resolveNft() {
    if (resolving || publishing) return;
    setMessage("");
    setSuccess(false);
    setResolved(null);
    setResolving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== ADMIN_UID) throw new Error("当前账号不是授权管理员，请重新登录。");
      const request = supabase.functions.invoke("admin-resolve-nft", {
        body: { identifier: identifier.trim() },
      });
      let timeoutId: number | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("查询超过 20 秒仍未响应。请稍后重试；如果连续失败，请联系管理员检查 Portals API 状态。")), 20000);
      });
      let result: Awaited<typeof request>;
      try {
        result = await Promise.race([request, timeout]);
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
      const { data, error } = result;
      if (error) {
        let detail = error.message || "NFT 查询服务暂时不可用。";
        const context = (error as { context?: { json?: () => Promise<unknown>; status?: number } }).context;
        if (context && typeof context.json === "function") {
          try {
            const payload = await context.json() as { message?: string; error?: string; detail?: unknown };
            const primary = payload.message || (payload.error ? resolutionMessage(payload.error) : detail);
            const diagnostic = payload.detail && typeof payload.detail === "object"
              ? JSON.stringify(payload.detail)
              : typeof payload.detail === "string" ? payload.detail : "";
            const retryAfter = (payload as { retry_after_seconds?: unknown }).retry_after_seconds;
            const retryMessage = typeof retryAfter === "number" && Number.isFinite(retryAfter)
              ? ` 建议等待 ${Math.max(1, Math.ceil(retryAfter))} 秒后再试。`
              : "";
            detail = `${primary}${diagnostic ? ` 诊断信息：${diagnostic}` : ""}${retryMessage}`;
          } catch {
            detail = `${detail}（HTTP ${context.status ?? "未知状态"}）`;
          }
        }
        throw new Error(detail);
      }
      if (!data) throw new Error("NFT 查询服务返回了空响应，请检查 Supabase Edge Function 日志。");
      if (!data.success) {
        const detail = data.detail && typeof data.detail === "object" ? ` 诊断信息：${JSON.stringify(data.detail)}` : "";
        throw new Error(`${data.message || resolutionMessage(data.error)}${detail}`);
      }
      setResolved(data as ResolvedNft);
      setMessage("已读取并核验 NFT 链上资料。请核对图片和名称后再发布。");
    } catch (error) {
      console.error("Admin NFT lookup failed:", error);
      setMessage(error instanceof Error && error.message.trim() ? error.message : (typeof error === "string" ? error : "NFT 查询失败：服务返回了无法识别的错误，请检查 Supabase Edge Function 日志。"));
    } finally {
      setResolving(false);
    }
  }

  function resolutionMessage(code?: string) {
    const messages: Record<string, string> = {
      PORTALS_API_KEY_REQUIRED: "礼物链接已识别，但服务器没有读取到 PORTALS_API_KEY。请检查 Supabase Edge Function Secrets。",
      PORTALS_KEY_INVALID: "Portals API Key 无效或已重新签发，请在 Portals Partner API 页面核对密钥。",
      PORTALS_SUBSCRIPTION_REQUIRED: "Portals Partner API 尚未开通套餐，或套餐已过期。请在 Portals Partner API 页面选择 Free 套餐。",
      PORTALS_RATE_LIMITED: "Portals API 请求已达到当前套餐限额。请等待限流窗口重置后再试，不要连续点击查询。",
      PORTALS_LOOKUP_FAILED: "Portals 礼物查询接口暂时失败，请稍后重试。",
      TON_NFT_VERIFICATION_FAILED: "Portals 已找到礼物，但读取 TON 链上 NFT 失败。请稍后重试。",
      GIFT_NOT_MINTED: "Portals 找到了礼物，但它尚未铸造为 TON NFT，暂时不能作为链上 NFT 发布。",
      IDENTIFIER_INDEX_REQUIRED: "标识格式正确，但目前还没有用户名/888号码反查索引。可以先输入该 NFT 的 TON 原始地址进行链上核验。",
      GIFT_NOT_FOUND_OR_NOT_MINTED: "没有找到该礼物，或者该礼物尚未铸造为 TON NFT。",
      COLLECTION_NOT_ALLOWLISTED: "NFT 地址有效，但所属 Collection 不在官方白名单中，不能作为已核验商品发布。",
    };
    return messages[code ?? ""] || `NFT 查询失败（${code || "未知错误"}）。`;
  }

  async function publishManualListing() {
    if (resolving || publishing) return;
    setMessage("");
    setSuccess(false);
    const parsed = parseIdentifier(identifier);
    if (!parsed) {
      setMessage("格式不正确。请输入 @用户名、+888 电话号码、礼物链接/编号或 TON NFT 地址。");
      return;
    }
    if (!resolved?.verified_on_chain || !resolved.address) {
      setMessage("请先成功查询并核验 NFT 链上资料，再发布商品。");
      return;
    }
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      setMessage("请输入大于 0 的有效 TON 售价。");
      return;
    }

    setPublishing(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== ADMIN_UID) throw new Error("当前账号不是授权管理员，请重新登录管理员账号。");
      const productName = parsed.type === "gift"
        ? (resolved.name || parsed.name)
        : parsed.name;
      const { data: existing, error: lookupError } = await supabase
        .from("products")
        .select("id")
        .eq("name", productName)
        .eq("type", parsed.type)
        .eq("delivery_mode", "manual")
        .eq("status", "listed")
        .limit(1);
      if (lookupError) throw new Error(`检查重复商品失败：${lookupError.message}`);
      if (existing?.length) throw new Error("该标识已有正在出售的人工交付商品，请先下架原商品。");

      const { error: insertError } = await supabase.from("products").insert({
        name: productName,
        type: parsed.type,
        description: resolved.description || "",
        price: amount,
        currency: "TON",
        image_url: resolved.image_url,
        status: "listed",
        delivery_mode: "manual",
        chain_status: "unverified",
        nft_item_address: resolved.address,
        collection_address: resolved.collection_address,
        item_index: resolved.item_index,
      });
      if (insertError) throw new Error(`发布失败：${insertError.message}`);

      setSuccess(true);
      setMessage("商品已登记并公开展示。NFT 地址及图片资料来自链上读取；交付方式为管理员人工交付，商城尚未托管 NFT。");
      setIdentifier("");
      setPrice("");
      setResolved(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败，请稍后重试。");
    } finally {
      setPublishing(false);
    }
  }

  const telegramLink = resolved?.telegram_url || (resolved?.type === "gift" && identifier.trim().startsWith("http") ? identifier.trim() : null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">管理员快速上传</h1>
          <p className="mt-2 text-sm text-zinc-400">
            输入 Telegram 用户名、888 号码、礼物链接或 TON NFT 地址，先读取并核验资料，再登记人工交付商品。
          </p>
        </div>
        <a href="/admin/manage-products" className="rounded-full border border-green-400/40 px-4 py-2 text-sm font-medium text-green-300 hover:bg-green-400/10">
          下架商品
        </a>
      </header>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="space-y-2">
          <label htmlFor="admin-product-identifier" className="block text-sm text-zinc-300">Telegram 标识 / NFT 地址</label>
          <input
            id="admin-product-identifier"
            value={identifier}
            onChange={(event) => { setIdentifier(event.target.value); setResolved(null); setProfilePreview(null); setMessage(""); setSuccess(false); }}
            placeholder="@abcd、+888号码、https://t.me/nft/victorymedal-8880 或 TON NFT 地址"
            disabled={resolving || publishing}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
          <p className="text-xs text-zinc-500">礼物可直接粘贴完整 t.me/nft 链接；也支持 4–32 位用户名和 +888 号码。</p>
        </div>

        <button
          type="button"
          onClick={() => void resolveNft()}
          disabled={resolving || publishing || !identifier.trim()}
          className="w-full rounded-full border border-sky-400/40 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resolving ? "正在查询并核验链上 NFT……" : "查询 NFT 图片与链上资料"}
        </button>

        {resolved && (
          <div className="grid gap-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4 sm:grid-cols-[160px_1fr]">
            {resolved.image_url ? (
              <img src={resolved.image_url} alt={resolved.name || "NFT"} className="aspect-square w-full rounded-lg bg-black/20 object-contain" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-lg bg-black/20 text-sm text-zinc-500">链上未提供图片</div>
            )}
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-semibold text-white">{resolved.name || "Telegram NFT"}</p>
              <p className="break-all text-xs text-zinc-400">NFT：{resolved.address}</p>
              <p className="break-all text-xs text-zinc-400">Collection：{resolved.collection_address || "—"}</p>
              <p className="text-xs text-zinc-400">Index：{resolved.item_index || "—"}</p>
              <p className="text-xs text-emerald-200">{resolved.type === "gift" ? "已确认 TON 链上 NFT 合约已初始化；礼物身份由索引服务匹配。" : "已确认 NFT 合约已初始化，并核对官方 Telegram Collection。"}</p>
              {resolved.source === "portals_fallback" && <p className="text-xs text-amber-200">链上未返回图片，当前图片来自 Portals 礼物目录。</p>}
              {telegramLink && <a className="text-xs text-sky-300 underline" href={telegramLink} target="_blank" rel="noreferrer">打开 Telegram 礼物链接</a>}
            </div>
          </div>
        )}

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
            disabled={resolving || publishing}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          onClick={() => void publishManualListing()}
          disabled={resolving || publishing || !resolved}
          className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishing ? "正在登记商品……" : "确认发布（人工交付）"}
        </button>

        {message && (
          <p role="status" className={`break-words rounded-xl border p-3 text-sm ${success ? "border-emerald-400/30 text-emerald-200" : "border-white/10 text-zinc-200"}`}>
            {message}
          </p>
        )}
      </section>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
        重要：链上核验只证明 NFT 地址和 Collection 信息，不代表商城持有该 NFT。商品仍为管理员人工交付；当前购买/收款功能未开放，不能据此向客户收款。
      </div>
    </div>
  );
}
