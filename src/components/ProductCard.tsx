import { useState } from "react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/language"
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_LABELS_ZH,
  type Product,
} from "../types/product"

type ProductCardProps = {
  product: Product
  compact?: boolean
}

const TYPE_ART: Record<Product["type"], string> = {
  username: "from-sky-500/40 to-indigo-950/80",
  number: "from-emerald-400/40 to-teal-950/80",
  nft: "from-violet-400/40 to-fuchsia-950/80",
  gift: "from-amber-400/40 to-orange-950/80",
}

export function ProductCard({ product, compact = false }: ProductCardProps) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = Boolean(product.imageUrl) && !imageFailed
  const typeLabel =
    language === "en"
      ? PRODUCT_TYPE_LABELS[product.type]
      : PRODUCT_TYPE_LABELS_ZH[product.type]

  return (
    <Link
      to={`/product/${product.id}`}
      className="block min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div
        className={`relative aspect-square overflow-hidden bg-gradient-to-br ${TYPE_ART[product.type]}`}
      >
        {showImage && (
          <img
            src={product.imageUrl!}
            alt={product.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>

      <div className={compact ? "p-3" : "p-4"}>
        {!compact && (<p className="text-xs tracking-wider text-zinc-500">{typeLabel}</p>)}

        <h2 className={compact ? "truncate text-base font-semibold text-white" : "mt-1 truncate text-lg font-medium text-white"}>
          {product.title}
        </h2>

        <p className={compact ? "mt-1 line-clamp-1 text-xs text-zinc-400" : "mt-1 line-clamp-2 text-sm text-zinc-400"}>
          {product.subtitle}
        </p>

        <div className={compact ? "mt-2 flex items-center justify-between gap-2" : "mt-4 flex items-end justify-between gap-3"}>
          <p className={compact ? "text-sm font-semibold text-emerald-300" : "text-lg font-semibold text-emerald-300"}>
            {product.priceTon} TON
          </p>

          <span className={compact ? "text-xs text-zinc-400" : "text-sm text-zinc-400"}>
            {t("View Details", "查看详情")}
          </span>
        </div>
      </div>
    </Link>
  )
}


