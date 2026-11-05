import { Link } from "react-router-dom"
import { useTonAddress } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function MyBidsPage() {
  const { t } = useLanguage()
  const walletAddress = useTonAddress()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-zinc-500">{t("Auction activity", "拍卖活动")}</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">{t("My Bids", "我的出价")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("Bids associated with your connected TON wallet.", "查看与当前 TON 钱包关联的出价记录。")}</p>
      </div>
      {!walletAddress ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm text-zinc-300">{t("Connect your TON wallet to view your bidding activity.", "连接 TON 钱包后即可查看出价活动。")}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-sky-300 hover:underline">{t("Back to marketplace", "返回商城并连接钱包")}</Link>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-white">{t("Connected wallet", "当前钱包")}</h2>
            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">{t("Not active yet", "暂未开放")}</span>
          </div>
          <p className="break-all font-mono text-xs text-zinc-400">{walletAddress}</p>
          <div className="border-t border-white/10 pt-4">
            <p className="text-sm leading-6 text-zinc-400">{t("No on-chain auction bids are available yet. This page will show bid amounts, auction status, refunds and winning results after the marketplace bidding contracts and customer bidding flow are activated. No bid or payment has been submitted from this page.", "目前尚无可查询的链上拍卖出价。商城拍卖合约及客户出价流程正式启用后，这里将显示出价金额、拍卖状态、退款和竞拍结果。本页面不会提交出价或发起付款。")}</p>
          </div>
        </section>
      )}
      <Link to="/assets" className="text-sm text-sky-400 hover:underline">{t("Go to My Assets", "前往我的资产")}</Link>
    </div>
  )
}
