import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ProductCard } from "../components/ProductCard"
import { getListedProducts } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import {
  SORT_OPTIONS,
  applyCatalogView,
  isCatalogSort,
  isProductType,
  type CatalogSort,
} from "../lib/catalog"
import type { Product, ProductType } from "../types/product"

const CATEGORIES: { type: ProductType | "premium"; en: string; zh: string }[] = [
  { type: "username", en: "Usernames", zh: "用户名" },
  { type: "number", en: "Numbers", zh: "匿名号码" },
  { type: "gift", en: "Gifts", zh: "收藏礼物" },
  { type: "premium", en: "Telegram Premium", zh: "Telegram 高级版" },
]

const SORT_LABELS_BI: Record<CatalogSort, { en: string; zh: string }> = {
  default: { en: "Default sorting", zh: "默认排序" },
  "price-asc": { en: "Price: Low to High", zh: "价格从低到高" },
  "price-desc": { en: "Price: High to Low", zh: "价格从高到低" },
  newest: { en: "Newest First", zh: "最新上架" },
}



export function CatalogPage() {
  const { language, t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const query = searchParams.get("q") ?? ""
  const selectedType = searchParams.get("type")
  const typeFilter = isProductType(selectedType) ? selectedType : null
  const selectedSort = searchParams.get("sort")
  const sort: CatalogSort = isCatalogSort(selectedSort)
    ? selectedSort
    : "default"

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

  const visibleProducts = useMemo(() => {
    const filtered = applyCatalogView(products, query, typeFilter, sort)

    if (selectedType === "premium") {
      return []
    }

    return filtered
  }, [products, query, typeFilter, sort, selectedType])

  const hasActiveFilters = query.trim().length > 0 || selectedType !== null

  function updateParams(next: {
    q?: string
    type?: string | null
    sort?: CatalogSort
  }) {
    const params = new URLSearchParams(searchParams)

    if (next.q !== undefined) {
      if (next.q.length > 0) {
        params.set("q", next.q)
      } else {
        params.delete("q")
      }
    }

    if (next.type !== undefined) {
      if (next.type) {
        params.set("type", next.type)
      } else {
        params.delete("type")
      }
    }

    if (next.sort !== undefined) {
      if (next.sort === "default") {
        params.delete("sort")
      } else {
        params.set("sort", next.sort)
      }
    }

    setSearchParams(params, { replace: true })
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    updateParams({ q: event.target.value })
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    updateParams({ sort: isCatalogSort(value) ? value : "default" })
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-3xl font-medium text-white">
          {t("All Products", "全部商品")}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {t(
            "Browse fixed-price listings. Search by name, username, number, description or ID.",
            "浏览固定售价商品，可按名称、用户名、号码、描述或编号搜索。"
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="catalog-search" className="sr-only">
            {t("Search products", "搜索商品")}
          </label>
          <input
            id="catalog-search"
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder={t(
              "Enter a username, numbers, gifts...",
              "请输入用户名、匿名号码、收藏礼物......"
            )}
            className="w-full rounded-full border border-white/15 bg-white/[0.03] py-2.5 pr-20 pl-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/40"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => updateParams({ q: "" })}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              {t("Clear", "清除")}
            </button>
          )}
        </div>

        <label className="sr-only" htmlFor="catalog-sort">
          {t("Sort", "排序")}
        </label>
        <div className="relative w-full shrink-0 lg:w-48">
<select
          id="catalog-sort"
          value={sort}
          onChange={handleSortChange}
          className="w-full shrink-0 appearance-none rounded-full border border-white/15 bg-[#0b0d12] py-2.5 pl-10 pr-10 text-center text-sm text-zinc-200 outline-none focus:border-white/40 lg:w-48"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS_BI[option][language === "zh" || language === "zh-TW" ? "zh" : "en"]}
            </option>
          ))}
        </select>
  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
</div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => updateParams({ type: null })}
          className={`min-w-0 rounded-xl border px-2 py-3 text-center text-sm font-medium transition ${
            selectedType === null
              ? "border-white/40 bg-white/10 text-white"
              : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/25 hover:bg-white/[0.05]"
          }`}
        >
          {t("All Products", "全部商品")}
        </button>

        {CATEGORIES.map((category) => (
          <button
            key={category.type}
            type="button"
            onClick={() => updateParams({ type: category.type })}
            className={`min-w-0 rounded-xl border px-2 py-3 text-center text-sm font-medium transition ${
              selectedType === category.type
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/25 hover:bg-white/[0.05]"
            }`}
          >
            {category[language === "zh" || language === "zh-TW" ? "zh" : "en"]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">
          {t("Loading listings…", "正在加载在售商品…")}
        </p>
      ) : error ? (
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
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            {t(
              `${visibleProducts.length} matching products`,
              `共 ${visibleProducts.length} 件匹配商品`
            )}
          </p>

          {visibleProducts.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 px-6 py-12 text-center">
              <p className="text-white">
                {selectedType === "premium"
                  ? t("No listings in this category yet", "该分类暂时没有在售商品")
                  : products.length === 0
                    ? t("No products listed yet", "暂无在售商品")
                    : t("No matching products", "没有符合条件的商品")}
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {selectedType === "premium"
                  ? t(
                      "Listings for this category have not been enabled in the current database integration yet.",
                      "当前数据库接入暂未支持此分类的商品发布。"
                    )
                  : products.length === 0
                    ? t(
                        "There are no active listings in the database yet.",
                        "数据库中暂时没有在售商品，请稍后再来查看。"
                      )
                    : t(
                        "Try another keyword or clear the current filters.",
                        "可以换一个关键词，或清除当前筛选后再看全部商品。"
                      )}
              </p>
              {hasActiveFilters && (
                <Link
                  to="/catalog"
                  className="mt-6 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
                >
                  {t("Clear Filters", "清除筛选")}
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}





