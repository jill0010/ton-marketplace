
import { useEffect, useRef, useState } from "react"
import { beginCell } from "@ton/core"
import {
  TonConnectButton,
  useTonAddress,
  useTonConnectUI,
} from "@tonconnect/ui-react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"
import {
  anonymousSupabase,
  ensureAnonymousSession,
  supabase,
} from "../lib/supabase"

type Plan = {
  id: "year" | "half-year" | "quarter"
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

type MarketQuote = {
  priceUsd: number
  updatedAt: number
}

type WalletVerification = {
  verified: boolean
  address: string
  network: string
  walletVersion: string
}

const INITIAL_PLANS: Plan[] = [
  {
    id: "year",
    period: "1 year",
    periodZh: "1 年",
    marketUsd: 28.99,
    gramPrice: 23.67,
  },
  {
    id: "half-year",
    period: "6 months",
    periodZh: "6 个月",
    marketUsd: 15.99,
    gramPrice: 13.05,
  },
  {
    id: "quarter",
    period: "3 months",
    periodZh: "3 个月",
    marketUsd: 11.99,
    gramPrice: 9.79,
  },
]

export function PremiumPage() {
  const { t } = useLanguage()
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()

  const [recipient, setRecipient] = useState<"self" | "other">("self")
  const [username, setUsername] = useState("")
  const [selectedPlan, setSelectedPlan] =
    useState<Plan["id"]>("year")

  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [marketQuote, setMarketQuote] =
    useState<MarketQuote | null>(null)

  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [walletVerification, setWalletVerification] =
    useState<WalletVerification | null>(null)
  const [proofMessage, setProofMessage] = useState("")

  const pendingProofRef = useRef(false)
  const verificationInProgressRef = useRef(false)
  const restoreRequestRef = useRef(0)

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
  // 2. 获取 GRAM 实时行情
  // =====================================================

  useEffect(() => {
    let active = true

    async function loadMarketPrice() {
      const { data, error } = await supabase.functions.invoke(
        "gram-price",
        { method: "GET" },
      )

      if (!active) return

      const priceUsd = Number(data?.priceUsd)
      const updatedAt = Number(data?.updatedAt)
      const ageSeconds =
        Math.floor(Date.now() / 1000) - updatedAt

      if (
        error ||
        !Number.isFinite(priceUsd) ||
        priceUsd <= 0 ||
        !Number.isFinite(updatedAt) ||
        ageSeconds < -60 ||
        ageSeconds > 600
      ) {
        setMarketQuote(null)
        return
      }

      setMarketQuote({ priceUsd, updatedAt })
    }

    void loadMarketPrice()

    const timer = window.setInterval(() => {
      void loadMarketPrice()
    }, 60000)

    return () => {
      active = false
      window.clearInterval(timer)
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

  // =====================================================
  // 6. 当前套餐与验证状态
  // =====================================================

  const selected = plans.find(
    (plan) => plan.id === selectedPlan,
  )

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
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {t("Buy Telegram Premium", "购买 Telegram Premium")}
        </h1>

        <p className="text-sm leading-6 text-zinc-400">
          {t(
            "Use your crypto wallet to buy a Telegram Premium subscription for yourself or your friends and colleagues.",
            "使用加密钱包为自己、朋友或同事购买 Telegram Premium 订阅。",
          )}
        </p>
      </header>

      {/* 接收人 */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRecipient("other")}
            className={`rounded-xl border px-3 py-3 text-sm ${
              recipient === "other"
                ? "border-sky-400 bg-sky-400/10 text-white"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
            }`}
          >
            {t("Choose recipient", "选择接收人")}
          </button>

          <button
            type="button"
            onClick={() => {
              setRecipient("self")
              setUsername("")
            }}
            className={`rounded-xl border px-3 py-3 text-sm ${
              recipient === "self"
                ? "border-sky-400 bg-sky-400/10 text-white"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
            }`}
          >
            {t("Buy for myself", "为自己购买")}
          </button>
        </div>

        {recipient === "other" && (
          <div className="space-y-2">
            <label
              htmlFor="premium-username"
              className="text-sm text-zinc-300"
            >
              {t("Telegram username", "Telegram 用户名")}
            </label>

            <input
              id="premium-username"
              value={username}
              onChange={(event) =>
                setUsername(
                  event.target.value.replace(/^@/, ""),
                )
              }
              placeholder={t(
                "Enter Telegram username...",
                "输入 Telegram 用户名...",
              )}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-sky-400"
            />

            <p className="text-xs leading-5 text-zinc-500">
              {username
                ? t(
                    `Entered recipient: @${username}. Profile verification is not connected yet.`,
                    `已输入接收人：@${username}。用户头像和身份验证功能尚未接通。`,
                  )
                : t(
                    "Enter a username without the @ symbol. Profile lookup is not connected yet.",
                    "请输入用户名，可不带 @ 符号。头像和资料查询功能尚未接通。",
                  )}
            </p>
          </div>
        )}
      </section>

      {/* 套餐 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          {t("Choose a subscription", "选择订阅套餐")}
        </h2>

        {loading && (
          <p className="text-sm text-zinc-400">
            {t("Loading prices...", "正在读取套餐价格……")}
          </p>
        )}

        {loadError && (
          <p
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300"
          >
            {t("Unable to load prices: ", "读取价格失败：")}
            {loadError}
          </p>
        )}

        {!loading &&
          !loadError &&
          plans.map((plan) => {
            const active = selectedPlan === plan.id

            const gramUsdValue = marketQuote
              ? plan.gramPrice * marketQuote.priceUsd
              : null

            const discountPercent =
              gramUsdValue !== null
                ? ((plan.marketUsd - gramUsdValue) /
                    plan.marketUsd) *
                  100
                : null

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-sky-400 bg-sky-400/[0.08]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-white">
                      {t(plan.period, plan.periodZh)}
                    </p>

                    <p className="text-xs text-zinc-500">
                      {t("Original price", "原价格")}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="mb-1 text-xs font-medium text-emerald-300">
                      {t("Discount price", "优惠价格")}
                    </p>

                    <p className="text-lg font-semibold text-emerald-300">
                      {plan.gramPrice.toFixed(2)} GRAM
                    </p>

                    <p className="text-sm text-zinc-400 line-through">
                      ${plan.marketUsd.toFixed(2)} USD
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      {gramUsdValue !== null
                        ? `≈ $${gramUsdValue.toFixed(2)} USD`
                        : t(
                            "USD estimate unavailable",
                            "美元估值暂不可用",
                          )}
                    </p>

                    {discountPercent !== null && (
                      <p className="text-xs text-emerald-300">
                        {discountPercent > 0
                          ? t(
                              `Save ${discountPercent.toFixed(1)}%`,
                              `优惠 ${discountPercent.toFixed(1)}%`,
                            )
                          : t("No discount", "暂无折扣")}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
      </section>

      {/* 钱包身份验证及支付方式 */}
      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            {t("Payment Method", "支付方式")}
          </h2>

          <span
            className={
              isWalletVerified
                ? "text-xs text-emerald-300"
                : walletAddress
                  ? "text-xs text-amber-300"
                  : "text-xs text-zinc-400"
            }
          >
            {isWalletVerified
              ? t("Wallet verified", "钱包身份已验证")
              : walletAddress
                ? t("Verification required", "等待身份验证")
                : t("Not connected", "尚未连接")}
          </span>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">
                {t("Connect TON Wallet", "连接 TON 钱包")}
              </p>

              <p className="mt-1 text-xs text-zinc-400">
                {t(
                  "Connect your wallet and verify ownership with TON Proof.",
                  "连接钱包并通过 TON Proof 验证钱包所有权。",
                )}
              </p>
            </div>

            {!walletAddress ? (
              <button
                type="button"
                onClick={connectAndVerifyWallet}
                disabled={connecting || verifying}
                className="shrink-0 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connecting
                  ? t("Preparing...", "正在准备……")
                  : verifying
                    ? t("Verifying...", "正在验证……")
                    : t("Connect wallet", "连接钱包")}
              </button>
            ) : (
              <TonConnectButton />
            )}
          </div>

          {walletAddress && (
            <div className="space-y-2">
              <p className="break-all text-xs text-zinc-300">
                {walletAddress}
              </p>

              {isWalletVerified && walletVerification && (
                <p className="text-xs text-emerald-300">
                  {t(
                    "Verified wallet version: ",
                    "已验证钱包版本：",
                  )}
                  {walletVerification.walletVersion}
                </p>
              )}
            </div>
          )}

          {proofMessage && (
            <p
              role="status"
              className={`break-words text-xs leading-5 ${
                isWalletVerified
                  ? "text-emerald-300"
                  : proofMessage.includes("失败") ||
                      proofMessage.includes("无法")
                    ? "text-red-300"
                    : "text-amber-300"
              }`}
            >
              {proofMessage}
            </p>
          )}

          {walletAddress && !isWalletVerified && !verifying && (
            <p className="text-xs leading-5 text-amber-300">
              {t(
                "This wallet connection has not been verified. Disconnect it and reconnect to complete TON Proof verification.",
                "当前钱包连接尚未通过身份验证。请先断开钱包，再重新连接并完成 TON Proof 验证。",
              )}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-sky-400 bg-sky-400/10 px-4 py-3 font-medium text-white">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">
            G
          </span>
          GRAM
        </div>

        {/* 订单价格预览 */}
        <div className="space-y-2 rounded-xl bg-black/20 p-4 text-sm">
          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Subscription", "订阅套餐")}</span>
            <span className="text-white">
              {selected
                ? t(selected.period, selected.periodZh)
                : "—"}
            </span>
          </div>

          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Original price", "原价格")}</span>
            <span className="text-white line-through">
              {selected
                ? `$${selected.marketUsd.toFixed(2)} USD`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Discount price", "优惠价格")}</span>
            <span className="font-semibold text-emerald-300">
              {selected
                ? `${selected.gramPrice.toFixed(2)} GRAM`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("USD equivalent", "美元估值")}</span>
            <span className="text-white">
              {selected && marketQuote
                ? `$${(
                    selected.gramPrice * marketQuote.priceUsd
                  ).toFixed(2)} USD`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Discount", "优惠比例")}</span>
            <span className="font-semibold text-emerald-300">
              {selected && marketQuote
                ? (() => {
                    const discount =
                      ((selected.marketUsd -
                        selected.gramPrice *
                          marketQuote.priceUsd) /
                        selected.marketUsd) *
                      100

                    return discount > 0
                      ? `${discount.toFixed(1)}%`
                      : t("No discount", "暂无折扣")
                  })()
                : "—"}
            </span>
          </div>

          <p className="pt-1 text-xs leading-5 text-zinc-500">
            {marketQuote
              ? t(
                  "GRAM/USD quote from CoinGecko. Automatically refreshed every 60 seconds.",
                  "GRAM/USD 行情来自 CoinGecko，每 60 秒自动刷新。",
                )
              : t(
                  "Live market quote unavailable. USD equivalent and discount are hidden.",
                  "实时行情暂不可用，美元估值和折扣暂不显示。",
                )}
          </p>
        </div>

        {/* 真实付款功能暂时关闭 */}
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-full bg-white/10 px-4 py-3 text-sm font-semibold text-zinc-500"
        >
          {t("Gift Telegram Premium", "赠送 Telegram Premium")}
        </button>

        <p className="text-center text-xs text-zinc-500">
          {t(
            "Purchases are not enabled in this preview.",
            "当前预览版本尚未启用购买功能。",
          )}
        </p>
      </section>

      {/* 交易历史 */}
      <div className="text-center">
        <Link
          to="/premium/history"
          className="inline-block text-sm text-sky-300 hover:underline"
        >
          {t("View Transactions History", "查看交易记录")}
        </Link>
        <div className="mt-4">
          <Link to="/catalog" className="text-sm text-zinc-500 hover:text-zinc-300">
            {t("Back to marketplace", "返回商城")}
          </Link>
        </div>
      </div>
    </div>
  )
}
