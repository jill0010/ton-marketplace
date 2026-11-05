import { useTonAddress, useTonWallet } from "@tonconnect/ui-react"
import { Link } from "react-router-dom"
import { useLanguage } from "../lib/useLanguage"

export function MyProfilePage() {
  const { t } = useLanguage()
  const walletAddress = useTonAddress()
  const wallet = useTonWallet()
  const chainLabel = wallet?.account.chain === "-239"
    ? t("TON Mainnet", "TON 主网")
    : wallet?.account.chain === "-3"
      ? t("TON Testnet", "TON 测试网")
      : t("Unknown network", "未知网络")

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-zinc-500">{t("Wallet account", "钱包账户")}</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">{t("My Profile", "我的个人资料")}</h1>
      </div>
      {!walletAddress ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm text-zinc-300">{t("Connect a TON wallet to view your profile.", "连接 TON 钱包后即可查看个人资料。")}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-sky-300 hover:underline">{t("Back to marketplace", "返回商城")}</Link>
        </section>
      ) : (
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2a3342] text-white">
              <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current" strokeWidth="1.6" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="3" /><path d="M6.8 18a5.7 5.7 0 0 1 10.4 0" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-white">{t("TON wallet profile", "TON 钱包资料")}</h2>
              <p className="text-sm text-zinc-400">{t("Wallet-connected account", "钱包连接账户")}</p>
            </div>
          </div>
          <div className="space-y-2 border-t border-white/10 pt-4">
            <p className="text-xs text-zinc-500">{t("Wallet address", "钱包地址")}</p>
            <p className="break-all font-mono text-sm text-zinc-200">{walletAddress}</p>
          </div>
          <div className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">{t("Network", "网络")}</p>
              <p className="mt-1 text-sm text-white">{chainLabel}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{t("Wallet application", "钱包应用")}</p>
              <p className="mt-1 text-sm text-white">{wallet?.device.appName || "—"}</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-zinc-500">{t("This marketplace account is identified by your connected wallet. No separate username, email address, or profile details have been collected.", "商城目前以连接的钱包作为账户身份标识，尚未收集独立用户名、电子邮箱或其他个人资料。")}</p>
        </section>
      )}
    </div>
  )
}
