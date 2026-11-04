import { useState } from "react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"
import { GramTokenMark } from "./GramTokenMark"
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_LABELS_ZH, type Product } from "../types/product"

type ProductCardProps = { product: Product; compact?: boolean }

const TYPE_ART: Record<Product["type"], string> = {
  username: "from-sky-500/40 to-indigo-950/80",
  number: "from-emerald-400/40 to-teal-950/80",
  gift: "from-amber-400/40 to-orange-950/80",
}

export function ProductCard({ product, compact = false }: ProductCardProps) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(product.imageUrl) && !imageFailed
  const typeLabel = language === "en" ? PRODUCT_TYPE_LABELS[product.type] : PRODUCT_TYPE_LABELS_ZH[product.type]

  return (
    <article className="block min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className={`relative aspect-square overflow-hidden bg-gradient-to-br ${TYPE_ART[product.type]}`}>
        {showImage && <img src={product.imageUrl!} alt={product.title} loading="lazy" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-contain" />}
      </div>
      <div className={compact ? "p-3" : "p-4"}>
        {!compact && <p className="text-xs tracking-wider text-zinc-500">{typeLabel}</p>}
        <h2 className={compact ? "truncate text-base font-semibold text-white" : "mt-1 truncate text-lg font-medium text-white"}>{product.title}</h2>
        {product.type !== "gift" && <p className={compact ? "mt-1 line-clamp-1 text-xs text-zinc-400" : "mt-1 line-clamp-2 text-sm text-zinc-400"}>{product.subtitle || (product.deliveryMode === "manual" ? t("Manual delivery by seller", "管理员人工交付") : "")}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className={`flex items-center gap-2 ${compact ? "text-sm" : "text-lg"} font-semibold text-emerald-300`}><GramTokenMark className="h-5 w-5" /><span>{product.priceTon}</span></p>
          <Link to={`/product/${product.id}`} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold tracking-wide transition active:scale-[0.98] ${product.type === "gift" ? "bg-[#25443d] text-[#42ef91] hover:bg-[#2d5148]" : "bg-sky-500 text-white shadow-lg shadow-sky-950/20 hover:bg-sky-400"}`}>
            {product.type === "gift" ? t("Sell", "出售") : t("Details", "详情")}
          </Link>
        </div>
      </div>
    </article>
  )
}
