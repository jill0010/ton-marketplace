import { supabase } from "../lib/supabase"
import type { Product, ProductType } from "../types/product"

type DatabaseProduct = {
  id: string
  name: string
  type: string
  description: string | null
  price: number | string
  currency: string
  image_url: string | null
  status: string
  created_at: string
}

function toProductType(type: string): ProductType | null {
  if (type === "phone_number") {
    return "number"
  }

  if (
    type === "username" || type === "number" || type === "gift"
  ) {
    return type
  }

  return null
}

function toProduct(item: DatabaseProduct): Product | null {
  const productType = toProductType(item.type)
  if (!productType || (item.currency !== "GRAM" && item.currency !== "TON")) {
    return null
  }

  const priceTon = Number(item.price)
  if (!Number.isFinite(priceTon) || priceTon < 0) {
    return null
  }

  return {
    id: item.id,
    type: productType,
    title: item.name,
    subtitle: item.description ?? "",
    priceTon,
    imageUrl: item.image_url,
    status: "listed",
    // The current products table stores fixed-price listings only.
    // Auction mode will be populated when the auction contract/indexer is connected.
    listingMode: "sale",
    createdAt: item.created_at,
  }
}

export async function getListedProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, type, description, price, currency, image_url, status, created_at"
    )
    .eq("status", "listed")
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`读取商品失败：${error.message}`)
  }

  return (data as DatabaseProduct[]).flatMap((item) => {
    const product = toProduct(item)
    return product ? [product] : []
  })
}

export async function getListedProductById(
  id: string
): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, type, description, price, currency, image_url, status, created_at"
    )
    .eq("id", id)
    .eq("status", "listed")
    .maybeSingle()

  if (error) {
    throw new Error(`读取商品详情失败：${error.message}`)
  }

  return data ? toProduct(data as DatabaseProduct) : null
}
