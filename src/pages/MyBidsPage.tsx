import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"

export function MyBidsPage() {
  const { t } = useLanguage()
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-3xl font-semibold text-white">{t("My Bids", "我的出价")}</h1>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-sm leading-6 text-zinc-400">{t("Your auction bids will appear here when on-chain auction bidding is enabled.", "链上拍卖出价功能开放后，您提交的出价记录会显示在这里。")}</p>
      </div>
      <Link to="/assets" className="text-sm text-sky-400 hover:underline">{t("Go to My Assets", "前往我的资产")}</Link>
    </div>
  )
}
