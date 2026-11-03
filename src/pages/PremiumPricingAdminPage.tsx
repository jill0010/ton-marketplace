import { useEffect, useState } from "react"
import { useLanguage } from "../lib/useLanguage"
import { supabase } from "../lib/supabase"

type PlanId = "month" | "quarter" | "half-year" | "year"
type PriceMap = Record<PlanId, string>

const PLAN_FIELDS: { id: PlanId; title: string; period: string }[] = [
  { id: "month", title: "1 个月", period: "1 month" },
  { id: "quarter", title: "3 个月", period: "3 months" },
  { id: "half-year", title: "6 个月", period: "6 months" },
  { id: "year", title: "12 个月", period: "12 months" },
]

export function PremiumPricingAdminPage() {
  const { t } = useLanguage()
  const [prices, setPrices] = useState<PriceMap>({
    month: "4.29",
    quarter: "10.99",
    "half-year": "14.99",
    year: "27.99",
  })
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
        .select("id, market_usd")
        .in("id", ["month", "quarter", "half-year", "year"])
      if (!active) return
      if (error) {
        setLoadError("读取数据库失败：" + error.message)
      } else {
        const next: PriceMap = { ...prices }
        for (const row of data ?? []) {
          const id = row.id as PlanId
          if (id === "year" || id === "half-year" || id === "quarter") {
            next[id] = String(row.market_usd)
          }
        }
        setPrices(next)
        if (PLAN_FIELDS.some((plan) => !next[plan.id] || Number(next[plan.id]) <= 0)) {
          setLoadError("套餐价格记录不完整，请检查 premium_pricing 表。")
        }
      }
      setLoading(false)
    }
    void loadPricing()
    return () => { active = false }
  }, [])

  function updatePrice(id: PlanId, value: string) {
    if (value !== "" && !/^\d{0,6}(?:\.\d{0,2})?$/.test(value)) return
    setPrices((current) => ({ ...current, [id]: value }))
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
    for (const plan of PLAN_FIELDS) {
      const amount = Number(prices[plan.id])
      if (!prices[plan.id].trim() || !Number.isFinite(amount) || amount <= 0) {
        setSaveError(`${plan.title}价格必须是大于 0 的有效美元金额。`)
        return
      }
    }

    setSaving(true)
    try {
      const results = await Promise.all(PLAN_FIELDS.map((plan) =>
        supabase.from("premium_pricing").update({
          period: plan.period,
          market_usd: Number(prices[plan.id]),
          updated_at: new Date().toISOString(),
        }).eq("id", plan.id).select("id").maybeSingle()
      ))
      const failed = results.find((result) => result.error || !result.data)
      if (failed) {
        setSaveError(failed.error?.message || "有套餐价格没有更新，请检查管理员权限及数据库记录。")
        return
      }
      setPrices((current) => ({
        month: Number(current.month).toFixed(2),
        quarter: Number(current.quarter).toFixed(2),
        "half-year": Number(current["half-year"]).toFixed(2),
        year: Number(current.year).toFixed(2),
      }))
      setMessage("三个 Premium 套餐的美元价格已保存。")
    } catch {
      setSaveError("保存时发生意外错误，请检查网络后重试。")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">
          {t("Telegram Premium Pricing", "Telegram Premium 定价管理")}
        </h1>
        <p className="text-sm leading-6 text-zinc-400">
          {t(
            "Set the USD selling price for each gift duration. The storefront calculates the GRAM equivalent using the live market rate. USDT checkout uses the same USD price.",
            "分别设置三个赠送时长的美元售价。商城前台按 GRAM 实时行情换算；USDT 付款使用相同美元金额。",
          )}
        </p>
      </header>

      {loading && <p className="text-sm text-zinc-400">正在读取数据库价格……</p>}
      {loadError && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{loadError}</p>}

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {PLAN_FIELDS.map((plan) => (
          <label key={plan.id} className="block space-y-2">
            <span className="text-sm font-medium text-white">{plan.title} Premium</span>
            <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-4 focus-within:border-sky-400">
              <span className="text-lg text-zinc-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={prices[plan.id]}
                disabled={loading || Boolean(loadError) || saving}
                onChange={(event) => updatePrice(plan.id, event.target.value)}
                className="w-full bg-transparent px-3 py-3 text-lg font-semibold text-white outline-none disabled:opacity-50"
                placeholder="4.29"
              />
              <span className="text-sm text-zinc-500">USD</span>
            </div>
          </label>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
        {saveError && <p role="alert" className="text-sm text-red-300">{saveError}</p>}
        <button
          type="button"
          onClick={() => void savePricing()}
          disabled={loading || Boolean(loadError) || saving}
          className="w-full rounded-full bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "正在保存……" : t("Save USD prices", "保存美元价格")}
        </button>
      </section>
    </main>
  )
}
