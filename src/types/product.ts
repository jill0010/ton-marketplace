export const PRODUCT_TYPES = ["username", "number", "gift"] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]
export type ListingMode = "auction" | "sale"
export type ProductCurrency = "TON" | "GRAM"
export type DeliveryMode = "escrow" | "manual"

export type Product = {
  id: string
  type: ProductType
  title: string
  subtitle: string
  priceTon: number
  priceTonExact: string
  currency: ProductCurrency
  deliveryMode: DeliveryMode
  imageUrl?: string | null
  productMetadata?: Record<string, unknown>
  marketplaceContractAddress?: string | null
  marketplaceProductId?: string | null
  nftItemAddress?: string | null
  status: "listed"
  listingMode?: ListingMode
  auctionEndsAt?: string | null
  createdAt: string
}

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  username: "Usernames",
  number: "Numbers",
  gift: "Gifts",
}

export const PRODUCT_TYPE_LABELS_ZH: Record<ProductType, string> = {
  username: "收藏用户名",
  number: "+888 号码",
  gift: "收藏礼物",
}
