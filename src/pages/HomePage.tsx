import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useTonAddress } from "@tonconnect/ui-react"
import { ProductCard } from "../components/ProductCard"
import { GramTokenMark } from "../components/GramTokenMark"
import { getListedProducts } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import { formatTelegramNumber } from "../lib/formatTelegramNumber"
import type { Product, ProductType } from "../types/product"

const HOME_CATEGORIES = [
  { type: "number", en: "Numbers", zh: "匿名号码" },
  { type: "username", en: "Usernames", zh: "用户名" },
  { type: "gift", en: "Gifts", zh: "收藏礼物" },
  { type: "premium", en: "Telegram Premium", zh: "Telegram 高级版" },
] as const

const POPULAR_TITLES: Record<"number" | "username" | "gift", [string, string]> = {
  number: ["Popular Numbers", "热门号码"],
  username: ["Popular Usernames", "热门用户名"],
  gift: ["Popular Gifts", "热门礼物"],
}

function getGiftSeries(title: string): string {
  return title.replace(/\s*#\d+\s*$/, "").trim() || title
}

export function HomePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const walletAddress = useTonAddress()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<ProductType | null>("number")
  const [priceDescending, setPriceDescending] = useState(true)
  const [selectedGiftSeries, setSelectedGiftSeries] = useState<string | null>(null)
  const [giftSeriesQuery, setGiftSeriesQuery] = useState("")

  const loadProducts = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const result = await getListedProducts()
      if (isActive()) setProducts(result)
    } catch (err) {
      if (isActive()) {
        setError(
          err instanceof Error
            ? err.message
            : t("Failed to load products. Please try again.", "读取商品失败，请稍后重试。")
        )
      }
    } finally {
      if (isActive()) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadProducts(() => !cancelled)
    })
    return () => { cancelled = true }
  }, [loadProducts])

  const giftSeries = useMemo(() => {
    const names = products
      .filter((product) => product.type === "gift")
      .map((product) => getGiftSeries(product.title))
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }, [products])

  const visibleGiftSeries = useMemo(() => {
    const query = giftSeriesQuery.trim().toLowerCase()
    return giftSeries.filter((name) => !query || name.toLowerCase().includes(query))
  }, [giftSeries, giftSeriesQuery])

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const result = products.filter((product) => {
      if (selectedType && product.type !== selectedType) return false
      if (product.listingMode === "auction") return false
      if (selectedType === "gift" && selectedGiftSeries &&
        getGiftSeries(product.title) !== selectedGiftSeries) return false
      if (!query) return true
      return [product.title, product.subtitle, product.id]
        .some((field) => field.toLowerCase().includes(query))
    })
    return result.sort((a, b) =>
      priceDescending ? b.priceTon - a.priceTon : a.priceTon - b.priceTon
    )
  }, [products, searchQuery, selectedType, selectedGiftSeries, priceDescending])

  function selectCategory(type: ProductType) {
    setSelectedType(type)
    setSelectedGiftSeries(null)
  }

  const selectedTitle = selectedType
    ? t(...POPULAR_TITLES[selectedType])
    : t("Popular Listings", "热门商品")

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent px-6 py-10">
        <p className="text-sm text-zinc-400">
          {t("GRAM Digital Asset Marketplace · Phase 2", "GRAM 数字资产商城 · 阶段 2")}
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-medium tracking-tight text-white">
          {t(
            "Explore Usernames, Numbers, Gifts and Telegram Premium",
            "浏览匿名号码、用户名、收藏礼物与 Telegram 高级版"
          )}
        </h1>
        <p className="mt-4 max-w-xl text-zinc-400">
          {t(
            "Browse listed products from the database. Wallet payments will be added in a later phase.",
            "浏览数据库中的在售商品。钱包支付将在后续阶段接入。"
          )}
        </p>
        {walletAddress && (
          <div className="mt-8">
            <Link to="/publish" className="inline-flex rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10">
              {t("Publish Product", "发布商品")}
            </Link>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="relative">
          <label htmlFor="home-product-search" className="sr-only">{t("Search products", "搜索商品")}</label>
          <input
            id="home-product-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("Enter a username, number, gift or product ID...", "请输入用户名、匿名号码、收藏礼物或商品编号...")}
            className="w-full rounded-full border border-white/15 bg-white/[0.03] py-3 pr-20 pl-5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/40"
          />
          {searchQuery.length > 0 && (
            <button type="button" onClick={() => setSearchQuery("")} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              {t("Clear", "清除")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {HOME_CATEGORIES.map((category) => {
            const isPremium = category.type === "premium"
            const count = products.filter((item) => item.type === category.type).length
            const isSelected = selectedType === category.type

            if (isPremium) {
              return (
                <button key={category.type} type="button" onClick={() => navigate("/premium")} className="w-full min-w-0 rounded-2xl border border-white/20 bg-white/[0.06] p-5 text-left text-white transition hover:border-white/40 hover:bg-white/10">
                  <span className="font-medium">{t(category.en, category.zh)}</span>
                </button>
              )
            }

            return (
              <button
                key={category.type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectCategory(category.type)}
                className={`rounded-2xl border border-white/20 bg-white/[0.06] p-5 text-left text-white transition hover:border-white/40 ${isSelected ? "border-white/50 bg-white/10" : ""}`}
              >
                <span className="font-medium">{t(category.en, category.zh)}</span>
                <span className="mt-2 block text-xs text-zinc-500">
                  {loading ? t("Loading…", "加载中…") : t(`${count} listed`, `${count} 件在售`)}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">{selectedTitle}</h2>
          {selectedType && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPriceDescending((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                aria-label={t("Toggle price ranking order", "切换价格排行顺序")}
              >
                {t("Price Ranking", "价格排行")}
                <span className="text-sky-300">{priceDescending ? "↓" : "↑"}</span>
              </button>
            </div>
          )}
        </div>

        {loading && <p className="text-sm text-zinc-400">{t("Loading products…", "正在加载商品…")}</p>}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 p-5">
            <p className="text-sm text-red-300">{error}</p>
            <button type="button" onClick={() => { setLoading(true); setError(""); void loadProducts() }} className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white">
              {t("Retry", "重试")}
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className={selectedType === "gift" ? "grid min-w-0 max-w-full gap-5 lg:grid-cols-[230px_minmax(0,1fr)]" : "block"}>
            {selectedType === "gift" && (
              <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">{t("Gift Collections", "礼物系列")}</h3>
                <input
                  type="search"
                  value={giftSeriesQuery}
                  onChange={(event) => setGiftSeriesQuery(event.target.value)}
                  placeholder={t("Search collections", "搜索系列")}
                  className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-white/25"
                />
                <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
                  <button type="button" onClick={() => setSelectedGiftSeries(null)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${selectedGiftSeries === null ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
                    <span>{t("All collections", "全部系列")}</span>
                    <span className="text-xs text-zinc-500">{products.filter((p) => p.type === "gift").length}</span>
                  </button>
                  {visibleGiftSeries.map((series) => {
                    const count = products.filter((p) => p.type === "gift" && getGiftSeries(p.title) === series).length
                    return (
                      <button key={series} type="button" onClick={() => setSelectedGiftSeries(series)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${selectedGiftSeries === series ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
                        <span className="truncate pr-2">{series}</span>
                        <span className="shrink-0 text-xs text-zinc-500">{count}</span>
                      </button>
                    )
                  })}
                  {visibleGiftSeries.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">{t("No collections found", "没有找到系列")}</p>}
                </div>
              </aside>
            )}

            <div className="w-full min-w-0 max-w-full overflow-hidden">
              {visibleProducts.length === 0 ? (
                <p className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-400">
                  {t("No matching products. Try another keyword or collection.", "没有找到匹配商品，请更换关键词或系列。")}
                </p>
              ) : (
                selectedType === "username" || selectedType === "number" ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/[0.06]">
                    <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                      <thead className="bg-[#283440] text-xs font-semibold tracking-wide text-[#91a8c0]">
                        <tr>
                          <th className="px-5 py-3">{selectedType === "username" ? t("Username", "用户名") : t("Number", "号码")}</th>
                          <th className="px-5 py-4">{t("Value", "价格")}</th>
                          <th className="px-5 py-4">{t("Status", "状态")}</th>
                          <th className="w-12 px-4 py-4" aria-label={t("Details", "详情")} />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {visibleProducts.map((product) => {
                          const rawName = product.title.replace(/^@/, "").replace(/^\+/, "")
                          return (
                            <tr key={product.id} className="cursor-pointer bg-white/[0.06] transition hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
                              role="link"
                              tabIndex={0}
                              aria-label={t("View product details", "查看商品详情") + ": " + product.title}
                              onClick={(event) => {
                                if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return
                                navigate("/product/" + product.id)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault()
                                  navigate("/product/" + product.id)
                                }
                              }}>
                              <td className="px-5 py-3">
                                <Link to={"/product/" + product.id} className="group inline-flex flex-col items-start">
                                  <span className="text-[15px] font-bold text-white transition group-hover:text-sky-300">
                                    {product.type === "username" ? "@" + rawName : formatTelegramNumber("+" + rawName)}
                                  </span>
                                  {product.type === "username" && (
                                    <span className="mt-0.5 text-xs font-medium text-[#38a9ff] transition group-hover:text-[#70c2ff]">
                                      {rawName}.t.me
                                    </span>
                                  )}
                                </Link>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1.5 font-bold tabular-nums text-white">
                                  <GramTokenMark className="h-4 w-4" />
                                  <span>{product.priceTon.toLocaleString()}</span>
                                </div>
                                <p className="mt-0.5 text-xs text-[#9aabba]">{t("Sale price", "出售价格")}</p>
                              </td>
                              <td className="px-5 py-3">
                                <span className="text-sm font-semibold text-[#20e68a]">
                                  {t("For sale", "出售中")}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link
                                  to={"/product/" + product.id}
                                  aria-label={t("View product details", "查看商品详情")}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-[#718293] transition hover:bg-white/10 hover:text-white"
                                >
                                  ›
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {visibleProducts.map((product) => <div key={product.id} className="min-w-0 max-w-full"><ProductCard product={product} compact /></div>)}
                    {Array.from({ length: visibleProducts.length === 0 ? 5 : (5 - (visibleProducts.length % 5)) % 5 }, (_, index) => (
                      <div
                        key={`gift-slot-${index}`}
                        aria-hidden="true"
                        className="aspect-[4/5] min-w-0 max-w-full rounded-2xl border border-dashed border-white/10 bg-white/[0.025]"
                      />
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
