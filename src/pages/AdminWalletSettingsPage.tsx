import { useCallback, useEffect, useState } from "react"
import { Address, toNano } from "@ton/core"
import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { supabase } from "../lib/supabase"

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78"

type WalletSettings = {
  id: number
  custody_wallet_address: string | null
  platform_treasury_address: string | null
  updated_at: string
}

function normalizeMainnetAddress(value: string): string {
  const input = value.trim()
  if (!input) throw new Error("请填写 TON 主网钱包地址。")

  let parsed: Address
  if (/^[A-Za-z0-9_-]{48}$/.test(input)) {
    const friendly = Address.parseFriendly(input)
    if (friendly.isTestOnly) {
      throw new Error("检测到 TON 测试网地址，不能保存为主网钱包。")
    }
    parsed = friendly.address
  } else {
    parsed = Address.parse(input)
  }

  return parsed.toString({ bounceable: false, urlSafe: true, testOnly: false })
}

export function AdminWalletSettingsPage() {
  const [tonConnectUI] = useTonConnectUI()
  const connectedAddress = useTonAddress()
  const wallet = useTonWallet()
  const [custodyAddress, setCustodyAddress] = useState("")
  const [treasuryAddress, setTreasuryAddress] = useState("")
  const [saved, setSaved] = useState<WalletSettings | null>(null)
  const [depositAmount, setDepositAmount] = useState("0.5")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const isMainnetWallet = wallet?.account.chain === "-239"

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || userData.user?.id !== ADMIN_UID) {
        throw new Error("当前账号不是授权管理员。")
      }
      const { data, error: readError } = await supabase
        .from("marketplace_wallet_settings")
        .select("id, custody_wallet_address, platform_treasury_address, updated_at")
        .eq("id", 1)
        .maybeSingle()
      if (readError) throw readError
      const row = data as WalletSettings | null
      setSaved(row)
      setCustodyAddress(row?.custody_wallet_address ?? "")
      setTreasuryAddress(row?.platform_treasury_address ?? "")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取钱包配置失败。")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSettings() }, [loadSettings])

  function useConnectedWallet() {
    if (!connectedAddress || !isMainnetWallet) {
      setError("请先连接 TON 主网钱包，不能使用测试网钱包。")
      return
    }
    setCustodyAddress(connectedAddress)
    setError("")
    setMessage("已填入当前连接的主网钱包地址。保存后才会更新商城配置。")
  }

  async function saveSettings() {
    if (saving) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || userData.user?.id !== ADMIN_UID) {
        throw new Error("管理员身份验证失败，请重新登录。")
      }
      const nextCustody = normalizeMainnetAddress(custodyAddress)
      const nextTreasury = treasuryAddress.trim()
        ? normalizeMainnetAddress(treasuryAddress)
        : null
      const previous = saved
      const { data, error: saveError } = await supabase
        .from("marketplace_wallet_settings")
        .upsert({
          id: 1,
          custody_wallet_address: nextCustody,
          platform_treasury_address: nextTreasury,
          updated_at: new Date().toISOString(),
          updated_by: ADMIN_UID,
        }, { onConflict: "id" })
        .select("id, custody_wallet_address, platform_treasury_address, updated_at")
        .single()
      if (saveError) throw saveError

      const { error: logError } = await supabase
        .from("marketplace_wallet_setting_logs")
        .insert({
          previous_custody_wallet_address: previous?.custody_wallet_address ?? null,
          new_custody_wallet_address: nextCustody,
          previous_platform_treasury_address: previous?.platform_treasury_address ?? null,
          new_platform_treasury_address: nextTreasury,
          actor_id: ADMIN_UID,
        })
      if (logError) {
        console.error("Wallet setting audit log failed", logError.message)
      }

      setSaved(data as WalletSettings)
      setCustodyAddress(nextCustody)
      setTreasuryAddress(nextTreasury ?? "")
      setMessage(logError
        ? "钱包配置已保存，但审计记录写入失败，请检查数据库策略。"
        : "商城钱包配置已保存。注意：这不会自动修改已经部署的智能合约绑定。")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存钱包配置失败。")
    } finally {
      setSaving(false)
    }
  }

  async function depositGas() {
    if (depositing) return
    setError("")
    setMessage("")
    try {
      if (!wallet || !isMainnetWallet) {
        throw new Error("请先连接用于支付的 TON 主网钱包。")
      }
      const destination = normalizeMainnetAddress(custodyAddress)
      const amount = Number(depositAmount)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
        throw new Error("请输入大于 0 且有效的 GRAM 充值金额。")
      }
      if (Address.parse(destination).equals(Address.parse(wallet.account.address))) {
        throw new Error("当前付款钱包与托管钱包相同，请连接另一个有余额的钱包进行充值。")
      }
      setDepositing(true)
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: "-239",
        messages: [{
          address: destination,
          amount: toNano(depositAmount.trim()).toString(),
        }],
      })
      setMessage("钱包已提交转账请求。请等待 TON 主网确认后，再在区块浏览器核实到账。")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "充值交易未完成。")
    } finally {
      setDepositing(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">TON MARKETPLACE · ADMIN</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">商城托管钱包</h1>
        <p className="mt-2 text-sm text-zinc-400">管理商城公开钱包地址、平台手续费金库，并为托管钱包充值主网 GRAM。</p>
      </header>

      <section className="space-y-4 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
        <h2 className="font-semibold text-amber-200">私钥安全说明</h2>
        <p className="text-sm leading-6 text-zinc-300">
          此页面不会要求、接收或保存私钥/助记词。请通过 TON Connect 连接钱包并在钱包应用内批准交易。商城只保存公开地址；任何人都不应把私钥或助记词输入网站表单、聊天窗口或数据库。
        </p>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">{message}</p>}

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">托管钱包地址</h2>
            <p className="mt-1 text-xs text-zinc-500">用于商城托管/资金操作的钱包公开地址。</p>
          </div>
          <button type="button" onClick={() => void tonConnectUI.openModal()} className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
            {connectedAddress ? "切换连接钱包" : "连接 TON 钱包"}
          </button>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-zinc-500">当前连接钱包</p>
          <p className="mt-1 break-all text-sm text-white">{connectedAddress || "尚未连接"}</p>
          <p className={isMainnetWallet ? "mt-1 text-xs text-emerald-300" : "mt-1 text-xs text-amber-300"}>
            {wallet ? (isMainnetWallet ? "TON 主网" : "非主网网络，不能保存为主网托管地址") : "等待连接钱包"}
          </p>
        </div>
        <button type="button" onClick={useConnectedWallet} disabled={!connectedAddress || !isMainnetWallet} className="rounded-full border border-sky-400/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-400/10 disabled:opacity-40">
          使用当前连接地址
        </button>
        <label className="block space-y-2 text-sm text-zinc-300">
          托管钱包公开地址
          <input value={custodyAddress} onChange={(event) => setCustodyAddress(event.target.value)} placeholder="连接主网钱包后自动填入，或粘贴 EQ… / UQ…" className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white">平台手续费金库</h2>
        <p className="text-xs leading-5 text-zinc-500">Marketplace V2 的 3% 平台手续费接收地址。它与 Premium 收款地址、NFT Escrow 智能合约地址是不同配置。</p>
        <label className="block space-y-2 text-sm text-zinc-300">
          手续费接收钱包公开地址
          <input value={treasuryAddress} onChange={(event) => setTreasuryAddress(event.target.value)} placeholder="EQ… / UQ…" className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">为托管钱包充值主网 GRAM</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">通过当前连接的钱包发起原生 GRAM 转账。连接的钱包必须是另一个主网钱包；请在钱包中核对收款地址和金额，并自行批准网络手续费。</p>
        </div>
        <label className="block space-y-2 text-sm text-zinc-300">
          充值金额（GRAM）
          <input type="number" min="0.000000001" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/40" />
        </label>
        <button type="button" onClick={() => void depositGas()} disabled={depositing || !wallet || !isMainnetWallet || !custodyAddress.trim()} className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
          {depositing ? "等待钱包确认…" : "连接钱包并充值"}
        </button>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 p-4">
        <div className="text-xs text-zinc-500">
          {loading ? "正在读取配置…" : saved?.updated_at ? "最后更新：" + new Date(saved.updated_at).toLocaleString() : "尚未保存托管钱包配置"}
        </div>
        <button type="button" onClick={() => void saveSettings()} disabled={loading || saving || !custodyAddress.trim()} className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-40">
          {saving ? "正在保存…" : "保存钱包配置"}
        </button>
      </section>

      <p className="text-xs leading-5 text-zinc-500">
        重要：更换数据库中的钱包地址不会自动改变已部署智能合约中的不可变手续费金库，也不会迁移旧钱包余额。合约金库如需更换，必须使用合约支持的管理员链上操作；若合约不支持，则需要经过审计的新版本迁移。
      </p>
    </main>
  )
}
