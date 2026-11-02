import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTonAddress } from "@tonconnect/ui-react"
import { ProductCard } from "../components/ProductCard"
import { getListedProducts } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import type { Product } from "../types/product"

const HOME_CATEGORIES = [
  { type: "username", en: "Usernames", zh: "用户名" },
  { type: "number", en: "Numbers", zh: "匿名号码" },
  { type: "gift", en: "Gifts", zh: "收藏礼物" },
  { type: "premium", en: "Telegram Premium", zh: "Telegram 高级版" },
] as const

export function HomePage() {
  const { t } = useLanguage()
  const walletAddress = useTonAddress()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent px-6 py-10">
        <p className="text-sm text-zinc-400">
          {t("TON Digital Asset Marketplace · Phase 2", "TON 数字资产商城 · 阶段 2")}
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-medium tracking-tight text-white">
          {t(
            "Explore Usernames, Numbers, Gifts and Telegram Premium",
            "浏览用户名、匿名号码、收藏礼物与 Telegram 高级版"
          )}
        </h1>
        <p className="mt-4 max-w-xl text-zinc-400">
          {t(
            "Browse listed products from the database. Wallet payments will be added in a later phase.",
            "浏览数据库中的在售商品。钱包支付将在后续阶段接入。"
          )}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {walletAddress && (
            <Link
              to="/publish"
              className="inline-flex rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {t("Publish Product", "发布商品")}
            </Link>
          )}
          <Link
            to="/catalog"
            className="inline-flex rounded-full bg-white px-5 py-2 text-sm font-medium text-black"
          >
            {t("View All Products", "查看全部商品")}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {HOME_CATEGORIES.map((category) => {
          const isPremium = category.type === "premium"
          const count = products.filter(
            (item) => item.type === category.type
          ).length
          const destination = isPremium
            ? "/premium"
            : `/catalog?type=${category.type}`

          return (
            <Link
              key={category.type}
              to={destination}
              className={`rounded-2xl border p-5 transition ${
                isPremium
                  ? "border-white/20 bg-white/[0.06] text-white hover:border-white/40"
                  : "border-white/10 text-zinc-300 hover:border-white/25"
              }`}
            >
              <span className="font-medium">{t(category.en, category.zh)}</span>
              {!isPremium && (
                <span className="mt-2 block text-xs text-zinc-500">
                  {loading
                    ? t("Loading…", "加载中…")
                    : t(`${count} listed`, `${count} 件在售`)}
                </span>
              )}
            </Link>
          )
        })}
      </section>


      <section>
        <h2 className="mb-4 text-lg font-medium text-white">
          {t("Listed Products", "在售商品")}
        </h2>

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

        {!loading && !error && products.length === 0 && (
          <p className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-400">
            {t(
              "No products listed yet. Please check back later.",
              "暂无在售商品。请稍后再来查看。"
            )}
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}



