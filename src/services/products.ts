import { supabase } from "../lib/supabase"
import type { DeliveryMode, Product, ProductCurrency, ProductType } from "../types/product"

type DatabaseProduct = {
  id: string
  name: string
  type: string
  description: string | null
  price: number | string
  currency: string
  image_url: string | null
  product_metadata?: Record<string, unknown> | null
  status: string
  delivery_mode: string
  created_at: string
}

function toProductType(type: string): ProductType | null {
  if (type === "phone_number") return "number"
  if (type === "username" || type === "number" || type === "gift") return type
  return null
}

function toProduct(item: DatabaseProduct): Product | null {
  const productType = toProductType(item.type)
  if (!productType || (item.currency !== "GRAM" && item.currency !== "TON")) return null
  if (item.delivery_mode !== "manual" && item.delivery_mode !== "escrow") return null

  const priceTon = Number(item.price)
  if (!Number.isFinite(priceTon) || priceTon < 0) return null

  return {
    id: item.id,
    type: productType,
    title: item.name,
    subtitle: item.description ?? "",
    priceTon,
    currency: item.currency as ProductCurrency,
    deliveryMode: item.delivery_mode as DeliveryMode,
    imageUrl: item.image_url,
    productMetadata: item.product_metadata ?? undefined,
    status: "listed",
    listingMode: "sale",
    createdAt: item.created_at,
  }
}

const PRODUCT_SELECT = "id, name, type, description, price, currency, image_url, product_metadata, status, delivery_mode, created_at"

export async function getListedProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "listed")
    .order("created_at", { ascending: false })

  if (error) throw new Error(`读取商品失败：${error.message}`)

  return (data as DatabaseProduct[]).flatMap((item) => {
    const product = toProduct(item)
    return product ? [product] : []
  })
}

export async function getListedProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .eq("status", "listed")
    .maybeSingle()

  if (error) throw new Error(`读取商品详情失败：${error.message}`)
  return data ? toProduct(data as DatabaseProduct) : null
}
