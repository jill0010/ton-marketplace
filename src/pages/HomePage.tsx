import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ProductCard } from "../components/ProductCard"
import { getListedProducts } from "../services/products"
import { useLanguage } from "../lib/language"
import type { Product } from "../types/product"

const HOME_CATEGORIES = [
  { type: "username", en: "Usernames", zh: "用户名" },
  { type: "number", en: "Numbers", zh: "匿名号码" },
  { type: "gift", en: "Gifts", zh: "收藏礼物" },
  { type: "premium", en: "Telegram Premium", zh: "Telegram 高级版" },
] as const

export function HomePage() {
  const { language, t } = useLanguage()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadProducts() {
    setLoading(true)
    setError("")

    try {
      const result = await getListedProducts()
      setProducts(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Failed to load products. Please try again.", "读取商品失败，请稍后重试。")
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [])

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
        <Link
          to="/catalog"
          className="mt-8 inline-flex rounded-full bg-white px-5 py-2 text-sm font-medium text-black"
        >
          {t("View All Products", "查看全部商品")}
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {HOME_CATEGORIES.map((category) => {
          const count = products.filter(
            (item) => item.type === category.type
          ).length

          return (
            <Link
              key={category.type}
              to={`/catalog?type=${category.type}`}
              className="rounded-2xl border border-white/10 px-4 py-5 text-sm text-zinc-300 hover:border-white/25"
            >
              {language === "en" ? category.en : category.zh}
              <span className="mt-2 block text-xs text-zinc-500">
                {loading
                  ? t("Loading…", "加载中…")
                  : t(`${count} listed`, `${count} 件在售`)}
              </span>
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
              onClick={() => void loadProducts()}
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



