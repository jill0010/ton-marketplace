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
  chain_product_id: string | number | null
  chain_escrow_id: string | number | null
  chain_marketplace_address: string | null
  chain_escrow_address: string | null
  chain_status: Product["chainStatus"]
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

function tonToNano(value: string | number): string | null {
  const match = /^(\\d+)(?:\\.(\\d{1,9}))?$/.exec(String(value).trim())
  if (!match) return null
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? "").padEnd(9, "0") || "0")
  return (whole * 1_000_000_000n + fraction).toString()
}

function toProduct(item: DatabaseProduct): Product | null {
  const productType = toProductType(item.type)
  if (!productType || item.currency !== "TON") {
    return null
  }

  const priceTon = Number(item.price)
  const priceNano = tonToNano(item.price)
  if (!Number.isFinite(priceTon) || priceTon < 0 || priceNano === null) {
    return null
  }

  return {
    id: item.id,
    type: productType,
    title: item.name,
    subtitle: item.description ?? "",
    priceTon,
    priceNano,
    chainProductId: item.chain_product_id === null ? null : String(item.chain_product_id),
    chainEscrowId: item.chain_escrow_id === null ? null : String(item.chain_escrow_id),
    chainMarketplaceAddress: item.chain_marketplace_address,
    chainEscrowAddress: item.chain_escrow_address,
    chainStatus: item.chain_status ?? "offchain",
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
      "id, name, type, description, price, currency, image_url, status, created_at, chain_product_id, chain_escrow_id, chain_marketplace_address, chain_escrow_address, chain_status"
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
