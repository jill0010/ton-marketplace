import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useLanguage } from "../lib/useLanguage"

type FragmentListing = {
  id: string
  source_item_id: string
  item_type: "username" | "phone_number" | "gift"
  listing_kind: "auction" | "fixed_price"
  title: string
  source_url: string
  image_url: string | null
  current_price_nano: string | number | null
  minimum_bid_nano: string | number | null
  auction_ends_at: string | null
  source_updated_at: string | null
  synced_at: string
}

type Filter = "all" | "auction" | "fixed_price"

function formatGram(nano: string | number | null) {
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

function typeLabel(type: FragmentListing["item_type"], language: string) {
  const labels = {
    username: language === "zh" ? "用户名" : "Username",
    phone_number: language === "zh" ? "匿名号码" : "Anonymous number",
    gift: language === "zh" ? "收藏礼物" : "Collectible gift",
  }
  return labels[type]
}

export function FragmentCatalogPage() {
  const { language, t } = useLanguage()
  const [listings, setListings] = useState<FragmentListing[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadListings() {
    setLoading(true)
    setError("")
    const freshAfter = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data, error: queryError } = await supabase
      .from("fragment_listings")
      .select("id,source_item_id,item_type,listing_kind,title,source_url,image_url,current_price_nano,minimum_bid_nano,auction_ends_at,source_updated_at,synced_at")
      .eq("source_status", "active")
      .gte("synced_at", freshAfter)
      .order("synced_at", { ascending: false })
      .limit(100)

    if (queryError) {
      setError(t("Unable to load Fragment listings.", "暂时无法读取 Fragment 商品。"))
    } else {
      setListings((data ?? []) as FragmentListing[])
    }
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      await loadListings()
      if (!active) return
    }
    void run()
    return () => { active = false }
  }, [])

  const visibleListings = useMemo(
    () => filter === "all" ? listings : listings.filter((item) => item.listing_kind === filter),
    [filter, listings],
  )

  const lastSync = listings.reduce<string | null>((latest, item) => {
    if (!latest || item.synced_at > latest) return item.synced_at
    return latest
  }, null)

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium text-white">
            {t("Fragment Market", "Fragment 市场")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            {t(
              "Browse cached public listings from Fragment. These are third-party listings, not inventory held by this marketplace.",
              "浏览从 Fragment 同步的公开商品。它们属于第三方市场在售商品，并非本商城已托管的库存。"
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadListings()}
          disabled={loading}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? t("Refreshing…", "刷新中…") : t("Refresh", "刷新")}
        </button>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100/90">
        {t(
          "Preview only: ordering, bidding, payment and automatic delivery are not enabled. Always verify the current price and availability on Fragment.",
          "当前仅提供商品预览：下单、竞拍、付款和自动交付尚未启用。请以 Fragment 页面显示的实时价格和库存为准。"
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "auction", "fixed_price"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                filter === value
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:bg-white/5"
              }`}
            >
              {value === "all"
                ? t("All", "全部")
                : value === "auction"
                  ? t("Auctions", "竞拍")
                  : t("Fixed price", "一口价")}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {lastSync
            ? t(`Latest sync: ${new Date(lastSync).toLocaleString()}`, `最近同步：${new Date(lastSync).toLocaleString()}`)
            : t("No successful catalogue sync yet", "尚无成功的商品同步记录")}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 p-5 text-sm text-red-300">{error}</div>
      ) : loading ? (
        <p className="py-10 text-center text-sm text-zinc-400">{t("Loading Fragment listings…", "正在读取 Fragment 商品…")}</p>
      ) : visibleListings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 px-6 py-14 text-center">
          <h2 className="text-lg font-medium text-white">{t("No fresh Fragment listings", "暂无最新 Fragment 商品")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-400">
            {t(
              "The catalogue sync provider has not been connected yet. This page will show listings after a supported data source is configured.",
              "商品同步数据源尚未接入。配置获准使用的数据源并成功同步后，商品会显示在这里。"
            )}
          </p>
          <a href="https://fragment.com" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
            {t("Open Fragment", "打开 Fragment")}
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
              </div>
              <div className="space-y-2 p-4">
                <p className="text-xs text-zinc-500">{typeLabel(item.item_type, language)}</p>
                <h2 className="truncate font-semibold text-white">{item.title}</h2>
                <p className="text-lg font-semibold text-emerald-300">
                  {formatGram(item.listing_kind === "auction" ? item.minimum_bid_nano : item.current_price_nano)} TON
                </p>
                {item.auction_ends_at && (
                  <p className="text-xs text-zinc-400">
                    {t("Ends", "结束时间")}: {new Date(item.auction_ends_at).toLocaleString()}
                  </p>
                )}
                <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/10">
                  {t("View on Fragment", "在 Fragment 查看")} ↗
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
