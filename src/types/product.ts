
export const PRODUCT_TYPES = [
  "username",
  "number",
  "nft",
  "gift",
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]

export type Product = {
  id: string
  type: ProductType
  title: string
  subtitle: string
  priceTon: number
  imageUrl?: string | null
  status: "listed"
  createdAt: string
}

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  username: "收藏用户名",
  number: "+888 号码",
  nft: "TON NFT",
  gift: "收藏礼物",
}
