
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ProductCard } from "../components/ProductCard"
import { getListedProducts } from "../services/products"
import type { Product } from "../types/product"
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "../types/product"

export function HomePage() {
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
        err instanceof Error ? err.message : "读取商品失败，请稍后重试。"
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
        <p className="text-sm text-zinc-400">TON 数字资产商城 · 阶段 2</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-medium tracking-tight text-white">
          浏览收藏用户名、+888 号码、NFT 与礼物
        </h1>
        <p className="mt-4 max-w-xl text-zinc-400">
          浏览数据库中的在售商品。钱包支付将在后续阶段接入。
        </p>
        <Link
          to="/catalog"
          className="mt-8 inline-flex rounded-full bg-white px-5 py-2 text-sm font-medium text-black"
        >
          查看全部商品
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCT_TYPES.map((type) => {
          const count = products.filter((item) => item.type === type).length

          return (
            <Link
              key={type}
              to={`/catalog?type=${type}`}
              className="rounded-2xl border border-white/10 px-4 py-5 text-sm text-zinc-300 hover:border-white/25"
            >
              {PRODUCT_TYPE_LABELS[type]}
              <span className="mt-2 block text-xs text-zinc-500">
                {loading ? "加载中…" : `${count} 件在售`}
              </span>
            </Link>
          )
        })}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium text-white">在售商品</h2>

        {loading && (
          <p className="text-sm text-zinc-400">正在加载商品…</p>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 p-5">
            <p className="text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-400">
            暂无在售商品。请稍后再来查看。
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
