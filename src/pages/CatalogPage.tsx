
import { useEffect, useMemo, useState, type ChangeEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ProductCard } from "../components/ProductCard"
import { getListedProducts } from "../services/products"
import {
  SORT_LABELS,
  SORT_OPTIONS,
  applyCatalogView,
  isCatalogSort,
  isProductType,
  type CatalogSort,
} from "../lib/catalog"
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "../types/product"
import type { Product } from "../types/product"

const chipClass = (active: boolean) =>
  [
    "rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
    active
      ? "bg-white text-black"
      : "border border-white/15 text-zinc-300 hover:border-white/30",
  ].join(" ")

export function CatalogPage() {
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
          : "读取商品失败，请稍后重试。",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [])

  const visibleProducts = useMemo(
    () => applyCatalogView(products, query, typeFilter, sort),
    [products, query, typeFilter, sort],
  )

  const hasActiveFilters = query.trim().length > 0 || typeFilter !== null

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
        <h1 className="text-3xl font-medium text-white">全部商品</h1>
        <p className="mt-2 text-sm text-zinc-400">
          价格为固定售价。可按名称、用户名、号码、描述或编号搜索。
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="catalog-search" className="sr-only">
            搜索商品
          </label>
          <input
            id="catalog-search"
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="搜索名称、用户名、号码、描述或编号"
            className="w-full rounded-full border border-white/15 bg-white/[0.03] py-2.5 pr-20 pl-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/40"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => updateParams({ q: "" })}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              清除
            </button>
          )}
        </div>

        <label className="sr-only" htmlFor="catalog-sort">
          排序
        </label>
        <select
          id="catalog-sort"
          value={sort}
          onChange={handleSortChange}
          className="w-full shrink-0 rounded-full border border-white/15 bg-[#0b0d12] px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-white/40 lg:w-48"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max min-w-full flex-wrap gap-2 sm:w-full">
          <button
            type="button"
            onClick={() => updateParams({ type: null })}
            className={chipClass(typeFilter === null)}
          >
            全部商品
          </button>
          {PRODUCT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => updateParams({ type })}
              className={chipClass(typeFilter === type)}
            >
              {PRODUCT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">正在加载在售商品…</p>
      ) : error ? (
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
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            共 {visibleProducts.length} 件匹配商品
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
                {products.length === 0 ? "暂无在售商品" : "没有符合条件的商品"}
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {products.length === 0
                  ? "数据库中暂时没有在售商品，请稍后再来查看。"
                  : "可以换一个关键词，或清除当前筛选后再看全部商品。"}
              </p>
              {hasActiveFilters && (
                <Link
                  to="/catalog"
                  className="mt-6 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
                >
                  清除筛选
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}