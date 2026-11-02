import { useEffect, useState } from "react"
import { useLanguage } from "../lib/useLanguage"
import { supabase } from "../lib/supabase"

type PricingPlan = {
  id: "year" | "half-year" | "quarter"
  period: string
  periodZh: string
  marketUsd: number
  gramPrice: string
}

type PricingRow = {
  id: PricingPlan["id"]
  period: string
  market_usd: number | string
  gram_price: number | string
}

const INITIAL_PLANS: PricingPlan[] = [
  {
    id: "year",
    period: "1 year",
    periodZh: "1 年",
    marketUsd: 28.99,
    gramPrice: "23.67",
  },
  {
    id: "half-year",
    period: "6 months",
    periodZh: "6 个月",
    marketUsd: 15.99,
    gramPrice: "13.05",
  },
  {
    id: "quarter",
    period: "3 months",
    periodZh: "3 个月",
    marketUsd: 11.99,
    gramPrice: "9.79",
  },
]

export function PremiumPricingAdminPage() {
  const { t } = useLanguage()
  const [plans, setPlans] = useState<PricingPlan[]>(
    INITIAL_PLANS.map((plan) => ({ ...plan })),
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState("")
  const [saveError, setSaveError] = useState("")

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
        setLoadError("读取数据库失败：" + error.message)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as PricingRow[]

      const merged = INITIAL_PLANS.map((plan) => {
        const row = rows.find((item) => item.id === plan.id)

        if (!row) return { ...plan }

        return {
          ...plan,
          marketUsd: Number(row.market_usd),
          gramPrice: String(row.gram_price),
        }
      })

      setPlans(merged)
      setLoading(false)
    }

    void loadPricing()

    return () => {
      active = false
    }
  }, [])

  function updatePrice(id: PricingPlan["id"], value: string) {
    if (value !== "" && !/^\d*\.?\d{0,6}$/.test(value)) return

    setPlans((current) =>
      current.map((plan) =>
        plan.id === id ? { ...plan, gramPrice: value } : plan,
      ),
    )
    setMessage("")
    setSaveError("")
  }

  async function savePricing() {
    setMessage("")
    setSaveError("")

    if (loading || loadError) {
      setSaveError("数据库价格尚未成功读取，暂时不能保存。")
      return
    }

    const invalidPlan = plans.find((plan) => {
      const price = Number(plan.gramPrice)
      return (
        !plan.gramPrice.trim() ||
        !Number.isFinite(price) ||
        price <= 0
      )
    })

    if (invalidPlan) {
      setSaveError("请为所有套餐填写大于 0 的有效 GRAM 售价。")
      return
    }

    setSaving(true)

    try {
      const updatedAt = new Date().toISOString()

      const rows = plans.map((plan) => ({
        id: plan.id,
        period: plan.period,
        market_usd: plan.marketUsd,
        gram_price: Number(plan.gramPrice),
        updated_at: updatedAt,
      }))

      const { error } = await supabase
        .from("premium_pricing")
        .upsert(rows, { onConflict: "id" })

      if (error) {
        setSaveError("保存失败：" + error.message)
        return
      }

      setMessage("三个套餐的价格已成功保存到数据库。")
    } catch {
      setSaveError("保存时发生意外错误，请检查网络后重试。")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">
          {t("Telegram Premium Pricing", "Telegram 高级版定价管理")}
        </h1>
        <p className="text-sm leading-6 text-zinc-400">
          {t(
            "Set the selling price for each subscription in GRAM. Reference USD prices are displayed separately.",
            "分别设置每个订阅套餐的 GRAM 销售价。美元价格仅作参考，单独展示。",
          )}
        </p>
      </header>

      {loading && (
        <p className="text-sm text-zinc-400">正在读取数据库价格……</p>
      )}

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
          {loadError}
        </p>
      )}

      <section className="space-y-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-white">
                {t(plan.period, plan.periodZh)}
              </h2>
              <p className="text-sm text-zinc-400">
                {t("Original price", "原价格")}: $
                {plan.marketUsd.toFixed(2)} USD
              </p>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">
                {t("Selling price (GRAM)", "优惠价格（GRAM）")}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={plan.gramPrice}
                disabled={loading || Boolean(loadError) || saving}
                onChange={(event) =>
                  updatePrice(plan.id, event.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-sky-400 disabled:opacity-50"
                placeholder={t("Enter your selling price", "请输入你制定的售价")}
              />
            </label>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {message && (
          <p role="status" className="text-sm text-emerald-300">
            {message}
          </p>
        )}

        {saveError && (
          <p role="alert" className="text-sm text-red-300">
            {saveError}
          </p>
        )}

        <button
          type="button"
          onClick={() => void savePricing()}
          disabled={loading || Boolean(loadError) || saving}
          className="w-full rounded-full bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "正在保存……"
            : t("Save pricing", "保存价格")}
        </button>

        <p className="text-xs leading-5 text-zinc-500">
          {t(
            "Only the authorized administrator can save changes. GRAM market prices and discount calculations are not connected yet.",
            "只有获授权的管理员可以保存修改。GRAM 实时行情和折扣计算尚未接通。",
          )}
        </p>
      </section>
    </main>
  )
}
