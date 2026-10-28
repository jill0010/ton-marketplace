import {
  PRODUCT_TYPES,
  type Product,
  type ProductType,
} from "../types/product"

export const SORT_OPTIONS = [
  "default",
  "price-asc",
  "price-desc",
  "newest",
] as const

export type CatalogSort = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<CatalogSort, string> = {
  default: "默认排序",
  "price-asc": "价格从低到高",
  "price-desc": "价格从高到低",
  newest: "最新上架",
}

export function isProductType(value: string | null): value is ProductType {
  return PRODUCT_TYPES.includes(value as ProductType)
}

export function isCatalogSort(value: string | null): value is CatalogSort {
  return SORT_OPTIONS.includes(value as CatalogSort)
}

export function matchesSearch(product: Product, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  const fields = [product.title, product.subtitle, product.id]
  return fields.some((field) => field.toLowerCase().includes(normalized))
}

export function filterProducts(
  items: readonly Product[],
  query: string,
  type: ProductType | null,
): Product[] {
  return items.filter((item) => {
    if (type && item.type !== type) {
      return false
    }
    return matchesSearch(item, query)
  })
}

export function sortProducts(
  items: readonly Product[],
  sort: CatalogSort,
): Product[] {
  const next = [...items]

  if (sort === "price-asc") {
    next.sort((a, b) => a.priceTon - b.priceTon)
  } else if (sort === "price-desc") {
    next.sort((a, b) => b.priceTon - a.priceTon)
  } else if (sort === "newest") {
    next.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  return next
}

export function applyCatalogView(
  items: readonly Product[],
  query: string,
  type: ProductType | null,
  sort: CatalogSort,
): Product[] {
  return sortProducts(filterProducts(items, query, type), sort)
}
