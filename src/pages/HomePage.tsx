import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTonAddress } from "@tonconnect/ui-react"
import { ProductCard } from "../components/ProductCard"
import { getListedProducts } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import { filterProducts } from "../lib/catalog"
import type { Product, ProductType } from "../types/product"

const HOME_CATEGORIES = [
  { type: "number", en: "Numbers", zh: "匿名号码" },
  { type: "username", en: "Usernames", zh: "用户名" },
  { type: "gift", en: "Gifts", zh: "收藏礼物" },
  { type: "premium", en: "Telegram Premium", zh: "Telegram 高级版" },
] as const

export function HomePage() {
  const { t } = useLanguage()
  const walletAddress = useTonAddress()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<ProductType | null>(null)

  const loadProducts = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const result = await getListedProducts()
      if (isActive()) {
        setProducts(result)
      }
    } catch (err) {
      if (isActive()) {
        setError(
          err instanceof Error
            ? err.message
            : t("Failed to load products. Please try again.", "读取商品失败，请稍后重试。")
        )
      }
    } finally {
      if (isActive()) {
        setLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadProducts(() => !cancelled)
      }
    })

    return () => {
      cancelled = true
    }
  }, [loadProducts])

  const visibleProducts = useMemo(
    () => filterProducts(products, searchQuery, selectedType),
    [products, searchQuery, selectedType]
  )

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent px-6 py-10">
        <p className="text-sm text-zinc-400">
          {t("TON Digital Asset Marketplace · Phase 2", "TON 数字资产商城 · 阶段 2")}
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
            <Link
              to="/publish"
              className="inline-flex rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {t("Publish Product", "发布商品")}
            </Link>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="relative">
          <label htmlFor="home-product-search" className="sr-only">
            {t("Search products", "搜索商品")}
          </label>
          <input
            id="home-product-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t(
              "Enter a username, number, gift or product ID...",
              "请输入用户名、匿名号码、收藏礼物或商品编号..."
            )}
            className="w-full rounded-full border border-white/15 bg-white/[0.03] py-3 pr-20 pl-5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/40"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
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
                <Link
                  key={category.type}
                  to="/premium"
                  className="rounded-2xl border border-white/20 bg-white/[0.06] p-5 text-white transition hover:border-white/40"
                >
                  <span className="font-medium">{t(category.en, category.zh)}</span>
                </Link>
              )
            }

            return (
              <button
                key={category.type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedType(isSelected ? null : category.type)}
                className={`rounded-2xl border border-white/20 bg-white/[0.06] p-5 text-left text-white transition hover:border-white/40 ${
                  isSelected ? "border-white/40" : ""
                }`}
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-white">
            {selectedType
              ? t(
                  HOME_CATEGORIES.find((category) => category.type === selectedType)?.en ?? "Listed Products",
                  HOME_CATEGORIES.find((category) => category.type === selectedType)?.zh ?? "在售商品"
                )
              : t("Listed Products", "在售商品")}
          </h2>
          {(selectedType || searchQuery) && (
            <button
              type="button"
              onClick={() => { setSelectedType(null); setSearchQuery("") }}
              className="text-sm text-zinc-400 hover:text-white"
            >
              {t("Clear filters", "清除筛选")}
            </button>
          )}
        </div>

        {loading && (
          <p className="text-sm text-zinc-400">
            {t("Loading products…", "正在加载商品…")}
          </p>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 p-5">
            <p className="text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); setError(""); void loadProducts() }}
              className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white"
            >
              {t("Retry", "重试")}
            </button>
          </div>
        )}

        {!loading && !error && visibleProducts.length === 0 && (
          <p className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-400">
            {t("No matching products. Try another keyword or category.", "没有找到匹配商品，请更换关键词或分类。")}
          </p>
        )}

        {!loading && !error && visibleProducts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibleProducts.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
