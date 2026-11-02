
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
    type === "username" ||
    type === "number" ||
    type === "gift"
  ) {
    return type
  }

  return null
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
    const productType = toProductType(item.type)

    if (!productType || item.currency !== "TON") {
      return []
    }

    const priceTon = Number(item.price)

    if (!Number.isFinite(priceTon) || priceTon < 0) {
      return []
    }

    return [
      {
        id: item.id,
        type: productType,
        title: item.name,
        subtitle: item.description ?? "",
        priceTon,
        imageUrl: item.image_url,
        status: "listed" as const,
        createdAt: item.created_at,
      },
    ]
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

  if (!data) {
    return null
  }

  const item = data as DatabaseProduct
  const productType = toProductType(item.type)

  if (!productType || item.currency !== "TON") {
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
    createdAt: item.created_at,
  }
}
