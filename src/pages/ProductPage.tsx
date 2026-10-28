import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getListedProductById } from "../services/products"
import { PRODUCT_TYPE_LABELS } from "../types/product"
import type { Product } from "../types/product"

export function ProductPage() {
  const { id } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadProduct() {
      setLoading(true)
      setError("")

      try {
        if (!id) {
          setProduct(null)
          return
        }

        const result = await getListedProductById(id)

        if (!cancelled) {
          setProduct(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "读取商品详情失败，请稍后重试。",
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProduct()

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 p-6 text-sm text-zinc-400">
        正在加载商品详情…
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-3xl border border-white/10 p-6">
        <h1 className="text-2xl text-white">读取商品失败</h1>
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
        >
          重新加载
        </button>
        <Link to="/catalog" className="block text-sm text-zinc-400 underline">
          返回商品列表
        </Link>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl text-white">未找到商品</h1>
        <p className="text-sm text-zinc-400">
          商品可能不存在、已下架，或不再出售。
        </p>
        <Link to="/catalog" className="text-sm text-zinc-400 underline">
          返回商品列表
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-3xl border border-white/10 p-6">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        {PRODUCT_TYPE_LABELS[product.type]}
      </p>

      {product.imageUrl && (
        <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <img
            src={product.imageUrl}
            alt={product.title}
            className="block max-h-[480px] w-full object-contain"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
        </div>
      )}

      <h1 className="text-4xl font-medium text-white">{product.title}</h1>

      <p className="text-zinc-400">{product.subtitle}</p>

      <p className="text-3xl font-semibold text-emerald-300">
        {product.priceTon} TON
      </p>

      <button
        type="button"
        disabled
        className="w-full rounded-full bg-white/20 px-4 py-3 text-sm text-zinc-400"
      >
        购买（暂未启用付款）
      </button>

      <p className="text-xs text-zinc-500">
        当前版本仅展示商品信息，不会发起支付或资产转移。
      </p>

      <Link to="/catalog" className="inline-block text-sm text-zinc-400">
        返回商品列表
      </Link>
    </div>
  )
}