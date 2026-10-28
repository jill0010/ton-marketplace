
import { useState } from "react"
import { Link } from "react-router-dom"
import { PRODUCT_TYPE_LABELS, type Product } from "../types/product"

type ProductCardProps = {
  product: Product
}

const TYPE_ART: Record<Product["type"], string> = {
  username: "from-sky-500/40 to-indigo-950/80",
  number: "from-emerald-400/40 to-teal-950/80",
  nft: "from-violet-400/40 to-fuchsia-950/80",
  gift: "from-amber-400/40 to-orange-950/80",
}

export function ProductCard({ product }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = Boolean(product.imageUrl) && !imageFailed
  
  return (
    <Link
      to={`/product/${product.id}`}
      className="block min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div
        className={`relative flex h-36 items-end overflow-hidden bg-gradient-to-br px-4 py-3 ${TYPE_ART[product.type]}`}
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

        <div className="absolute inset-0 bg-black/20" />

        <span className="relative z-10 truncate text-lg font-medium text-white drop-shadow">
          {product.title}
        </span>
      </div>

      <div className="p-5">
        <p className="text-xs tracking-wider text-zinc-500">
          {PRODUCT_TYPE_LABELS[product.type]}
        </p>

        <h2 className="mt-2 truncate text-xl font-medium text-white">
          {product.title}
        </h2>

        <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
          {product.subtitle}
        </p>

        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="text-lg font-semibold text-emerald-300">
            {product.priceTon} TON
          </p>

          <span className="text-sm text-zinc-400">查看详情</span>
        </div>
      </div>
    </Link>
  )
}
