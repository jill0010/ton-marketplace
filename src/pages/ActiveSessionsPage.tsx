import { useState } from "react"
import { Link } from "react-router-dom"
import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { useLanguage } from "../lib/useLanguage"

export function ActiveSessionsPage() {
  const { t } = useLanguage()
  const walletAddress = useTonAddress()
  const wallet = useTonWallet()
  const [tonConnectUI] = useTonConnectUI()
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState("")

  async function disconnectWallet() {
    if (disconnecting) return
    setDisconnecting(true)
    setError("")
    try {
      await tonConnectUI.disconnect()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Unable to disconnect wallet.", "无法断开钱包连接。"))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-zinc-500">{t("Connected devices", "已连接设备")}</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">{t("Active Sessions", "活跃会话")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("Manage the TON wallet connection currently used by this browser.", "管理当前浏览器使用的 TON 钱包连接。")}</p>
      </div>
      {walletAddress && wallet ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 19v2m8-2v2M8 9h8" /></svg>
              </span>
              <div>
                <p className="font-semibold text-white">{wallet.device.appName || t("TON wallet", "TON 钱包")}</p>
                <p className="text-xs text-emerald-300">{t("Connected", "已连接")}</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{t("Active", "活跃")}</span>
          </div>
          <div className="border-t border-white/10 pt-3">
            <p className="text-xs text-zinc-500">{t("Wallet address", "钱包地址")}</p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-300">{walletAddress}</p>
          </div>
          <button type="button" onClick={() => void disconnectWallet()} disabled={disconnecting} className="rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/10 disabled:opacity-50">
            {disconnecting ? t("Disconnecting…", "正在断开…") : t("Disconnect this session", "断开此会话")}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
          <p className="text-sm text-zinc-400">{t("There are no active TON wallet sessions in this browser.", "当前浏览器没有活跃的 TON 钱包会话。")}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-sky-300 hover:underline">{t("Connect wallet", "连接钱包")}</Link>
        </section>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-400/20 p-3 text-sm text-red-300">{error}</p>}
      <p className="text-xs leading-5 text-zinc-500">{t("Only the TON Connect session for this browser is shown here. Other devices or sessions managed inside your wallet app are not visible to this marketplace.", "这里只显示当前浏览器的 TON Connect 会话。商城无法查看钱包应用内其他设备或会话。")}</p>
    </div>
  )
}
