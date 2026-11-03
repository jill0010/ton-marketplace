import { useEffect, useMemo, useState } from "react"
import { Address, beginCell } from "@ton/core"
import { Link, useParams } from "react-router-dom"
import { TonConnectButton, useTonConnectUI } from "@tonconnect/ui-react"
import { getListedProductById } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import { useVerifiedTonWallet } from "../hooks/useVerifiedTonWallet"
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_LABELS_ZH,
} from "../types/product"
import type { Product } from "../types/product"

const PROCESSING_RESERVE_NANO = 500_000_000n
const MARKETPLACE_V2_ADDRESS = import.meta.env.VITE_MARKETPLACE_V2_ADDRESS ?? ""

function toFriendlyAddress(value: string): string | null {
  try {
    return Address.parse(value).toString({
      urlSafe: true,
      bounceable: true,
      testOnly: false,
    })
  } catch {
    return null
  }
}

function toRawAddress(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return Address.parse(value).toRawString()
  } catch {
    return null
  }
}

function formatTonNano(value: bigint): string {
  const whole = value / 1_000_000_000n
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0")
  return fraction.replace(/0+$/, "") ? `${whole}.${fraction.replace(/0+$/, "")}` : whole.toString()
}

export function ProductPage() {
  const { language, t } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()
  const {
    walletAddress,
    connecting,
    verifying,
    isWalletVerified,
    connectAndVerifyWallet,
  } = useVerifiedTonWallet()
  const { id } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false)
  const [purchaseMessage, setPurchaseMessage] = useState("")
  const [purchaseError, setPurchaseError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadProduct() {
      setLoading(true)
      setError("")

      try {
        if (!id) {
          setProduct(null)
          return
        }

        const result = await getListedProductById(id)

        if (!cancelled) {
          setProduct(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t("Failed to load product details.", "读取商品详情失败，请稍后重试。")
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProduct()

    return () => {
      cancelled = true
    }
  }, [id, t])

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 p-6 text-sm text-zinc-400">
        {t("Loading product details…", "正在加载商品详情…")}
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-3xl border border-white/10 p-6">
        <h1 className="text-2xl text-white">
          {t("Failed to load product", "读取商品失败")}
        </h1>
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
        >
          {t("Reload", "重新加载")}
        </button>
        <Link to="/catalog" className="block text-sm text-zinc-400 underline">
          {t("Back to Products", "返回商品列表")}
        </Link>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl text-white">
          {t("Product Not Found", "未找到商品")}
        </h1>
        <p className="text-sm text-zinc-400">
          {t(
            "This product may not exist, may have been delisted, or may no longer be available.",
            "商品可能不存在、已下架，或不再出售。"
          )}
        </p>
        <Link to="/catalog" className="text-sm text-zinc-400 underline">
          {t("Back to Products", "返回商品列表")}
        </Link>
      </div>
    )
  }

  const marketplaceAddress = useMemo(
    () => toFriendlyAddress(MARKETPLACE_V2_ADDRESS),
    [],
  )
  const configuredMarketplaceRaw = useMemo(
    () => toRawAddress(MARKETPLACE_V2_ADDRESS),
    [],
  )
  const listedMarketplaceRaw = toRawAddress(product.chainMarketplaceAddress)
  const chainProductId = product.chainProductId
  const canBuyOnChain = Boolean(
    product.chainStatus === "escrowed" &&
    product.chainEscrowId &&
    chainProductId &&
    marketplaceAddress &&
    configuredMarketplaceRaw &&
    listedMarketplaceRaw === configuredMarketplaceRaw
  )
  const totalDueNano = BigInt(product.priceNano) + PROCESSING_RESERVE_NANO

  async function buyWithTon() {
    setPurchaseError("")
    setPurchaseMessage("")

    if (!isWalletVerified || !walletAddress) {
      try {
        await connectAndVerifyWallet()
      } catch (err) {
        setPurchaseError(
          err instanceof Error ? err.message : t("Wallet verification failed.", "钱包验证失败。"),
        )
      }
      return
    }

    if (!canBuyOnChain || !marketplaceAddress || !chainProductId) {
      setPurchaseError(
        t("This item is not confirmed in Marketplace escrow.", "该商品尚未确认托管在商城合约中。"),
      )
      return
    }

    try {
      const productId = BigInt(chainProductId)
      if (productId <= 0n || productId > 18_446_744_073_709_551_615n) {
        throw new Error("Invalid on-chain product ID")
      }

      const payload = beginCell()
        .storeUint(0x71b00100, 32)
        .storeUint(productId, 64)
        .endCell()
        .toBoc()
        .toString("base64")

      setPurchaseSubmitting(true)
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: marketplaceAddress,
          amount: totalDueNano.toString(),
          payload,
        }],
      })

      setPurchaseMessage(
        t(
          "Wallet transaction submitted. The order is not complete until the Marketplace contract confirms NFT delivery and settlement on-chain.",
          "钱包交易请求已提交。只有商城合约在链上确认 NFT 交付及结算后，订单才算完成。",
        ),
      )
    } catch (err) {
      setPurchaseError(
        err instanceof Error ? err.message : t("Purchase transaction was not submitted.", "购买交易未能提交。"),
      )
    } finally {
      setPurchaseSubmitting(false)
    }
  }

  const typeLabel =
    language === "en"
      ? PRODUCT_TYPE_LABELS[product.type]
      : PRODUCT_TYPE_LABELS_ZH[product.type]

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-3xl border border-white/10 p-6">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        {typeLabel}
      </p>

      {product.imageUrl && (
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <img
            src={product.imageUrl}
            alt={product.title}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
        </div>
      )}

      {product.type === "username" && (
        <p className="text-base font-medium tracking-wide text-zinc-300">
          username
        </p>
      )}

      <h1 className="text-4xl font-medium text-white">{product.title}</h1>

      <p className="text-zinc-400">{product.subtitle}</p>

      <p className="text-3xl font-semibold text-emerald-300">
        {product.priceTon} TON
      </p>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{t("Listing price", "商品价格")}</span>
          <span className="text-white">{product.priceTon} TON</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{t("Processing reserve", "交易处理储备金")}</span>
          <span className="text-white">0.5 TON</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm font-semibold">
          <span className="text-zinc-300">{t("Total wallet amount", "钱包实际支付总额")}</span>
          <span className="text-emerald-300">{formatTonNano(totalDueNano)} TON</span>
        </div>
        <p className="text-xs text-zinc-500">
          {t(
            "The 97% seller / 3% platform split applies to the listing price. The separate 0.5 TON reserve funds escrow, callback and payout transaction costs.",
            "卖家 97% / 平台 3% 按商品价格计算；额外 0.5 TON 储备用于托管、回调及结算交易成本。",
          )}
        </p>
      </div>

      {!walletAddress && (
        <div className="flex justify-center">
          <TonConnectButton />
        </div>
      )}

      <button
        type="button"
        onClick={() => void buyWithTon()}
        disabled={purchaseSubmitting || connecting || verifying || (!canBuyOnChain && isWalletVerified)}
        className="w-full rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-zinc-400"
      >
        {purchaseSubmitting
          ? t("Submitting wallet transaction…", "正在提交钱包交易…")
          : !canBuyOnChain
          ? t("Not available for on-chain purchase", "暂不可链上购买")
          : isWalletVerified
          ? t("Buy with TON", "使用 TON 购买")
          : t("Verify wallet to buy", "验证钱包后购买")}
      </button>

      {purchaseError && <p className="text-sm text-red-300">{purchaseError}</p>}
      {purchaseMessage && <p className="text-sm text-emerald-300">{purchaseMessage}</p>}

      {!canBuyOnChain && (
        <p className="text-xs text-zinc-500">
          {t(
            "This listing is not yet confirmed in the on-chain escrow contract. Off-chain or admin-uploaded products cannot be purchased with TON.",
            "该商品尚未在链上托管合约中确认。仅后台上传或链下商品不能使用 TON 购买。",
          )}
        </p>
      )}

      <Link to="/catalog" className="inline-block text-sm text-zinc-400">
        {t("Back to Products", "返回商品列表")}
      </Link>
    </div>
  )
}


