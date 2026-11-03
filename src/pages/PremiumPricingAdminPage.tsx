import { useEffect, useState } from "react"
import { useLanguage } from "../lib/useLanguage"
import { supabase } from "../lib/supabase"

export function PremiumPricingAdminPage() {
  const { t } = useLanguage()
  const [priceUsd, setPriceUsd] = useState("28.99")
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
        .select("market_usd")
        .eq("id", "year")
        .maybeSingle()

      if (!active) return

      if (error) {
        setLoadError("读取数据库失败：" + error.message)
      } else if (!data || !Number.isFinite(Number(data.market_usd)) || Number(data.market_usd) <= 0) {
        setLoadError("未找到有效的 12 个月 Premium 美元售价。")
      } else {
        setPriceUsd(String(data.market_usd))
      }

      setLoading(false)
    }

    void loadPricing()
    return () => {
      active = false
    }
  }, [])

  function updatePrice(value: string) {
    if (value !== "" && !/^\d{0,6}(?:\.\d{0,2})?$/.test(value)) return
    setPriceUsd(value)
    setMessage("")
    setSaveError("")
  }

  async function savePricing() {
    setMessage("")
    setSaveError("")

    const price = Number(priceUsd)
    if (!priceUsd.trim() || !Number.isFinite(price) || price <= 0) {
      setSaveError("请输入大于 0 的有效美元售价。")
      return
    }

    if (loading || loadError) {
      setSaveError("数据库价格尚未成功读取，暂时不能保存。")
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from("premium_pricing")
        .update({
          market_usd: price,
          period: "12 months",
          updated_at: new Date().toISOString(),
        })
        .eq("id", "year")
        .select("id")
        .maybeSingle()

      if (error) {
        setSaveError("保存失败：" + error.message)
        return
      }
      if (!data) {
        setSaveError("没有更新任何价格记录，请确认管理员权限和 year 定价记录。")
        return
      }

      setPriceUsd(price.toFixed(2))
      setMessage("12 个月 Premium 固定美元售价已保存。")
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
            "Set one fixed USD price for the 12-month Premium gift. The storefront converts it to GRAM using the live market rate.",
            "只需设置 12 个月 Premium 礼物的固定美元售价，商城首页会根据 GRAM 实时行情自动换算。",
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

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-white">
            {t("12-month Premium gift", "12 个月 Premium 礼物")}
          </h2>
          <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs text-sky-300">
            USD
          </span>
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-zinc-300">
            {t("Fixed selling price (USD)", "固定销售价格（美元）")}
          </span>
          <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-4 focus-within:border-sky-400">
            <span className="text-lg text-zinc-400">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={priceUsd}
              disabled={loading || Boolean(loadError) || saving}
              onChange={(event) => updatePrice(event.target.value)}
              className="w-full bg-transparent px-3 py-3 text-lg font-semibold text-white outline-none disabled:opacity-50"
              placeholder="28.99"
            />
            <span className="text-sm text-zinc-500">USD</span>
          </div>
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {message && (
          <p role="status" className="text-sm text-emerald-300">{message}</p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-red-300">{saveError}</p>
        )}
        <button
          type="button"
          onClick={() => void savePricing()}
          disabled={loading || Boolean(loadError) || saving}
          className="w-full rounded-full bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "正在保存……" : t("Save USD price", "保存美元售价")}
        </button>
      </section>
    </main>
  )
}
