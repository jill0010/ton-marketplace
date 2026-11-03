import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getListedProductById } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_LABELS_ZH,
} from "../types/product"
import type { Product } from "../types/product"

export function ProductPage() {
  const { language, t } = useLanguage()
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
              : t("Failed to load product details.", "读取商品详情失败，请稍后重试。")
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
  }, [id, t])

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 p-6 text-sm text-zinc-400">
        {t("Loading product details…", "正在加载商品详情…")}
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-3xl border border-white/10 p-6">
        <h1 className="text-2xl text-white">
          {t("Failed to load product", "读取商品失败")}
        </h1>
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
        >
          {t("Reload", "重新加载")}
        </button>
        <Link to="/catalog" className="block text-sm text-zinc-400 underline">
          {t("Back to Products", "返回商品列表")}
        </Link>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl text-white">
          {t("Product Not Found", "未找到商品")}
        </h1>
        <p className="text-sm text-zinc-400">
          {t(
            "This product may not exist, may have been delisted, or may no longer be available.",
            "商品可能不存在、已下架，或不再出售。"
          )}
        </p>
        <Link to="/catalog" className="text-sm text-zinc-400 underline">
          {t("Back to Products", "返回商品列表")}
        </Link>
      </div>
    )
  }

  const typeLabel =
    language === "en"
      ? PRODUCT_TYPE_LABELS[product.type]
      : PRODUCT_TYPE_LABELS_ZH[product.type]

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-3xl border border-white/10 p-6">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        {typeLabel}
      </p>

      {product.imageUrl && (
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <img
            src={product.imageUrl}
            alt={product.title}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
        </div>
      )}

      {product.type === "username" && (
        <p className="text-base font-medium tracking-wide text-zinc-300">
          username
        </p>
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
        {t("Purchase (Payments Not Enabled)", "购买（暂未启用付款）")}
      </button>

      <p className="text-xs text-zinc-500">
        {t(
          "This version displays product information only. No payment or asset transfer will be initiated.",
          "当前版本仅展示商品信息，不会发起支付或资产转移。"
        )}
      </p>

      <Link to="/catalog" className="inline-block text-sm text-zinc-400">
        {t("Back to Products", "返回商品列表")}
      </Link>
    </div>
  )
}


