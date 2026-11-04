import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { GramTokenMark } from "../components/GramTokenMark";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";

type ResolvedNft = {
  type: "username" | "phone_number" | "gift";
  address: string | null;
  collection_address: string | null;
  item_index: string | null;
  name: string | null;
  description: string;
  image_url: string | null;
  telegram_url?: string;
  telegram_name?: string | null;
  verified_on_chain: boolean;
  source: string;
  animated_url?: string | null;
  attributes?: Record<string, string | null>;
  metadata?: Record<string, unknown>;
};
type BatchRow = {
  enabled: string;
  identifier: string;
  price: string;
  currency: string;
  description: string;
  rowNumber: number;
};
type BatchResult = { rowNumber: number; identifier: string; status: "published" | "failed" | "skipped"; message: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ",") { row.push(field.trim()); field = ""; }
    else if (ch === "\n") { row.push(field.trim()); if (row.some((v) => v !== "")) rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  row.push(field.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  if (quoted) throw new Error("CSV 文件存在未闭合的双引号。");
  return rows;
}

function downloadBatchTemplate() {
  const csv = [
    "enabled,identifier,price,currency,description",
    "false,@example_username,10,TON,用户名示例（请替换标识和价格）",
    "false,+88812345678,25,TON,+888号码示例（请替换标识和价格）",
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ton-marketplace-bulk-listing-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}


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
  const [syncingIndex, setSyncingIndex] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [batchFileName, setBatchFileName] = useState("");
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);


  async function loadBatchFile(file?: File) {
    setBatchRows([]);
    setBatchResults([]);
    setBatchFileName("");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage("CSV 文件不能超过 2 MB。"); return; }
    try {
      const matrix = parseCsv(await file.text());
      if (!matrix.length) throw new Error("CSV 文件为空。");
      const headers = matrix[0].map((v) => v.trim().toLowerCase());
      const required = ["enabled", "identifier", "price", "currency", "description"];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length) throw new Error("模板缺少列：" + missing.join("、"));
      if (matrix.length - 1 > 200) throw new Error("单次最多处理 200 行，请拆分文件。");
      const rows = matrix.slice(1).map((cells, index) => {
        const get = (key: string) => cells[headers.indexOf(key)] ?? "";
        return {
          enabled: get("enabled").toLowerCase(),
          identifier: get("identifier"),
          price: get("price"),
          currency: get("currency").toUpperCase(),
          description: get("description"),
          rowNumber: index + 2,
        };
      });
      setBatchRows(rows);
      setBatchFileName(file.name);
      setMessage(`已读取 ${rows.length} 行。模板示例行默认 disabled，不会发布；请将需要处理的行 enabled 改为 true。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取 CSV 文件失败。");
    }
  }

  async function publishBatch() {
    if (batchRunning || !batchRows.length) return;
    const active = batchRows.filter((r) => ["true", "1", "yes", "是"].includes(r.enabled));
    if (!active.length) { setMessage("没有启用的行。请将需要发布的行 enabled 设置为 true。"); return; }
    if (active.length > 200) { setMessage("单次最多处理 200 行。"); return; }
    setBatchRunning(true);
    setBatchResults([]);
    setMessage("");
    const results: BatchResult[] = [];
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== ADMIN_UID) throw new Error("当前账号不是授权管理员，请重新登录。");
      for (const row of batchRows) {
        if (!["true", "1", "yes", "是"].includes(row.enabled)) {
          results.push({ rowNumber: row.rowNumber, identifier: row.identifier, status: "skipped", message: "未启用，已跳过" });
          continue;
        }
        try {
          const parsed = parseIdentifier(row.identifier);
          if (!parsed || parsed.type === "gift") throw new Error("批量模板目前只支持 @用户名和 +888 号码。");
          const amount = Number(row.price);
          if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error("售价必须是大于 0 的有效数字。");
          if (row.currency !== "TON" && row.currency !== "GRAM") throw new Error("币种只支持 TON 或 GRAM。");
          const { data, error } = await supabase.functions.invoke("admin-resolve-nft", { body: { identifier: row.identifier.trim() } });
          if (error) throw new Error(error.message || "NFT 识别失败。");
          if (!data?.success) throw new Error(data?.message || data?.error || "NFT 未通过识别。");
          const nft = data as ResolvedNft;
          if (nft.type !== parsed.type || !nft.address || !nft.verified_on_chain || !nft.image_url) throw new Error("NFT 类型、链上地址、图片或链上核验不符合发布要求。");
          const productName = nft.name || parsed.name;
          const { data: existing, error: duplicateError } = await supabase.from("products").select("id").eq("nft_item_address", nft.address).limit(1);
          if (duplicateError) throw new Error("检查重复 NFT 失败：" + duplicateError.message);
          if (existing?.length) throw new Error("该 NFT 地址已存在于商品表，已跳过重复发布。");
          const { error: insertError } = await supabase.from("products").insert({
            name: productName,
            type: parsed.type,
            description: row.description || nft.description || "",
            price: amount,
            currency: row.currency,
            image_url: nft.image_url,
            status: "listed",
            delivery_mode: "manual",
            chain_status: "verified",
            nft_item_address: nft.address,
            collection_address: nft.collection_address,
            item_index: nft.item_index,
            listing_kind: "fixed_price",
            auction_ends_at: null,
            minimum_bid: null,
            product_metadata: {
              source: nft.source,
              batch_import: true,
              listing_type: "sale",
              telegram_url: nft.telegram_url ?? null,
              animated_url: nft.animated_url ?? null,
              attributes: nft.attributes ?? {},
              ...(nft.metadata ?? {}),
            },
          });
          if (insertError) throw new Error("数据库写入失败：" + insertError.message);
          results.push({
            rowNumber: row.rowNumber,
            identifier: row.identifier,
            status: "published",
            message: "已通过链上核验并发布到商城（人工交付）。",
          });
        } catch (error) {
          results.push({ rowNumber: row.rowNumber, identifier: row.identifier, status: "failed", message: error instanceof Error ? error.message : "处理失败" });
        }
        setBatchResults([...results]);
      }
      const published = results.filter((r) => r.status === "published").length;
      const failed = results.filter((r) => r.status === "failed").length;
      setMessage(`批量处理完成：成功上架 ${published} 条；失败 ${failed} 条。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量发布失败。");
    } finally {
      setBatchRunning(false);
    }
  }

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
        timeoutId = window.setTimeout(() => reject(new Error("查询超过 20 秒仍未响应。请稍后重试或检查 Telegram 页面是否可访问。")), 20000);
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
      setMessage(data.source === "telegram_web" ? "已从 Telegram 礼物网页读取图片和商品资料，请核对后填写售价并发布。" : "已读取 NFT 资料，请核对图片和名称后再发布。");
    } catch (error) {
      console.error("Admin NFT lookup failed:", error);
      setMessage(error instanceof Error && error.message.trim() ? error.message : (typeof error === "string" ? error : "NFT 查询失败：服务返回了无法识别的错误，请检查 Supabase Edge Function 日志。"));
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    if (!parseIdentifier(identifier) || resolving || publishing) return;
    const timer = window.setTimeout(() => { void resolveNft(); }, 900);
    return () => window.clearTimeout(timer);
  }, [identifier]);

  async function syncNftIndex() {
    if (syncingIndex || resolving || publishing) return;
    setSyncingIndex(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("telegram-nft-index-sync", { body: {} });
      if (error) {
        let detail = error.message || "索引同步失败。";
        const context = (error as { context?: { clone?: () => Response; json?: () => Promise<unknown>; status?: number } }).context;
        if (context && typeof context.json === "function") {
          try {
            const response = typeof context.clone === "function" ? context.clone() : context as Response;
            const payload = await response.json() as { message?: string; error?: string; stage?: string; missing_environment?: string[] };
            detail = [
              payload.message || payload.error || detail,
              payload.stage ? "执行阶段：" + payload.stage : "",
              payload.missing_environment?.length ? "缺少配置：" + payload.missing_environment.join("、") : "",
            ].filter(Boolean).join(" ");
          } catch {
            detail = detail + "（HTTP " + (context.status ?? "未知状态") + "）";
          }
        }
        throw new Error(detail);
      }
      if (!data?.success) throw new Error(data?.message || data?.error || "索引同步失败。");
      const details = Array.isArray(data.results)
        ? data.results.map((item: { asset_type?: string; synced?: number; total_synced?: number; complete?: boolean }) =>
            `${item.asset_type === "username" ? "用户名" : "888号码"}：本次同步 ${item.synced ?? 0} 项，累计 ${item.total_synced ?? 0} 项，${item.complete ? "已完成" : "仍有后续页"}`).join("；")
        : "";
      setMessage(`立即同步完成。${details ? " " + details : ""} 后台仍会每 5 分钟自动继续同步，无需再次手动操作。`);
    } catch (error) {
      let message = error instanceof Error ? error.message : "索引同步失败。";
      const context = error && typeof error === "object" && "context" in error
        ? (error as { context?: unknown }).context
        : null;
      if (context instanceof Response) {
        try {
          const payload = await context.clone().json() as { message?: string; error?: string; missing_environment?: string[] };
          message = [
            payload.message || payload.error || message,
            payload.missing_environment?.length
              ? `缺少配置：${payload.missing_environment.join("、")}`
              : "",
          ].filter(Boolean).join(" ");
        } catch {
          // Keep the original FunctionsHttpError message if the response is not JSON.
        }
      }
      setMessage(message);
    } finally {
      setSyncingIndex(false);
    }
  }

  function resolutionMessage(code?: string) {
    const messages: Record<string, string> = {
      TELEGRAM_GIFT_PAGE_LOOKUP_FAILED: "无法从 Telegram 礼物网页读取图片或资料，请确认链接正确且页面可公开访问。",
      PORTALS_API_KEY_REQUIRED: "旧版礼物查询配置缺失；礼物网页识别不再依赖 Portals API。",
      PORTALS_KEY_INVALID: "Portals API Key 无效或已重新签发，请在 Portals Partner API 页面核对密钥。",
      PORTALS_SUBSCRIPTION_REQUIRED: "Portals Partner API 尚未开通套餐，或套餐已过期。请在 Portals Partner API 页面选择 Free 套餐。",
      PORTALS_RATE_LIMITED: "旧版 Portals 查询触发限流；当前礼物网页识别不调用 Portals API。",
      PORTALS_LOOKUP_FAILED: "Portals 礼物查询接口暂时失败，请稍后重试。",
      TON_NFT_VERIFICATION_FAILED: "Portals 已找到礼物，但读取 TON 链上 NFT 失败。请稍后重试。",
      GIFT_NOT_MINTED: "Portals 找到了礼物，但它尚未铸造为 TON NFT，暂时不能作为链上 NFT 发布。",
      IDENTIFIER_INDEX_REQUIRED: "当前索引尚未收录该标识。请先点击“同步用户名 / +888 NFT 索引”，同步后重新识别。",
      NFT_IDENTIFIER_AMBIGUOUS: "索引中存在多个同名 NFT，暂不能自动选择，请输入 TON NFT 原始地址核对。",
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
    const pageBasedGift = resolved?.type === "gift" && resolved.source === "telegram_web" && Boolean(resolved.image_url);
    if (!resolved || !resolved.image_url || (!pageBasedGift && (!resolved.verified_on_chain || !resolved.address))) {
      setMessage("请先成功读取 NFT 原图并保存到商城图片库，再发布商品。");
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
        chain_status: resolved.verified_on_chain ? "verified" : "unverified",
        nft_item_address: resolved.address,
        collection_address: resolved.collection_address,
        item_index: resolved.item_index,
        product_metadata: { source: resolved.source, telegram_url: resolved.telegram_url ?? null, animated_url: resolved.animated_url ?? null, attributes: resolved.attributes ?? {}, ...(resolved.metadata ?? {}) },
      });
      if (insertError) throw new Error(`发布失败：${insertError.message}`);

      setSuccess(true);
      setMessage(pageBasedGift ? "礼物网页资料和图片已登记并公开展示；未调用 Portals API。交付方式为管理员人工交付，商城尚未托管 NFT。" : "商品已登记并公开展示。交付方式为管理员人工交付，商城尚未托管 NFT。");
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

      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-100">
        <p className="font-semibold">后台自动同步已开启</p>
        <p className="mt-1 text-emerald-100/80">用户名和 +888 NFT 索引由 Supabase 后台每 5 分钟自动同步一次。首次全量索引会自动续页；完成后继续定期检查最新 NFT。无需保持此页面打开，也无需手动点击同步。</p>
      </div>


      <section className="space-y-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-5">
        <div>
          <h2 className="text-xl font-semibold text-white">文件批量发布</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">下载 CSV 模板（Excel 可打开），填写用户名、+888 号码、售价和币种，再上传文件。系统逐行调用 NFT 链上核验并写入商品数据库。</p>
          <p className="mt-2 text-xs leading-5 text-amber-200/90">填写规则：enabled 填 true 才会处理；currency 填 TON 或 GRAM。当前仅支持固定售价出售，不处理拍卖。标识暂支持 @用户名和 +888 号码。</p>
        </div>
        <button type="button" onClick={downloadBatchTemplate} className="rounded-full border border-sky-300/40 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-300/10">下载 Export 模板（CSV / Excel 可打开）</button>
        <label className="block space-y-2 text-sm text-zinc-300">
          <span>上传填写完成的 CSV 文件（最多 200 行 / 2 MB）</span>
          <input type="file" accept=".csv,text/csv" disabled={batchRunning} onChange={(event) => void loadBatchFile(event.target.files?.[0])} className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-zinc-100" />
        </label>
        {batchFileName && <p className="text-xs text-zinc-400">文件：{batchFileName} · 共 {batchRows.length} 行 · 启用 {batchRows.filter((r) => ["true","1","yes","是"].includes(r.enabled)).length} 行</p>}
        {batchRows.length > 0 && <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400"><tr><th className="p-2">行</th><th className="p-2">标识</th><th className="p-2">价格</th><th className="p-2">状态</th></tr></thead>
            <tbody>{batchRows.map((r) => <tr key={r.rowNumber} className="border-t border-white/5"><td className="p-2">{r.rowNumber}</td><td className="p-2">{r.identifier || "—"}</td><td className="p-2"><span className="inline-flex items-center gap-1">{r.currency === "GRAM" && <GramTokenMark className="h-3.5 w-3.5" />}{r.price} {r.currency}</span></td><td className="p-2">{["true","1","yes","是"].includes(r.enabled) ? "待处理" : "跳过"}</td></tr>)}</tbody>
          </table>
        </div>}
        <button type="button" onClick={() => void publishBatch()} disabled={batchRunning || !batchRows.some((r) => ["true","1","yes","是"].includes(r.enabled))} className="w-full rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50">{batchRunning ? "正在逐行核验并处理……" : "确认批量处理并发布"}</button>
        {batchResults.length > 0 && <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-white/10 p-3">{batchResults.map((r) => <div key={r.rowNumber} className="text-xs"><p className="font-medium text-white">第 {r.rowNumber} 行 · {r.identifier} · {r.status === "published" ? "已上架" : r.status === "skipped" ? "已跳过" : "失败"}</p><p className="mt-1 text-zinc-400">{r.message}</p></div>)}</div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="space-y-2">
          <label htmlFor="admin-product-identifier" className="block text-sm text-zinc-300">Telegram 标识 / NFT 地址</label>
          <input
            id="admin-product-identifier"
            value={identifier}
            onChange={(event) => { setIdentifier(event.target.value); setResolved(null); setMessage(""); setSuccess(false); }}
            placeholder="@abcd、+888号码、https://t.me/nft/victorymedal-8880 或 TON NFT 地址"
            disabled={resolving || publishing}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40 disabled:opacity-50"
          />
          <p className="text-xs text-zinc-500">输入 @用户名、+888 号码或粘贴 t.me/nft 礼物链接，稍作停顿后自动识别 NFT 图片和资料。</p>
        </div>

        <button
          type="button"
          onClick={() => void syncNftIndex()}
          disabled={syncingIndex || resolving || publishing}
          className="w-full rounded-full border border-amber-400/40 bg-amber-400/10 px-5 py-3 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncingIndex ? "正在执行立即同步……" : "立即手动同步（可选）"}
        </button>

        <button
          type="button"
          onClick={() => void resolveNft()}
          disabled={resolving || publishing || !identifier.trim()}
          className="w-full rounded-full border border-sky-400/40 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resolving ? "正在读取 NFT 商品资料与图片……" : "自动识别 NFT 图片与资料"}
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
              {resolved.address && <p className="break-all text-xs text-zinc-400">NFT：{resolved.address}</p>}
              <p className="break-all text-xs text-zinc-400">Collection：{resolved.collection_address || "—"}</p>
              <p className="text-xs text-zinc-400">Index：{resolved.item_index || "—"}</p>
              <p className="text-xs text-emerald-200">{resolved.source === "telegram_web" ? "资料直接读取自 Telegram 礼物公开网页；未调用 Portals API。" : resolved.verified_on_chain ? "已核对 TON 链上 NFT 资料。" : "已读取公开商品资料，尚未进行链上核验。"}</p>
              {resolved.attributes && <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-300">{Object.entries(resolved.attributes).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="text-zinc-500">{({ model: "型号", backdrop: "背景", symbol: "符号", quantity: "数量", number: "编号" } as Record<string, string>)[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>}

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
