
import { useEffect, useRef, useState } from "react"
import { beginCell } from "@ton/core"
import {
  useTonAddress,
  useTonConnectUI,
} from "@tonconnect/ui-react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"
import { GramTokenMark } from "../components/GramTokenMark"
import {
  anonymousSupabase,
  ensureAnonymousSession,
  supabase,
} from "../lib/supabase"

type Plan = {
  id: "month" | "year" | "half-year" | "quarter"
  period: string
  periodZh: string
  marketUsd: number
  gramPrice: number
}

type PricingRow = {
  id: Plan["id"]
  period: string
  market_usd: number | string
  gram_price: number | string
}

type WalletVerification = {
  verified: boolean
  address: string
  network: string
  walletVersion: string
}

const INITIAL_PLANS: Plan[] = [
  {
    id: "month",
    period: "1 month",
    periodZh: "1 个月",
    marketUsd: 4.29,
    gramPrice: 1,
  },
  {
    id: "quarter",
    period: "3 months",
    periodZh: "3 个月",
    marketUsd: 10.99,
    gramPrice: 9.79,
  },
  {
    id: "half-year",
    period: "6 months",
    periodZh: "6 个月",
    marketUsd: 14.99,
    gramPrice: 13.05,
  },
  {
    id: "year",
    period: "12 months",
    periodZh: "12 个月",
    marketUsd: 27.99,
    gramPrice: 23.67,
  },
]

