import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useLanguage } from "../lib/useLanguage"

type CatalogListing = {
  id: string
  source: "getgems" | "fragment"
  source_item_id: string
  item_type: "username" | "phone_number" | "gift"
  listing_kind: "auction" | "fixed_price"
  title: string
  source_url: string
  image_url: string | null
  currency: "TON" | "GRAM"
  current_price_nano: string | number | null
  minimum_bid_nano: string | number | null
  auction_ends_at: string | null
  synced_at: string
}

type KindFilter = "all" | "auction" | "fixed_price"
type CategoryFilter = "all" | "username" | "phone_number" | "gift"
const ADMIN_USER_ID = "0744f173-3f36-438f-b265-9cb3be95ad78"

function formatNano(nano: string | number | null) {
  if (nano === null) return "—"
  try {
    const value = BigInt(nano.toString())
    const whole = value / 1_000_000_000n
    const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4)
    return `${whole.toString()}.${fraction}`
  } catch {
    return "—"
  }
}

function typeLabel(type: CatalogListing["item_type"], language: string) {
  const labels = {
    username: language === "zh" ? "用户名" : "Username",
    phone_number: language === "zh" ? "匿名号码" : "Anonymous number",
    gift: language === "zh" ? "收藏礼物" : "Collectible gift",
  }
  return labels[type]
}

function sourceLabel(source: CatalogListing["source"], language: string) {
  return source === "getgems"
    ? "Getgems"
    : language === "zh" ? "Fragment" : "Fragment"
}

