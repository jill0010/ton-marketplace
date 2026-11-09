import { useEffect, useState } from "react"
import { Address, Cell, beginCell, toNano } from "@ton/core"
import { readMarketplaceV3TestnetGetter, readV3TestnetMarketplaceEscrow, inspectV3TestnetNftCustody, inspectV3TestnetAssetProductBinding } from "../lib/marketplaceV3TestnetReadonly"
import { inspectMarketplaceV3TestnetProduct } from "../lib/marketplaceV3TestnetDiagnostics"
import { preflightMarketplaceV3TestnetPurchase } from "../lib/marketplaceV3Preflight"
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
  const [v3ReadBusy, setV3ReadBusy] = useState(false)
  const [v3ReadMessage, setV3ReadMessage] = useState("")
  const [v3PreflightBusy, setV3PreflightBusy] = useState(false)
  const [v3PreflightMessage, setV3PreflightMessage] = useState("")
  const [v3OrderBusy, setV3OrderBusy] = useState(false)
  const [v3OrderMessage, setV3OrderMessage] = useState("")

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
      setPaymentVerified(data.paymentVerified === true)
      setCheckoutMessage(data.paymentVerified === true
        ? "该订单已确认收款，正在等待管理员人工交付。"
        : "订单已创建，请在有效期内完成付款。")
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

  async function readV3TestnetCustodyBinding() {
    if (v3ReadBusy || !product) return
    setV3ReadBusy(true)
    setV3ReadMessage("正在读取 V3 测试网链上商品及 NFT 托管状态……")
    try {
      const binding = await readV3TestnetMarketplaceEscrow()
      const metadata = product.productMetadata ?? {}
      const nftAddress = typeof metadata.nft_item_address === "string"
        ? metadata.nft_item_address : null
      const chainProductId = metadata.v3_testnet_product_id
      if (!nftAddress || (typeof chainProductId !== "string" && typeof chainProductId !== "number")) {
        setV3ReadMessage(`已读取测试网 Marketplace 与 Escrow：${binding.marketplaceAddress} / ${binding.escrowAddress}。该商品尚未配置 V3 测试网 NFT 地址和链上商品编号，不能购买。`)
        return
      }
      if ((typeof chainProductId === "number" && !Number.isSafeInteger(chainProductId)) ||
          !/^[1-9][0-9]*$/.test(String(chainProductId))) {
        setV3ReadMessage("V3 链上商品编号无效，禁止付款。")
        return
      }
      const productId = BigInt(chainProductId)
      if (productId > 0xffff_ffff_ffff_ffffn) {
        setV3ReadMessage("V3 链上商品编号超出 uint64 范围，禁止付款。")
        return
      }
      const [custody, asset] = await Promise.all([
        inspectV3TestnetNftCustody(nftAddress, binding.escrowAddress),
        inspectV3TestnetAssetProductBinding(nftAddress, productId),
      ])
      if (!custody.custodyMatches || !asset.bindingMatches) {
        setV3ReadMessage("测试网 NFT 托管或 Marketplace 商品绑定不匹配，禁止付款。")
        return
      }
      const listing = await inspectMarketplaceV3TestnetProduct(productId)
      if (listing.marketplaceAddress !== binding.marketplaceAddress ||
          listing.status !== 2n || listing.existingOrderId !== null ||
          listing.escrowId === null || listing.escrowId <= 0n ||
          !listing.escrowConfigured || !listing.treasuryConfigured ||
          !listing.coordinatorConfigured) {
        setV3ReadMessage("测试网商品未处于可售状态，或合约绑定不完整，禁止付款。")
        return
      }
      const productGetter = await readMarketplaceV3TestnetGetter("productV2", productId)
      if (!Address.parse(productGetter.contract_address).equals(Address.parse(listing.marketplaceAddress))) {
        setV3ReadMessage("链上商品详情合约地址不一致，禁止付款。")
        return
      }
      // TON Center may flatten a Tolk struct into ten TVM stack entries.
      // Preserve the same field order for flattened and nested representations.
      const productStack = productGetter.stack
      const nested = productStack.length === 1 ? productStack[0] as { type?: unknown; items?: unknown } : null
      const productFields = productStack.length === 11 && (productStack[10] as { type?: unknown } | undefined)?.type === "num" ? productStack.slice(0, 10) :
        productStack.length === 10 ? productStack :
        nested?.type === "tuple" && Array.isArray(nested.items) ? nested.items : null
      if (!productFields || productFields.length !== 10) {
        setV3ReadMessage("链上商品结构尚不支持可信解码，禁止付款。")
        return
      }
      const entry = { items: productFields }
      const nftEntry = entry.items[2] as { type?: unknown; cell?: unknown; value?: unknown } | null
      const nftBoc = typeof nftEntry?.cell === "string" ? nftEntry.cell :
        typeof nftEntry?.value === "string" ? nftEntry.value : null
      if (nftEntry?.type !== "slice" || !nftBoc ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(nftBoc) || nftBoc.length > 4096) {
        setV3ReadMessage("链上商品 NFT 地址编码不受支持，禁止付款。")
        return
      }
      const nftSlice = Cell.fromBase64(nftBoc).beginParse()
      const listedNft = nftSlice.loadAddress()
      if (nftSlice.remainingBits !== 0 || nftSlice.remainingRefs !== 0 ||
          !listedNft.equals(Address.parse(nftAddress))) {
        setV3ReadMessage("链上商品 NFT 地址与商城商品不一致，禁止付款。")
        return
      }
      const priceEntry = entry.items[3] as { type?: unknown; value?: unknown } | null
      if (!priceEntry || priceEntry.type !== "num" || typeof priceEntry.value !== "string" ||
          !/^(0|[1-9][0-9]*)$/.test(priceEntry.value)) {
        setV3ReadMessage("无法可靠读取链上售价，禁止付款。")
        return
      }
      const readNumber = (index: number): bigint | null => {
        const item = (entry.items as unknown[])[index] as { type?: unknown; value?: unknown } | null
        if (!item || item.type !== "num" || typeof item.value !== "string" ||
            !(/^(0|[1-9][0-9]*)$/.test(item.value) || /^0x[0-9a-fA-F]+$/.test(item.value))) return null
        return BigInt(item.value)
      }
      // Cross-check the immutable product ID, escrow ID, query ID and listing
      // status from the SAME product tuple as the price.
      if (readNumber(0) !== productId ||
          readNumber(4) !== listing.escrowId ||
          readNumber(5) !== listing.productQueryId ||
          readNumber(7) !== listing.status) {
        setV3ReadMessage("链上商品详情与商品状态不一致，禁止付款。")
        return
      }
      const chainPrice = BigInt(priceEntry.value)
      if (chainPrice <= 0n || chainPrice !== toNano(product.priceTonExact)) {
        setV3ReadMessage("链上售价与商城展示价格不一致，禁止付款。")
        return
      }
      // Re-read mutable state after the price observation. This detects
      // intervening sales or cancellations, but is NOT an atomic snapshot.
      const [statusAfter, orderAfter] = await Promise.all([
        readMarketplaceV3TestnetGetter("productStatusV2", productId),
        readMarketplaceV3TestnetGetter("orderIdForProductV2", productId),
      ])
      const isListed = statusAfter.stack.length === 1 &&
        (statusAfter.stack[0] as { type?: unknown; value?: unknown })?.type === "num" &&
        ["2", "0x2"].includes(String((statusAfter.stack[0] as { value?: unknown }).value))
      const orderEntry = orderAfter.stack[0] as { type?: unknown } | undefined
      const noOrder = orderAfter.stack.length === 1 && orderEntry?.type === "null"
      if (!Address.parse(statusAfter.contract_address).equals(Address.parse(listing.marketplaceAddress)) ||
          !Address.parse(orderAfter.contract_address).equals(Address.parse(listing.marketplaceAddress)) ||
          !isListed || !noOrder) {
        setV3ReadMessage("价格读取后商品状态或订单占用已发生变化，禁止付款。")
        return
      }
      // Reject observations that drift too far apart; these checks remain
      // diagnostic and never authorize a transaction.
      const observations = [
        binding.observedAt, custody.observedAt, asset.observedAt,
        listing.observedAt, productGetter.observed_at,
        statusAfter.observed_at, orderAfter.observed_at,
      ].map((value) => Date.parse(value))
      const observedNow = Date.now()
      if (observations.some((value) => !Number.isFinite(value) ||
          value > observedNow + 5000 || observedNow - value > 15000) ||
          Math.max(...observations) - Math.min(...observations) > 5000) {
        setV3ReadMessage("链上查询跨越时间过长，商品或订单状态可能已变化，禁止付款。")
        return
      }
      setV3ReadMessage("测试网托管、商品绑定、售价及二次订单状态检查通过。RPC 读取不是同一区块原子快照，仍禁止付款。")
    } catch (cause) {
      setV3ReadMessage(cause instanceof Error ? cause.message : "测试网链上读取失败，禁止付款。")
    } finally {
      setV3ReadBusy(false)
    }
  }

  async function checkV3TestnetPurchasePrerequisites() {
    if (v3PreflightBusy || !product) return
    setV3PreflightBusy(true)
    setV3PreflightMessage("正在检查测试网购买条件……")
    try {
      const wallet = tonConnectUI.wallet
      if (!wallet || wallet.account.chain !== "-3") {
        throw new Error("请连接 TON 测试网钱包。主网钱包不能用于 V3 测试网购买。")
      }
      const metadata = product.productMetadata ?? {}
      const rawId = metadata.v3_testnet_product_id
      const nft = metadata.nft_item_address
      if ((typeof rawId !== "string" && typeof rawId !== "number") ||
          (typeof rawId === "number" && !Number.isSafeInteger(rawId)) ||
          !/^[1-9][0-9]*$/.test(String(rawId)) || typeof nft !== "string") {
        throw new Error("商品缺少可信的 V3 测试网 NFT 与商品编号绑定。")
      }
      const chainId = BigInt(rawId)
      if (chainId > 0xffff_ffff_ffff_ffffn) throw new Error("V3 商品编号无效。")
      const binding = await readV3TestnetMarketplaceEscrow()
      const [custody, asset, listing] = await Promise.all([
        inspectV3TestnetNftCustody(nft, binding.escrowAddress),
        inspectV3TestnetAssetProductBinding(nft, chainId),
        inspectMarketplaceV3TestnetProduct(chainId),
      ])
      if (!custody.custodyMatches || !asset.bindingMatches ||
          listing.marketplaceAddress !== binding.marketplaceAddress ||
          listing.status !== 2n || listing.existingOrderId !== null ||
          listing.escrowId === null || listing.escrowId <= 0n ||
          !listing.escrowConfigured || !listing.treasuryConfigured || !listing.coordinatorConfigured) {
        throw new Error("NFT 托管、链上绑定或商品可售状态不符合购买条件。")
      }
      // The displayed Supabase price is not payment authority. Require a
      // fresh on-chain product tuple and an exact NFT/price match before
      // even reporting that purchase prerequisites are satisfied.
      const productGetter = await readMarketplaceV3TestnetGetter("productV2", chainId)
      if (!Address.parse(productGetter.contract_address).equals(Address.parse(listing.marketplaceAddress))) {
        throw new Error("链上商品详情来自不同的 Marketplace 合约。")
      }
      const stack = productGetter.stack
      const nested = stack.length === 1 ? stack[0] as { type?: unknown; items?: unknown } : null
      const fields = stack.length === 11 && (stack[10] as { type?: unknown } | undefined)?.type === "num" ? stack.slice(0, 10) :
        stack.length === 10 ? stack :
        nested?.type === "tuple" && Array.isArray(nested.items) ? nested.items : null
      if (!fields || fields.length !== 10) throw new Error("链上商品详情结构无法可信解码。")
      const numberAt = (index: number): bigint | null => {
        const entry = fields[index] as { type?: unknown; value?: unknown } | null
        if (entry?.type !== "num" || typeof entry.value !== "string" ||
            !(/^(0|[1-9][0-9]*)$/.test(entry.value) || /^0x[0-9a-fA-F]+$/.test(entry.value))) return null
        return BigInt(entry.value)
      }
      const nftEntry = fields[2] as { type?: unknown; cell?: unknown; value?: unknown } | null
      const encoded = typeof nftEntry?.cell === "string" ? nftEntry.cell :
        typeof nftEntry?.value === "string" ? nftEntry.value : null
      if (nftEntry?.type !== "slice" || !encoded ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 4096) {
        throw new Error("链上 NFT 地址编码不受支持。")
      }
      const nftSlice = Cell.fromBase64(encoded).beginParse()
      const listedNft = nftSlice.loadAddress()
      if (nftSlice.remainingBits !== 0 || nftSlice.remainingRefs !== 0 ||
          !listedNft.equals(Address.parse(nft))) throw new Error("链上 NFT 与商品绑定不一致。")
      // A seller address must come from the verified chain tuple, not
      // the browser product row or a caller-provided field.
      const sellerEntry = fields[1] as { type?: unknown; cell?: unknown; value?: unknown } | null
      const sellerBoc = typeof sellerEntry?.cell === "string" ? sellerEntry.cell :
        typeof sellerEntry?.value === "string" ? sellerEntry.value : null
      if (sellerEntry?.type !== "slice" || !sellerBoc ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(sellerBoc) || sellerBoc.length > 4096) {
        throw new Error("链上卖家钱包地址编码不受支持。")
      }
      const sellerSlice = Cell.fromBase64(sellerBoc).beginParse()
      const seller = sellerSlice.loadAddress()
      if (sellerSlice.remainingBits !== 0 || sellerSlice.remainingRefs !== 0 ||
          seller.workChain !== 0 || seller.equals(Address.parse(wallet.account.address)) ||
          seller.equals(Address.parse(binding.escrowAddress))) {
        throw new Error("链上卖家地址无效，或买家不能购买自己的商品。")
      }
      const chainPrice = numberAt(3)
      if (numberAt(0) !== chainId || numberAt(4) !== listing.escrowId ||
          numberAt(5) !== listing.productQueryId || numberAt(7) !== listing.status ||
          chainPrice === null || chainPrice <= 0n ||
          chainPrice !== toNano(product.priceTonExact)) {
        throw new Error("链上商品编号、价格、Escrow 或上架状态与页面不一致。")
      }
      const observations = [binding.observedAt, custody.observedAt, asset.observedAt, listing.observedAt, productGetter.observed_at]
        .map((value) => Date.parse(value))
      const observedNow = Date.now()
      if (observations.some((value) => !Number.isFinite(value) ||
          value > observedNow + 5000 || observedNow - value > 15000) ||
          Math.max(...observations) - Math.min(...observations) > 5000) {
        throw new Error("链上读取结果已过期或时间跨度过大，请重新检查。")
      }
      // Recheck mutable order/listing state after the custody observations.
      // This still is not an atomic snapshot and cannot authorize a purchase.
      const [statusAfter, orderAfter] = await Promise.all([
        readMarketplaceV3TestnetGetter("productStatusV2", chainId),
        readMarketplaceV3TestnetGetter("orderIdForProductV2", chainId),
      ])
      const latestStatus = statusAfter.stack[0] as { type?: unknown; value?: unknown } | undefined
      const latestOrder = orderAfter.stack[0] as { type?: unknown } | undefined
      if (statusAfter.stack.length !== 1 || orderAfter.stack.length !== 1 ||
          !Address.parse(statusAfter.contract_address).equals(Address.parse(listing.marketplaceAddress)) ||
          !Address.parse(orderAfter.contract_address).equals(Address.parse(listing.marketplaceAddress)) ||
          latestStatus?.type !== "num" || !["2", "0x2"].includes(String(latestStatus.value)) ||
          latestOrder?.type !== "null") {
        throw new Error("商品在检查期间发生出售、取消或订单占用，禁止付款。")
      }
      const latestTimes = [statusAfter.observed_at, orderAfter.observed_at].map((value) => Date.parse(value))
      const finalNow = Date.now()
      if (latestTimes.some((value) => !Number.isFinite(value) ||
          value > finalNow + 5000 || finalNow - value > 15000) ||
          Math.max(...observations, ...latestTimes) - Math.min(...observations, ...latestTimes) > 5000) {
        throw new Error("订单二次检查与此前的 NFT / 价格读取时间不一致，禁止付款。")
      }
      if (tonConnectUI.wallet?.account.chain !== "-3" ||
          !tonConnectUI.wallet.account.address ||
          !Address.parse(tonConnectUI.wallet.account.address).equals(Address.parse(wallet.account.address))) {
        throw new Error("检查期间连接的钱包已发生变化，请重新检查。")
      }
      // Prepare and validate the canonical V3 wire quote without signing or
      // submitting it. The RPC observations are not atomic; this is a
      // diagnostic dry run, never a payment authorization.
      // The wallet can disconnect or switch networks while multiple RPC
      // requests are in flight. Recheck it immediately before quoting.
      const activeWallet = tonConnectUI.wallet
      if (!activeWallet || activeWallet.account.chain !== "-3" ||
          !Address.parse(activeWallet.account.address).equals(Address.parse(wallet.account.address))) {
        throw new Error("钱包连接已改变，请重新执行购买预检。")
      }
      const nowSeconds = Math.floor(Date.now() / 1000)
      const quote = preflightMarketplaceV3TestnetPurchase({
        snapshot: {
          chain: "-3",
          marketplaceAddress: listing.marketplaceAddress,
          productId: chainId,
          nftItemAddress: nft,
          escrowAddress: binding.escrowAddress,
          sellerAddress: seller.toRawString(),
          buyerAddress: wallet.account.address,
          priceNano: chainPrice,
          productStatus: 2,
          existingOrderId: null,
          coordinatorConfigured: listing.coordinatorConfigured,
          treasuryConfigured: listing.treasuryConfigured,
          escrowConfigured: listing.escrowConfigured,
          nftOwnerAddress: custody.ownerAddress,
          escrowId: listing.escrowId,
          fetchedAtSeconds: Math.floor(Math.min(...observations, ...latestTimes) / 1000),
        },
        connectedWalletChain: activeWallet.account.chain,
        connectedBuyerAddress: activeWallet.account.address,
        expectedMarketplaceAddress: listing.marketplaceAddress,
        expectedProductId: chainId,
        expectedNftItemAddress: nft,
        expectedPriceNano: toNano(product.priceTonExact),
        nowSeconds,
      })
      // The final quote must not be reused after a wallet or listing change.
      // Do not persist the payload or offer a send button from this dry run.
      if (quote.network !== "-3" || quote.productId !== chainId ||
          quote.priceNano !== chainPrice || quote.reserveNano !== toNano("0.2") ||
          !Address.parse(quote.address).equals(Address.parse(listing.marketplaceAddress)) ||
          quote.deadline <= Math.floor(Date.now() / 1000) ||
          quote.totalNano <= quote.priceNano + quote.reserveNano) {
        throw new Error("V3 交易报价与链上验证结果不一致，禁止付款。")
      }
      setV3PreflightMessage(`V3 测试网购买参数校验通过：商品 #${quote.productId.toString()}，售价 ${product.priceTon} TON，预留金 0.2 TON，报价总发送金额 ${(quote.totalNano / 1_000_000_000n).toString()}.${(quote.totalNano % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "") || "0"} TON（含交易执行费用）。当前仅模拟预检，不签名、不发送；RPC 读取非原子快照，不能据此付款。`)
    } catch (cause) {
      setV3PreflightMessage(cause instanceof Error ? cause.message : "测试网购买条件检查失败。")
    } finally {
      setV3PreflightBusy(false)
    }
  }

  async function readV3TestnetOrderStatus() {
    if (v3OrderBusy || !product) return
    setV3OrderBusy(true)
    setV3OrderMessage("正在读取测试网链上订单状态……")
    try {
      const rawId = product.productMetadata?.v3_testnet_product_id
      if ((typeof rawId !== "string" && typeof rawId !== "number") ||
          (typeof rawId === "number" && !Number.isSafeInteger(rawId)) ||
          !/^[1-9][0-9]*$/.test(String(rawId))) {
        throw new Error("该商品没有有效的 V3 测试网链上商品编号。")
      }
      const chainId = BigInt(rawId)
      if (chainId > 0xffff_ffff_ffff_ffffn) throw new Error("V3 商品编号超出范围。")
      const diagnostic = await inspectMarketplaceV3TestnetProduct(chainId)
      if (diagnostic.existingOrderId === null) {
        setV3OrderMessage(diagnostic.status === 2n
          ? "测试网链上商品仍在出售，尚无订单。此查询不代表购买授权。"
          : `测试网链上商品状态：${diagnostic.status?.toString() ?? "不存在"}；尚无关联订单。`)
        return
      }
      // Order diagnostics can span several RPC reads. Confirm the same
      // order still occupies this product before presenting its state.
      const [latestOrder, latestStatus] = await Promise.all([
        readMarketplaceV3TestnetGetter("orderIdForProductV2", chainId),
        readMarketplaceV3TestnetGetter("productStatusV2", chainId),
      ])
      const latestOrderEntry = latestOrder.stack[0] as { type?: unknown; value?: unknown } | undefined
      const latestStatusEntry = latestStatus.stack[0] as { type?: unknown; value?: unknown } | undefined
      const parseChainNumber = (entry: { type?: unknown; value?: unknown } | undefined): bigint | null =>
        entry?.type === "num" && typeof entry.value === "string" &&
        (/^(0|[1-9][0-9]*)$/.test(entry.value) || /^0x[0-9a-fA-F]+$/.test(entry.value))
          ? BigInt(entry.value) : null
      if (latestOrder.stack.length !== 1 || latestStatus.stack.length !== 1 ||
          !Address.parse(latestOrder.contract_address).equals(Address.parse(diagnostic.marketplaceAddress)) ||
          !Address.parse(latestStatus.contract_address).equals(Address.parse(diagnostic.marketplaceAddress)) ||
          parseChainNumber(latestOrderEntry) !== diagnostic.existingOrderId ||
          parseChainNumber(latestStatusEntry) !== diagnostic.status) {
        throw new Error("查询期间订单或商品状态已改变，请重新查询。")
      }
      const reserve = diagnostic.reserveStatus === null ? "尚无状态" : diagnostic.reserveStatus.toString()
      const productStatusLabel: Record<string, string> = {
        "1": "已登记", "2": "出售中", "3": "处理中", "5": "已完成或终止（需核对收据）", "6": "退款或取消（需核对收据）",
      }
      const statusText = diagnostic.status === null ? "不存在" :
        productStatusLabel[diagnostic.status.toString()] ?? "未知状态"
      const orderMessage = diagnostic.status === 2n
        ? "链上仍显示出售中，但存在关联订单，状态冲突，请勿再次付款。"
        : "订单已占用商品，禁止重复付款。NFT 交付与预留金最终结算仍需独立链上收据证明。"
      setV3OrderMessage(`测试网订单 #${diagnostic.existingOrderId.toString()}；商品：${statusText}；预留金状态码：${reserve}。${orderMessage}`)
    } catch (cause) {
      setV3OrderMessage(cause instanceof Error ? cause.message : "订单状态读取失败。")
    } finally {
      setV3OrderBusy(false)
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
          <button type="button" onClick={() => void readV3TestnetCustodyBinding()} disabled={v3ReadBusy} className="w-full rounded-full border border-white/20 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">
            {v3ReadBusy ? "正在读取测试网链上状态…" : "读取 V3 测试网托管合约"}
          </button>
          {v3ReadMessage && <p role="status" className="break-all rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-300">{v3ReadMessage}</p>}
          <button type="button" onClick={() => void checkV3TestnetPurchasePrerequisites()} disabled={v3PreflightBusy} className="w-full rounded-full border border-sky-500/40 px-4 py-2.5 text-sm text-sky-200 hover:bg-sky-500/10 disabled:opacity-50">
            {v3PreflightBusy ? "正在检查测试网购买条件…" : "检查 V3 测试网购买条件（不付款）"}
          </button>
          {v3PreflightMessage && <p role="status" className="break-all rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-300">{v3PreflightMessage}</p>}
          <button type="button" onClick={() => void readV3TestnetOrderStatus()} disabled={v3OrderBusy} className="w-full rounded-full border border-white/20 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">
            {v3OrderBusy ? "正在查询测试网订单…" : "查询 V3 测试网订单与预留金状态"}
          </button>
          {v3OrderMessage && <p role="status" className="break-all rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-300">{v3OrderMessage}</p>}
        </>
      )}

      <Link to="/catalog" className="inline-block text-sm text-zinc-400">
        {t("Back to Products", "返回商品列表")}
      </Link>
    </div>
  )
}