export function PremiumPage() {
  const { t } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()

  const [username, setUsername] = useState("")
  const [telegramProfile, setTelegramProfile] = useState<{
    username: string
    displayName: string
    bio: string | null
    extra: string | null
    avatarUrl: string | null
    profileUrl: string
  } | null>(null)
  const [profileLookupState, setProfileLookupState] = useState<
    "idle" | "waiting" | "loading" | "success" | "error"
  >("idle")
  const [profileLookupMessage, setProfileLookupMessage] = useState("")
  const profileRequestRef = useRef(0)
  const [selectedPlan, setSelectedPlan] =
    useState<Plan["id"]>("year")

  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [walletVerification, setWalletVerification] =
    useState<WalletVerification | null>(null)
  const [proofMessage, setProofMessage] = useState("")
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState("")
  const [pendingOrderId, setPendingOrderId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"GRAM" | "USDT_TRC20">("GRAM")
  const [usdtOrder, setUsdtOrder] = useState<{ orderId: string; orderNo: string; amount: string; paymentAddress: string; expiresAt: string } | null>(null)

  const pendingProofRef = useRef(false)
  const verificationInProgressRef = useRef(false)
  const restoreRequestRef = useRef(0)

  // =====================================================
  // Telegram username -> public profile lookup
  // =====================================================

  useEffect(() => {
    const requestId = ++profileRequestRef.current
    const normalizedUsername = username.trim().replace(/^@+/, "")

    setTelegramProfile(null)
    setProfileLookupMessage("")

    if (!normalizedUsername) {
      setProfileLookupState("idle")
      return
    }

    if (
      normalizedUsername.length < 4 ||
      normalizedUsername.length > 32 ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(normalizedUsername)
    ) {
      setProfileLookupState("error")
      setProfileLookupMessage(
        "请输入有效的 Telegram 用户名（4–32 位，字母开头，可包含数字和下划线）。",
      )
      return
    }

    setProfileLookupState("waiting")
    const timer = window.setTimeout(async () => {
      if (requestId !== profileRequestRef.current) return
      setProfileLookupState("loading")

      try {
        await ensureAnonymousSession()
        const { data, error } = await anonymousSupabase.functions.invoke(
          "telegram-user-profile",
          { body: { username: normalizedUsername } },
        )

        if (requestId !== profileRequestRef.current) return
        if (error) {
          throw new Error(error.message || "Telegram 资料查询请求失败")
        }
        if (data?.success !== true || !data.profile) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "未能读取该用户的公开资料。",
          )
        }

        const profile = data.profile
        if (
          typeof profile.username !== "string" ||
          typeof profile.profileUrl !== "string"
        ) {
          throw new Error("Telegram 返回的资料格式无效。")
        }

        setTelegramProfile({
          username: profile.username,
          displayName:
            typeof profile.displayName === "string"
              ? profile.displayName
              : profile.username,
          bio: typeof profile.bio === "string" ? profile.bio : null,
          extra: typeof profile.extra === "string" ? profile.extra : null,
          avatarUrl:
            typeof profile.avatarUrl === "string"
              ? profile.avatarUrl
              : null,
          profileUrl: profile.profileUrl,
        })
        setProfileLookupState("success")
      } catch (error) {
        if (requestId !== profileRequestRef.current) return
        setProfileLookupState("error")
        setProfileLookupMessage(
          error instanceof Error
            ? error.message
            : "Telegram 资料查询失败，请稍后重试。",
        )
      }
    }, 550)

    return () => {
      window.clearTimeout(timer)
    }
  }, [username])

  // =====================================================
  // 1. 读取会员套餐价格
  // =====================================================

  useEffect(() => {
    let active = true

    async function loadPricing() {
      setLoading(true)
      setLoadError("")

      const { data, error } = await supabase
        .from("premium_pricing")
        .select("id, period, market_usd, gram_price")

      if (!active) return

      if (error) {
        setLoadError(error.message)
        setPlans([])
        setLoading(false)
        return
      }

      const rows = (data ?? []) as PricingRow[]

      const loadedPlans = INITIAL_PLANS.flatMap((initial) => {
        const row = rows.find((item) => item.id === initial.id)

        if (!row) return []

        const marketUsd = Number(row.market_usd)
        const gramPrice = Number(row.gram_price)

        if (
          !Number.isFinite(marketUsd) ||
          marketUsd <= 0 ||
          !Number.isFinite(gramPrice) ||
          gramPrice <= 0
        ) {
          return []
        }

        return [{
          ...initial,
          marketUsd,
          gramPrice,
        }]
      })

      setPlans(loadedPlans)

      if (loadedPlans.length !== INITIAL_PLANS.length) {
        setLoadError(
          "部分套餐价格缺失或无效，请联系管理员检查定价设置。",
        )
      }

      setLoading(false)
    }

    void loadPricing()

    return () => {
      active = false
    }
  }, [])

  // =====================================================
  // 3. 页面初始化：从服务器恢复钱包验证状态
  // =====================================================

  useEffect(() => {
    let active = true
    const requestId = ++restoreRequestRef.current

    async function restoreWalletVerification() {
      // 钱包尚未连接
      if (!walletAddress) {
        setWalletVerification(null)
        setProofMessage("")
        return
      }

      // 正在进行本次 TON Proof 时，不与恢复请求竞争
      if (
        pendingProofRef.current ||
        verificationInProgressRef.current
      ) {
        return
      }

      setWalletVerification(null)
      setProofMessage("正在恢复钱包身份验证状态……")

      try {
        // 必须取得当前买家的匿名 Supabase 会话
        await ensureAnonymousSession()

        if (
          !active ||
          requestId !== restoreRequestRef.current
        ) {
          return
        }

        // 获取 TON Connect 当前钱包的原始地址
        const currentWallet = tonConnectUI.wallet
        const currentAddress =
          currentWallet?.account.address
        const currentNetwork =
          currentWallet?.account.chain

        if (!currentWallet || !currentAddress) {
          setWalletVerification(null)
          setProofMessage(
            "钱包连接状态尚未准备完成，请稍后重新连接。",
          )
          return
        }

        if (currentNetwork !== "-239") {
          setWalletVerification(null)
          setProofMessage(
            "当前钱包不在 TON 主网，请切换至 TON 主网。",
          )
          return
        }

        // 通过后端查询当前匿名用户自己的验证记录
        const { data, error } =
          await anonymousSupabase.functions.invoke(
            "ton-proof-status",
            {
              body: {},
            },
          )

        if (error) {
          throw new Error(
            error.message || "钱包验证状态查询失败",
          )
        }

        if (
          !active ||
          requestId !== restoreRequestRef.current
        ) {
          return
        }

        if (data?.success !== true) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "服务器未能确认钱包验证状态",
          )
        }

        // 当前匿名用户没有已验证钱包记录
        if (data.verified !== true) {
          setWalletVerification(null)
          setProofMessage(
            "当前登录会话没有已验证的钱包记录，请重新完成 TON Proof 验证。",
          )
          return
        }

        // 检查后端返回的数据结构
        if (
          typeof data.address !== "string" ||
          data.network !== "-239" ||
          typeof data.walletVersion !== "string"
        ) {
          throw new Error("服务器返回的钱包记录格式无效")
        }

        // 再次读取当前钱包，避免请求期间钱包发生切换
        const latestWallet = tonConnectUI.wallet
        const latestAddress =
          latestWallet?.account.address
        const latestNetwork =
          latestWallet?.account.chain

        // 必须与数据库中的原始钱包地址完全一致
        if (
          !latestWallet ||
          latestNetwork !== "-239" ||
          latestAddress !== data.address ||
          currentAddress !== data.address
        ) {
          setWalletVerification(null)
          setProofMessage(
            "当前连接的钱包与服务器已验证的钱包不一致，请重新验证。",
          )
          return
        }

        setWalletVerification({
          verified: true,
          address: data.address,
          network: data.network,
          walletVersion: data.walletVersion,
        })

        setProofMessage(
          `钱包身份验证已恢复 · ${data.walletVersion}`,
        )
      } catch (error) {
        if (
          !active ||
          requestId !== restoreRequestRef.current
        ) {
          return
        }

        setWalletVerification(null)

        const message =
          error instanceof Error
            ? error.message
            : "未知验证状态查询错误"

        console.error(
          "TON wallet verification restoration failed:",
          message,
        )

        setProofMessage(
          `无法恢复钱包验证状态：${message}`,
        )
      }
    }

    void restoreWalletVerification()

    return () => {
      active = false
    }
  }, [walletAddress, tonConnectUI])

  // =====================================================
  // 4. 监听 TON 钱包连接并验证 TON Proof
  // =====================================================

  useEffect(() => {
    let active = true

    const unsubscribe = tonConnectUI.onStatusChange(
      async (wallet) => {
        if (!active) return

        // 钱包断开连接
        if (!wallet) {
          restoreRequestRef.current += 1
          setWalletVerification(null)
          setVerifying(false)
          verificationInProgressRef.current = false
          pendingProofRef.current = false
          setProofMessage("")
          return
        }

        // 只处理本次由页面主动发起的 Proof 连接
        if (!pendingProofRef.current) {
          return
        }

        if (verificationInProgressRef.current) {
          return
        }

        const tonProof = wallet.connectItems?.tonProof

        if (!tonProof) {
          pendingProofRef.current = false
          setWalletVerification(null)
          setProofMessage(
            "当前钱包没有返回 TON Proof，请断开钱包后重新连接，并使用支持 TON Proof 的钱包。",
          )
          return
        }

        if (!("proof" in tonProof)) {
          pendingProofRef.current = false
          setWalletVerification(null)
          setProofMessage(
            "当前钱包不支持所需的 TON Proof 验证，请尝试使用其他标准 TON 钱包版本。",
          )
          return
        }

        const proof = tonProof.proof
        const account = wallet.account

        if (!account.walletStateInit) {
          pendingProofRef.current = false
          setWalletVerification(null)
          setProofMessage(
            "钱包未提供 StateInit，无法完成钱包身份验证。",
          )
          return
        }

        if (account.chain !== "-239") {
          pendingProofRef.current = false
          setWalletVerification(null)
          setProofMessage(
            "当前钱包不在 TON 主网，请切换至 TON 主网后重新验证。",
          )
          return
        }

        verificationInProgressRef.current = true
        setVerifying(true)
        setProofMessage("正在向服务器验证钱包签名……")

        try {
          // 使用买家专用匿名 Supabase 会话
          await ensureAnonymousSession()

          // 向服务端提交 TON Proof
          const { data, error } =
            await anonymousSupabase.functions.invoke(
              "ton-proof-verify",
              {
                body: {
                  address: account.address,
                  network: account.chain,
                  public_key: account.publicKey,
                  proof: {
                    ...proof,
                    state_init: account.walletStateInit,
                  },
                },
              },
            )

          if (error) {
            throw new Error(
              error.message || "钱包验证请求失败",
            )
          }

          if (
            data?.success !== true ||
            data?.verified !== true ||
            data?.network !== "-239" ||
            typeof data?.address !== "string" ||
            typeof data?.walletVersion !== "string"
          ) {
            throw new Error(
              typeof data?.error === "string"
                ? data.error
                : "服务器未确认钱包身份",
            )
          }

          if (!active) return

          // 确保验证结果仍属于当前连接的钱包
          const latestWallet = tonConnectUI.wallet

          if (
            !latestWallet ||
            latestWallet.account.address !== account.address ||
            latestWallet.account.chain !== "-239" ||
            data.address !== account.address
          ) {
            throw new Error(
              "验证期间钱包连接发生变化，请重新验证。",
            )
          }

          setWalletVerification({
            verified: true,
            address: data.address,
            network: data.network,
            walletVersion: data.walletVersion,
          })

          setProofMessage(
            `钱包身份验证成功 · ${data.walletVersion}`,
          )
        } catch (error) {
          if (!active) return

          setWalletVerification(null)

          const message =
            error instanceof Error
              ? error.message
              : "未知验证错误"

          console.error(
            "TON Proof verification failed:",
            message,
          )

          setProofMessage(
            `钱包身份验证失败：${message}`,
          )
        } finally {
          pendingProofRef.current = false
          verificationInProgressRef.current = false

          if (active) {
            setVerifying(false)
          }
        }
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [tonConnectUI])

  // =====================================================
  // 5. 主动申请挑战值并发起 TON Proof 钱包连接
  // =====================================================

  async function connectAndVerifyWallet() {
    if (connecting || verifying) return

    if (tonConnectUI.connected) {
      setProofMessage(
        "当前钱包已经连接，但尚未完成本次 Proof 验证。请先断开钱包，再重新连接。",
      )
      return
    }

    setConnecting(true)
    setWalletVerification(null)
    setProofMessage("正在准备钱包身份验证……")

    pendingProofRef.current = false
    verificationInProgressRef.current = false

    try {
      // 确保使用独立的买家匿名会话
      await ensureAnonymousSession()

      // 设置 TON 主网
      tonConnectUI.setConnectionNetwork("-239")

      // 先进入挑战值加载状态
      tonConnectUI.setConnectRequestParameters({
        state: "loading",
      })

      // 向后端申请一次性挑战值
      const { data, error } =
        await anonymousSupabase.functions.invoke(
          "ton-proof-challenge",
          {
            body: {},
          },
        )

      if (error) {
        throw new Error(
          error.message || "挑战值申请失败",
        )
      }

      if (
        data?.success !== true ||
        typeof data?.payload !== "string" ||
        !/^[0-9a-f]{64}$/.test(data.payload)
      ) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "服务器返回的挑战值无效",
        )
      }

      // 将后端挑战值交给 TON Connect
      tonConnectUI.setConnectRequestParameters({
        state: "ready",
        value: {
          tonProof: data.payload,
        },
      })

      pendingProofRef.current = true

      setProofMessage(
        "挑战值已准备完成，请在钱包中确认连接和签名。",
      )

      // 打开钱包选择窗口
      await tonConnectUI.openModal()
    } catch (error) {
      pendingProofRef.current = false

      const message =
        error instanceof Error
          ? error.message
          : "未知错误"

      console.error(
        "TON wallet connection failed:",
        message,
      )

      setProofMessage(
        `无法发起钱包验证：${message}`,
      )
    } finally {
      setConnecting(false)
    }
  }

  async function verifyGramOrder(orderId: string) {
    if (!orderId || checkoutBusy) return
    setCheckoutBusy(true)
    setCheckoutMessage(t("Checking TON Mainnet for your GRAM transfer…", "正在 TON 主网核实 GRAM 到账……"))
    try {
      const { data, error } = await anonymousSupabase.functions.invoke(
        "verify-gram-premium-payment",
        { body: { order_id: orderId } },
      )
      if (error) throw new Error(error.message || "Payment verification request failed")
      if (data?.success === true && data?.paymentVerified === true) {
        setPendingOrderId("")
        setCheckoutMessage("Payment confirmed for order " + data.orderNo + ". Premium will be activated manually by the administrator.")
      } else {
        setCheckoutMessage(typeof data?.error === "string" ? data.error : "Payment has not appeared on-chain yet. Please retry shortly.")
      }
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Payment verification failed.")
    } finally {
      setCheckoutBusy(false)
    }
  }

  async function buyPremiumWithGram() {
    if (checkoutBusy) return
    if (!isWalletVerified || !tonConnectUI.wallet || tonConnectUI.wallet.account.chain !== "-239") {
      setCheckoutMessage(t("Connect and verify a TON Mainnet wallet first.", "请先连接并验证 TON 主网钱包。"))
      return
    }
    if (!selected) {
      setCheckoutMessage(t("Select a Premium plan first.", "请先选择 Premium 套餐。"))
      return
    }
    const recipientUsername = username.trim().replace(/^@+/, "")
    if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(recipientUsername)) {
      setCheckoutMessage(t("Enter a valid Telegram username (4–32 characters).", "请输入有效的 Telegram 用户名（4–32 个字符）。"))
      return
    }

    setCheckoutBusy(true)
    setCheckoutMessage(t("Creating your GRAM order…", "正在创建 GRAM 订单……"))
    try {
      await ensureAnonymousSession()
      const { data: order, error: orderError } = await anonymousSupabase.functions.invoke(
        "create-gram-premium-order",
        { body: { plan_id: selected.id, recipient_username: recipientUsername } },
      )
      if (orderError) throw new Error(orderError.message || "Unable to create order")
      if (order?.success !== true || typeof order.orderId !== "string" ||
          typeof order.paymentAddress !== "string" || typeof order.amountNano !== "string" ||
          typeof order.memo !== "string") {
        throw new Error(typeof order?.error === "string" ? order.error : "Invalid GRAM order response")
      }

      setPendingOrderId(order.orderId)
      setCheckoutMessage(t("Confirm the native GRAM transfer in your wallet…", "请在钱包中确认原生 GRAM 转账……"))
      const payload = beginCell().storeUint(0, 32).storeStringTail(order.memo).endCell().toBoc().toString("base64")
      const verifiedSender = tonConnectUI.wallet?.account.address;
      if (!verifiedSender || verifiedSender !== walletVerification?.address) {
        throw new Error("The connected wallet changed after verification. Reconnect and verify it before paying.");
      }

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: "-239",
        from: verifiedSender,
        messages: [{ address: order.paymentAddress, amount: order.amountNano, payload }],
      })

      setCheckoutMessage(t("Wallet submitted the transfer. Waiting for TON Mainnet confirmation…", "钱包已提交转账，正在等待 TON 主网确认……"))
      await new Promise((resolve) => window.setTimeout(resolve, 2500))
      const { data: verification, error: verificationError } = await anonymousSupabase.functions.invoke(
        "verify-gram-premium-payment",
        { body: { order_id: order.orderId } },
      )
      if (verificationError) throw new Error(verificationError.message || "Payment verification request failed")
      if (verification?.success === true && verification?.paymentVerified === true) {
        setPendingOrderId("")
        setCheckoutMessage("Payment confirmed for order " + verification.orderNo + ". Premium will be activated manually by the administrator.")
      } else {
        setCheckoutMessage(typeof verification?.error === "string" ? verification.error : t("Transfer submitted. Use Check payment after the transaction appears on-chain.", "转账已提交，交易上链后请点击“核实付款”。"))
      }
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Unable to submit GRAM payment.")
    } finally {
      setCheckoutBusy(false)
    }
  }


  async function createUsdtOrder() {
    if (checkoutBusy || !selected) return
    const recipientUsername = username.trim().replace(/^@+/, "")
    if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(recipientUsername)) {
      setCheckoutMessage(t("Enter a valid Telegram username (4–32 characters).", "请输入有效的 Telegram 用户名（4–32 个字符）。"))
      return
    }
    setCheckoutBusy(true)
    setCheckoutMessage(t("Creating your USDT order…", "正在创建 USDT 订单……"))
    setUsdtOrder(null)
    try {
      await ensureAnonymousSession()
      const { data, error } = await anonymousSupabase.functions.invoke("create-usdt-premium-order", {
        body: { plan_id: selected.id, recipient_username: recipientUsername },
      })
      if (error) throw new Error(error.message || "Unable to create USDT order")
      if (data?.success !== true || typeof data.orderId !== "string" || typeof data.orderNo !== "string" ||
          typeof data.amount !== "string" || typeof data.paymentAddress !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Invalid USDT order response")
      }
      setUsdtOrder({ orderId: data.orderId, orderNo: data.orderNo, amount: data.amount, paymentAddress: data.paymentAddress, expiresAt: data.expiresAt })
      setCheckoutMessage(data.telegramNotified
        ? t("Order created. The administrator has been notified by Telegram.", "订单已创建，管理员已收到 Telegram 机器人通知。")
        : t("Order created. Telegram notification could not be confirmed.", "订单已创建，但无法确认机器人通知是否送达。"))
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Unable to create USDT order.")
    } finally {
      setCheckoutBusy(false)
    }
  }

  // =====================================================
  // 6. 当前套餐与验证状态
  // =====================================================

  const selected = plans.find(
    (plan) => plan.id === selectedPlan,
  )

  const normalizedRecipient = username.trim().replace(/^@+/, "")
  const recipientValid =
    normalizedRecipient.length >= 4 &&
    normalizedRecipient.length <= 32 &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(normalizedRecipient) &&
    profileLookupState === "success" &&
    telegramProfile?.username.toLowerCase() === normalizedRecipient.toLowerCase()

  const isWalletVerified =
    walletVerification?.verified === true &&
    walletVerification.network === "-239" &&
    walletVerification.address ===
      tonConnectUI.wallet?.account.address &&
    tonConnectUI.wallet?.account.chain === "-239"

  // =====================================================
  // 7. 页面
  // =====================================================


  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 bg-[#0b0d12] px-4 py-7 text-white sm:px-6">
      <div className="space-y-2 px-1">
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("Buy Telegram Premium", "购买 Telegram Premium")}
          <img src="/premium-star-original.svg" alt="Telegram Premium" className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
        </h1>
        <p className="text-sm leading-relaxed text-slate-300">{t("Use your crypto wallet to buy a Telegram Premium subscription for yourself or your friends and colleagues.", "使用您的加密货币钱包为自己或您的朋友和同事购买 Telegram Premium 会员资格。")}</p>
      </div>
      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#13171c] p-5">
        <h2 className="px-4 text-sm font-semibold">{t("Choose recipient", "选择接收人")}</h2>
        <div className="flex items-center gap-3 rounded-xl bg-[#252f39] px-4 py-3">
          <span className="text-zinc-400">⌕</span>
          <input id="premium-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={t("Enter Telegram username...", "输入 Telegram 用户名...")} autoComplete="off" maxLength={33} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>
        {(profileLookupState === "waiting" || profileLookupState === "loading") && <p className="px-4 text-xs text-sky-300">{profileLookupState === "waiting" ? t("Preparing profile lookup…", "准备查询资料……") : t("Looking up Telegram profile…", "正在查询 Telegram 资料……")}</p>}
        {profileLookupState === "error" && <p className="px-4 text-xs text-amber-300">{profileLookupMessage}</p>}
        {telegramProfile && profileLookupState === "success" && <div className="mx-1 flex items-center gap-3 rounded-xl border border-white/10 bg-[#252f39] p-3">
          {telegramProfile.avatarUrl ? <img src={telegramProfile.avatarUrl} alt={telegramProfile.displayName} referrerPolicy="no-referrer" className="h-12 w-12 rounded-full object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600">{telegramProfile.displayName.slice(0,1).toUpperCase()}</div>}
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{telegramProfile.displayName}</p><p className="text-xs text-sky-300">@{telegramProfile.username}</p>{telegramProfile.bio && <p className="line-clamp-2 text-xs text-slate-300">{telegramProfile.bio}</p>}<a href={telegramProfile.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-300">{t("View Telegram profile", "查看 Telegram 资料")}</a></div>
        </div>}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold">{t("Choose duration", "选择持续时间")}</h2>
        {!loading && !loadError && plans.map((plan) => {
          const active = selectedPlan === plan.id
          const discount = ({ month: 18, quarter: 30, "half-year": 57, year: 72 } as Record<string, number>)[plan.id] ?? 0
          return <button key={plan.id} type="button" onClick={() => { setSelectedPlan(plan.id); setUsdtOrder(null) }} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_5.5rem_4rem] items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${active ? "border-sky-400 bg-[#202b36] shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]" : "border-white/10 bg-[#131a22] hover:border-white/20 hover:bg-[#1a2530]"}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-sky-400" : "border-slate-400"}`}>{active && <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />}</span>
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">{t(plan.period, plan.periodZh)} <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">-{discount}%</span></span>
            <span className="flex w-[5.5rem] items-center justify-start gap-1.5 whitespace-nowrap text-sm font-bold"><span className="flex h-5 w-5 shrink-0 items-center justify-center"><GramTokenMark className="h-4 w-4" /></span><span>{plan.gramPrice.toFixed(2)}</span></span>
            <span className="whitespace-nowrap text-sm text-slate-400">${plan.marketUsd.toFixed(2)}</span>
          </button>
        })}
        {loading && <p className="px-4 text-xs text-slate-400">{t("Loading plans…", "正在加载套餐……")}</p>}
        {loadError && <p className="px-4 text-xs text-red-300">{loadError}</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-[#13171c] p-5">
        <h2 className="text-sm font-semibold">{t("Payment Method", "付款方式")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setPaymentMethod("GRAM"); setUsdtOrder(null) }} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${paymentMethod === "GRAM" ? "border-sky-400 bg-[#202b36]" : "border-white/10 bg-[#0f1216] hover:border-white/20"}`}>
            <GramTokenMark className="h-5 w-5" />
            <span>GRAM <span className="font-normal text-slate-400">TON</span></span>
          </button>
          <button type="button" onClick={() => { setPaymentMethod("USDT_TRC20"); setUsdtOrder(null) }} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${paymentMethod === "USDT_TRC20" ? "border-sky-400 bg-[#202b36]" : "border-white/10 bg-[#0f1216] hover:border-white/20"}`}>
            <img src="/usdt-logo.png" alt="" aria-hidden="true" className="h-6 w-6 shrink-0 object-contain" />
            <span>USDT</span>
          </button>
        </div>
      </section>

      {paymentMethod === "GRAM" ? <section className="space-y-3">
        {proofMessage && !proofMessage.startsWith("钱包身份验证已恢复") && <p className="text-xs text-slate-400">{proofMessage}</p>}
        <button type="button" onClick={buyPremiumWithGram} disabled={checkoutBusy || !recipientValid || !isWalletVerified || loading || Boolean(loadError) || !selected} className={`w-full rounded-xl px-4 py-3 font-semibold text-white transition-colors ${checkoutBusy || !recipientValid || !isWalletVerified || loading || Boolean(loadError) || !selected ? "bg-[#248BDA] text-white cursor-not-allowed" : "bg-sky-700 hover:bg-sky-600"}`}>{checkoutBusy ? t("Processing…", "处理中……") : t("Gift Telegram Premium", "赠送 Telegram Premium")}</button>
        {pendingOrderId && <button type="button" onClick={() => void verifyGramOrder(pendingOrderId)} disabled={checkoutBusy} className="w-full rounded-xl border border-white/15 px-4 py-2 text-sm">{t("Check payment", "核实付款")}</button>}
      </section> : <section className="space-y-3">
        <button type="button" onClick={createUsdtOrder} disabled={checkoutBusy || !recipientValid || loading || Boolean(loadError) || !selected} className={`w-full rounded-xl px-4 py-3 font-semibold text-white transition-colors ${checkoutBusy || !recipientValid || loading || Boolean(loadError) || !selected ? "bg-[#248BDA] text-white cursor-not-allowed" : "bg-sky-700 hover:bg-sky-600"}`}>{checkoutBusy ? t("Processing…", "处理中……") : t("Gift Telegram Premium", "赠送 Telegram Premium")}</button>
        {usdtOrder && <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-[#202d34] p-4">
          <p className="text-sm font-semibold text-emerald-300">{t("USDT-TRC20 payment details", "USDT-TRC20 收款信息")}</p><p className="text-xs text-slate-300">{t("Order", "订单号")}: {usdtOrder.orderNo}</p><p className="text-lg font-bold">{usdtOrder.amount} USDT</p><p className="break-all rounded-lg bg-black/20 p-3 text-xs">{usdtOrder.paymentAddress}</p>
          <button type="button" onClick={() => void navigator.clipboard.writeText(usdtOrder.paymentAddress)} className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm">{t("Copy receiving address", "复制收款地址")}</button>
          <p className="text-xs leading-5 text-amber-300">{t("Send USDT on TRON (TRC20) network only. The administrator will verify receipt and manually activate Premium. Do not send on another network.", "请仅通过波场 TRON（TRC20）网络转账。转账后由管理员核实到账并人工开通会员，切勿使用其他网络。")}</p>
        </div>}
      </section>}
      {checkoutMessage && <p role="status" className="rounded-xl bg-[#252f39] p-3 text-xs leading-5 text-slate-300">{checkoutMessage}</p>}
      <div className="pt-1 text-center"><Link to="/premium/history" className="text-sm text-sky-300 hover:underline">{t("View Transactions History", "查看交易记录")}</Link></div>
    </div>
  )

}
