import { useEffect, useState } from "react"
import { beginCell } from "@ton/core"
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react"
import { Link, useParams } from "react-router-dom"
import { getListedProductById } from "../services/products"
import { useLanguage } from "../lib/useLanguage"
import { formatTelegramNumber } from "../lib/formatTelegramNumber"
import { GramTokenMark } from "../components/GramTokenMark"
import { ensureAnonymousSession, supabase } from "../lib/supabase"
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_LABELS_ZH,
} from "../types/product"
import type { Product } from "../types/product"

type ManualCheckout = {
  orderId: string
  orderNo: string
  amount: string
  amountNano: string
  currency: string
  paymentAddress: string
  expiresAt: string
}

export function ProductPage() {
  const { language, t } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()
  const { id } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [checkout, setCheckout] = useState<ManualCheckout | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState("")
  const [paymentVerified, setPaymentVerified] = useState(false)

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

  useEffect(() => {
    setCheckout(null)
    setCheckoutMessage("")
    setPaymentVerified(false)
  }, [id])

  async function startManualCheckout() {
    if (!product || checkoutBusy || checkout) return
    if (!walletAddress) {
      setCheckoutMessage("请先连接 TON 主网钱包。")
      await tonConnectUI.openModal()
      return
    }
    if (tonConnectUI.wallet?.account.chain !== "-239") {
      setCheckoutMessage("请将钱包切换到 TON 主网后再购买。")
      return
    }

    setCheckoutBusy(true)
    setCheckoutMessage("正在创建订单……")
    try {
      await ensureAnonymousSession()
      const { data, error } = await supabase.functions.invoke("create-manual-product-order", {
        body: { product_id: product.id },
      })
      if (error) throw new Error(error.message || "创建订单失败")
      if (data?.success !== true || typeof data.orderId !== "string" ||
          typeof data.orderNo !== "string" || typeof data.amountNano !== "string" ||
          typeof data.paymentAddress !== "string" || typeof data.expiresAt !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "订单返回信息无效")
      }
      setCheckout({
        orderId: data.orderId,
        orderNo: data.orderNo,
        amount: String(data.amount),
        amountNano: data.amountNano,
        currency: String(data.currency),
        paymentAddress: data.paymentAddress,
        expiresAt: data.expiresAt,
      })
      setCheckoutMessage("订单已创建，请在有效期内完成付款。")
    } catch (cause) {
      setCheckoutMessage(cause instanceof Error ? cause.message : "创建订单失败。")
    } finally {
      setCheckoutBusy(false)
    }
  }

  async function verifyManualPayment(orderId: string) {
    if (checkoutBusy) return
    setCheckoutBusy(true)
    setCheckoutMessage("正在 TON 主网核实付款……")
    try {
      await ensureAnonymousSession()
      const { data, error } = await supabase.functions.invoke("verify-manual-product-payment", {
        body: { order_id: orderId },
      })
      if (error) throw new Error(error.message || "付款核实请求失败")
      if (data?.success === true && data?.paymentVerified === true) {
        setPaymentVerified(true)
        setCheckoutMessage("付款已在 TON 主网确认。订单已进入管理员人工交付队列。")
      } else {
        throw new Error(typeof data?.error === "string" ? data.error : "暂未找到对应的链上付款，请稍后重试。")
      }
    } catch (cause) {
      setCheckoutMessage(cause instanceof Error ? cause.message : "付款核实失败。")
    } finally {
      setCheckoutBusy(false)
    }
  }

  async function payManualOrder() {
    if (!checkout || checkoutBusy || paymentVerified) return
    const wallet = tonConnectUI.wallet
    if (!wallet || wallet.account.chain !== "-239") {
      setCheckoutMessage("请先连接 TON 主网钱包。")
      return
    }
    setCheckoutBusy(true)
    setCheckoutMessage("请在钱包中确认付款……")
    try {
      const payload = beginCell().storeUint(0, 32).storeStringTail(checkout.orderNo).endCell().toBoc().toString("base64")
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(new Date(checkout.expiresAt).getTime() / 1000),
        network: "-239",
        from: wallet.account.address,
        messages: [{
          address: checkout.paymentAddress,
          amount: checkout.amountNano,
          payload,
        }],
      })
      setCheckoutMessage("钱包已提交付款，正在等待链上确认……")
      await new Promise((resolve) => window.setTimeout(resolve, 2500))
      setCheckoutBusy(false)
      await verifyManualPayment(checkout.orderId)
    } catch (cause) {
      setCheckoutMessage(cause instanceof Error ? cause.message : "无法提交付款。")
      setCheckoutBusy(false)
    }
  }

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

  const typeLabel =
    language === "en"
      ? PRODUCT_TYPE_LABELS[product.type]
      : PRODUCT_TYPE_LABELS_ZH[product.type]

  const metadata = product.productMetadata ?? {}
  const animatedUrl = typeof metadata.animated_url === "string" ? metadata.animated_url : null
  const telegramUrl = typeof metadata.telegram_url === "string" ? metadata.telegram_url : null
  const rawAttributes = metadata.attributes
  const attributes = rawAttributes && typeof rawAttributes === "object" && !Array.isArray(rawAttributes)
    ? Object.entries(rawAttributes as Record<string, unknown>).filter(([, value]) => typeof value === "string" && value.trim())
    : []
  const attributeLabels: Record<string, [string, string]> = {
    model: ["Model", "型号"],
    backdrop: ["Backdrop", "背景"],
    symbol: ["Symbol", "符号"],
    quantity: ["Quantity", "数量"],
    number: ["Number", "编号"],
  }

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

      {animatedUrl && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <video src={animatedUrl} controls playsInline preload="metadata" className="max-h-[520px] w-full object-contain" />
        </div>
      )}

      {attributes.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">{t("Collectible attributes", "收藏品属性")}</h2>
          <dl className="grid grid-cols-2 gap-3">
            {attributes.map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs text-zinc-500">{attributeLabels[key]?.[language === "en" ? 0 : 1] ?? key}</dt>
                <dd className="mt-1 break-words text-sm text-zinc-200">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {telegramUrl && (
        <a href={telegramUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-sky-300 underline">
          {t("View original Telegram gift page", "查看 Telegram 原始礼物页面")}
        </a>
      )}

      {product.type === "username" && (
        <p className="text-base font-medium tracking-wide text-zinc-300">
          username
        </p>
      )}

      <h1 className="text-4xl font-medium text-white">{product.type === "number" ? formatTelegramNumber(product.title) : product.title}</h1>

      <p className="text-zinc-400">{product.subtitle}</p>

      <p className="flex items-center gap-2 text-3xl font-semibold text-emerald-300">
        <GramTokenMark className="h-7 w-7" />
        {product.priceTon}
      </p>

      {product.deliveryMode === "manual" ? (
        <section className="space-y-3">
          {!checkout && (
            <button type="button" onClick={() => void startManualCheckout()} disabled={checkoutBusy} className="w-full rounded-full bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
              {checkoutBusy ? "正在创建订单…" : "立即购买"}
            </button>
          )}
          {checkout && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-zinc-500">订单号</span><span className="text-sm font-semibold text-white">{checkout.orderNo}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-zinc-500">应付金额</span><span className="text-lg font-bold text-white">{checkout.amount} {checkout.currency}</span></div>
              <div><p className="mb-1 text-xs text-zinc-500">收款钱包</p><p className="break-all rounded-lg bg-black/20 p-3 text-xs text-zinc-300">{checkout.paymentAddress}</p></div>
              <p className="text-xs text-amber-200">请使用当前已验证的钱包付款，并在备注中保留订单号。订单有效期至：{new Date(checkout.expiresAt).toLocaleString()}</p>
              {!paymentVerified && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => void payManualOrder()} disabled={checkoutBusy} className="rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">使用 TON Connect 付款</button>
                  <button type="button" onClick={() => void verifyManualPayment(checkout.orderId)} disabled={checkoutBusy} className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">核实付款</button>
                </div>
              )}
              {paymentVerified && <p className="text-sm text-emerald-300">已确认收款 · 等待管理员人工交付</p>}
            </div>
          )}
          {checkoutMessage && <p role="status" className="rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-300">{checkoutMessage}</p>}
        </section>
      ) : (
        <>
          <button type="button" disabled className="w-full rounded-full bg-white/20 px-4 py-3 text-sm text-zinc-400">
            {t("Escrow checkout (Coming Soon)", "链上托管购买（即将开放）")}
          </button>
          <p className="text-xs text-zinc-500">该商品采用链上 NFT 托管交易。主网合约完成部署及验证前，不会请求付款或转移资产。</p>
        </>
      )}

      <Link to="/catalog" className="inline-block text-sm text-zinc-400">
        {t("Back to Products", "返回商品列表")}
      </Link>
    </div>
  )
}


