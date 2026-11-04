import { useState } from "react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_LABELS_ZH, type Product } from "../types/product"

type ProductCardProps = { product: Product; compact?: boolean }

function GramTokenMark() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className="h-5 w-5 shrink-0">
      <rect width="28" height="28" rx="8" fill="#1688F8" />
      <path d="M7 14 14 6.5 21 14 14 21.5 7 14Z" fill="white" />
      <path d="m20.5 4 .85 2.15L23.5 7l-2.15.85L20.5 10l-.85-2.15L17.5 7l2.15-.85L20.5 4Z" fill="white" />
    </svg>
  )
}

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
        <p className={compact ? "mt-1 line-clamp-1 text-xs text-zinc-400" : "mt-1 line-clamp-2 text-sm text-zinc-400"}>{product.subtitle}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className={`flex items-center gap-2 ${compact ? "text-sm" : "text-lg"} font-semibold text-emerald-300`}><GramTokenMark /><span>{product.priceTon} GRAM</span></p>
          <Link to={`/product/${product.id}`} className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-400 active:scale-[0.98]">
            {t("Details", "详情")}
          </Link>
        </div>
      </div>
    </article>
  )
}
