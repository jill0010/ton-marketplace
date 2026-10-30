import { useEffect, useState } from "react"
import { TonConnectButton, useTonAddress } from "@tonconnect/ui-react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/language"
import { supabase } from "../lib/supabase"

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
  const walletAddress = useTonAddress()
  const [recipient, setRecipient] = useState<"self" | "other">("self")
  const [username, setUsername] = useState("")
  const [selectedPlan, setSelectedPlan] = useState<Plan["id"]>("year")
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [marketQuote, setMarketQuote] = useState<MarketQuote | null>(null)

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
        setLoadError("部分套餐价格缺失或无效，请联系管理员检查定价设置。")
      }

      setLoading(false)
    }

    void loadPricing()

    return () => {
      active = false
    }
  }, [])

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
      const ageSeconds = Math.floor(Date.now() / 1000) - updatedAt

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

  const selected = plans.find((plan) => plan.id === selectedPlan)

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
            <label htmlFor="premium-username" className="text-sm text-zinc-300">
              {t("Telegram username", "Telegram 用户名")}
            </label>
            <input
              id="premium-username"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value.replace(/^@/, ""))
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
          <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
            {t("Unable to load prices: ", "读取价格失败：")}{loadError}
          </p>
        )}

        {!loading && !loadError && plans.map((plan) => {
          const active = selectedPlan === plan.id
          const gramUsdValue = marketQuote
            ? plan.gramPrice * marketQuote.priceUsd
            : null
          const discountPercent =
            gramUsdValue !== null
              ? ((plan.marketUsd - gramUsdValue) / plan.marketUsd) * 100
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
                      : t("USD estimate unavailable", "美元估值暂不可用")}
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

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            {t("Payment Method", "支付方式")}
          </h2>
          <span className={walletAddress ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>
            {walletAddress ? t("Wallet connected", "钱包已连接") : t("Not connected", "尚未接通")}
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">
                {t("Connect TON Wallet", "连接 TON 钱包")}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t("Connect your wallet to prepare payment.", "连接钱包以准备支付。")}
              </p>
            </div>
            <TonConnectButton />
          </div>
          {walletAddress && (
            <p className="break-all text-xs text-emerald-300">
              {walletAddress}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-sky-400 bg-sky-400/10 px-4 py-3 font-medium text-white">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">
            G
          </span>
          GRAM
        </div>

        <div className="space-y-2 rounded-xl bg-black/20 p-4 text-sm">
          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Subscription", "订阅套餐")}</span>
            <span className="text-white">
              {selected ? t(selected.period, selected.periodZh) : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Original price", "原价格")}</span>
            <span className="text-white line-through">
              {selected ? `$${selected.marketUsd.toFixed(2)} USD` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("Discount price", "优惠价格")}</span>
            <span className="font-semibold text-emerald-300">
              {selected ? `${selected.gramPrice.toFixed(2)} GRAM` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-zinc-400">
            <span>{t("USD equivalent", "美元估值")}</span>
            <span className="text-white">
              {selected && marketQuote
                ? `$${(selected.gramPrice * marketQuote.priceUsd).toFixed(2)} USD`
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
                        selected.gramPrice * marketQuote.priceUsd) /
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

      <div className="text-center">
        <p className="text-sm text-zinc-500">
          {t("View Transactions History", "查看交易历史")}
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          {t(
            "Transaction history is not connected yet.",
            "交易历史功能尚未接通。",
          )}
        </p>
        <Link
          to="/catalog"
          className="mt-4 inline-block text-sm text-sky-300 hover:underline"
        >
          {t("Back to marketplace", "返回商城")}
        </Link>
      </div>
    </div>
  )
}