export function FragmentCatalogPage() {
  const { language, t } = useLanguage()
  const [listings, setListings] = useState<CatalogListing[]>([])
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState("")
  const [syncMessage, setSyncMessage] = useState("")

  async function loadListings() {
    setLoading(true)
    setError("")
    const freshAfter = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data, error: queryError } = await supabase
      .from("marketplace_source_listings")
      .select("id,source,source_item_id,item_type,listing_kind,title,source_url,image_url,currency,current_price_nano,minimum_bid_nano,auction_ends_at,synced_at")
      .eq("source_status", "active")
      .gte("synced_at", freshAfter)
      .order("synced_at", { ascending: false })
      .limit(300)

    if (queryError) {
      setError(t("Unable to load marketplace listings.", "暂时无法读取市场商品。"))
    } else {
      setListings((data ?? []) as CatalogListing[])
    }
    setLoading(false)
  }

  async function syncGetgems() {
    setSyncing(true)
    setSyncMessage("")
    const { data, error: invokeError } = await supabase.functions.invoke("getgems-catalog-sync", { method: "POST" })
    if (invokeError) {
      setSyncMessage(t("Sync failed. Check the Getgems API key and function logs.", "同步失败，请检查 Getgems API Key 和函数日志。"))
    } else if (data?.error === "GETGEMS_API_KEY_MISSING") {
      setSyncMessage(t("Add GETGEMS_API_KEY to Supabase Edge Function secrets first.", "请先在 Supabase Edge Function Secrets 中设置 GETGEMS_API_KEY。"))
    } else if (data?.error) {
      setSyncMessage(String(data.message ?? data.error))
    } else {
      const counts = data?.categories ?? {}
      setSyncMessage(t(
        `Sync complete: ${counts.username ?? 0} usernames, ${counts.phone_number ?? 0} numbers, ${counts.gift ?? 0} gifts.`,
        `同步完成：用户名 ${counts.username ?? 0} 条、匿名号码 ${counts.phone_number ?? 0} 条、礼物 ${counts.gift ?? 0} 条。`
      ))
      await loadListings()
    }
    setSyncing(false)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (active) setIsAdmin(data.user?.id === ADMIN_USER_ID)
      await loadListings()
    })()
    return () => { active = false }
  }, [])

  const visibleListings = useMemo(() => listings.filter((item) => {
    const categoryMatches = categoryFilter === "all" || item.item_type === categoryFilter
    const kindMatches = kindFilter === "all" || item.listing_kind === kindFilter
    return categoryMatches && kindMatches
  }), [categoryFilter, kindFilter, listings])

  const lastSync = listings.reduce<string | null>((latest, item) => {
    if (!latest || item.synced_at > latest) return item.synced_at
    return latest
  }, null)

  const categoryOptions: { value: CategoryFilter; label: string }[] = [
    { value: "all", label: t("All categories", "全部分类") },
    { value: "username", label: t("Usernames", "用户名") },
    { value: "phone_number", label: t("Numbers", "匿名号码") },
    { value: "gift", label: t("Gifts", "礼物") },
  ]

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium text-white">
            {t("TON Collectibles Market", "TON 数字藏品市场")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            {t(
              "A multi-source preview of public listings from Getgems and supported marketplaces. Up to 100 newest listings are cached per category.",
              "聚合 Getgems 及其他获准接入市场的公开商品预览。每个分类最多缓存最新 100 条。"
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => void syncGetgems()}
              disabled={syncing}
              className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-300 disabled:opacity-50"
            >
              {syncing ? t("Syncing…", "同步中…") : t("Sync Getgems", "同步 Getgems")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadListings()}
            disabled={loading}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? t("Refreshing…", "刷新中…") : t("Refresh", "刷新")}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100/90">
        {t(
          "Preview only: listings are cached from third-party sources. Orders, bids, payments and automatic delivery are not enabled. Always verify live price and availability on the original marketplace.",
          "当前仅提供第三方市场商品预览。下单、竞拍、付款和自动交付尚未启用，请以原市场实时价格和库存为准。"
        )}
      </div>

      {syncMessage && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">{syncMessage}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategoryFilter(option.value)}
              className={`rounded-full border px-3 py-2 text-sm transition ${
                categoryFilter === option.value
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:bg-white/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {lastSync
            ? t(`Latest sync: ${new Date(lastSync).toLocaleString()}`, `最近同步：${new Date(lastSync).toLocaleString()}`)
            : t("No successful catalogue sync yet", "尚无成功的商品同步记录")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "auction", "fixed_price"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKindFilter(value)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              kindFilter === value
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
            }`}
          >
            {value === "all" ? t("All listings", "全部商品") : value === "auction" ? t("Auctions", "竞拍") : t("Fixed price", "一口价")}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 p-5 text-sm text-red-300">{error}</div>
      ) : loading ? (
        <p className="py-10 text-center text-sm text-zinc-400">{t("Loading marketplace listings…", "正在读取市场商品…")}</p>
      ) : visibleListings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 px-6 py-14 text-center">
          <h2 className="text-lg font-medium text-white">{t("No fresh marketplace listings", "暂无最新市场商品")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-400">
            {t(
              "No provider has completed a successful sync yet. The admin can connect Getgems after adding its API key to Supabase.",
              "目前尚无数据源成功同步。管理员在 Supabase 设置 Getgems API Key 后即可启动同步。"
            )}
          </p>
          <a href="https://getgems.io" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
            {t("Open Getgems", "打开 Getgems")}
          </a>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleListings.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="relative aspect-square bg-white/[0.04]">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl text-zinc-600">◇</div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                  {item.listing_kind === "auction" ? t("Auction", "竞拍") : t("Fixed price", "一口价")}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                  {sourceLabel(item.source, language)}
                </span>
              </div>
              <div className="space-y-2 p-4">
                <p className="text-xs text-zinc-500">{typeLabel(item.item_type, language)}</p>
                <h2 className="truncate font-semibold text-white">{item.title}</h2>
                <p className="text-lg font-semibold text-emerald-300">
                  {formatNano(item.listing_kind === "auction" ? (item.minimum_bid_nano ?? item.current_price_nano) : item.current_price_nano)} {item.currency}
                </p>
                {item.auction_ends_at && (
                  <p className="text-xs text-zinc-400">
                    {t("Ends", "结束时间")}: {new Date(item.auction_ends_at).toLocaleString()}
                  </p>
                )}
                <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/10">
                  {t("View source listing", "查看原市场商品")} ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="border-t border-white/10 pt-4 text-xs text-zinc-500">
        <Link to="/catalog" className="hover:text-white">{t("Back to marketplace listings", "返回商城自营商品")}</Link>
      </div>
    </div>
  )
}
