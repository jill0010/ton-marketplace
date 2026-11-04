import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getListedProductById } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import { GramTokenMark } from "../components/GramTokenMark"
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

  const metadata = product.productMetadata ?? {}
  const animatedUrl = typeof metadata.animated_url === "string" ? metadata.animated_url : null
  const telegramUrl = typeof metadata.telegram_url === "string" ? metadata.telegram_url : null
  const rawAttributes = metadata.attributes
  const attributes = rawAttributes && typeof rawAttributes === "object" && !Array.isArray(rawAttributes)
    ? Object.entries(rawAttributes as Record<string, unknown>).filter(([, value]) => typeof value === "string" && value.trim())
    : []
  const attributeLabels: Record<string, [string, string]> = {
    model: ["Model", "型号"],
    backdrop: ["Backdrop", "背景"],
    symbol: ["Symbol", "符号"],
    quantity: ["Quantity", "数量"],
    number: ["Number", "编号"],
  }

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

      {animatedUrl && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <video src={animatedUrl} controls playsInline preload="metadata" className="max-h-[520px] w-full object-contain" />
        </div>
      )}

      {attributes.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">{t("Collectible attributes", "收藏品属性")}</h2>
          <dl className="grid grid-cols-2 gap-3">
            {attributes.map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs text-zinc-500">{attributeLabels[key]?.[language === "en" ? 0 : 1] ?? key}</dt>
                <dd className="mt-1 break-words text-sm text-zinc-200">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {telegramUrl && (
        <a href={telegramUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-sky-300 underline">
          {t("View original Telegram gift page", "查看 Telegram 原始礼物页面")}
        </a>
      )}

      {product.type === "username" && (
        <p className="text-base font-medium tracking-wide text-zinc-300">
          username
        </p>
      )}

      <h1 className="text-4xl font-medium text-white">{product.title}</h1>

      <p className="text-zinc-400">{product.subtitle}</p>

      {product.deliveryMode === "manual" && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
          {t("Manual delivery: the marketplace administrator coordinates the transfer after payment is enabled and confirmed.", "人工交付：付款功能开放并确认收款后，由商城管理员协调转移 NFT。")}
        </div>
      )}

      <p className="flex items-center gap-2 text-3xl font-semibold text-emerald-300">
        {product.currency === "GRAM" && <GramTokenMark className="h-7 w-7" />}
        {product.priceTon} {product.currency}
      </p>

      <button
        type="button"
        disabled
        className="w-full rounded-full bg-white/20 px-4 py-3 text-sm text-zinc-400"
      >
        {t("Claim (Coming Soon)", "认领（即将开放）")}
      </button>

      <p className="text-xs text-zinc-500">
        {t(
          "Claiming and payment are not enabled yet. No funds will be requested and no asset transfer will be initiated.",
          "当前版本尚未开放认领和付款，不会请求付款，也不会发起资产转移。"
        )}
      </p>

      <Link to="/catalog" className="inline-block text-sm text-zinc-400">
        {t("Back to Products", "返回商品列表")}
      </Link>
    </div>
  )
}


