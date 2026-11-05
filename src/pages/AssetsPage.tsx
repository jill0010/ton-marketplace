import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { GramTokenMark } from "../components/GramTokenMark"
import { anonymousSupabase, ensureAnonymousSession } from "../lib/supabase"
import { useLanguage } from "../lib/useLanguage"

type AssetType = "username" | "phone_number" | "gift"
type NftAsset = {
  address: string
  collection_address: string
  type: AssetType
  name: string
  description: string
  image_url: string | null
}

type ListingMode = "auction" | "sale"

const ESCROW_ADDRESS = "UQC5nJds9rVxaDKAT-lQeJOzBlVXRj79xqUJ2k1eN4cLdWph"

export function AssetsPage() {
  const { t } = useLanguage()
  const walletAddress = useTonAddress()
  const wallet = useTonWallet()
  const [tonConnectUI] = useTonConnectUI()
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<NftAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [truncated, setTruncated] = useState(false)
  const [mode, setMode] = useState<ListingMode | null>(null)
  const [selected, setSelected] = useState<NftAsset | null>(null)
  const [minimumBid, setMinimumBid] = useState("")
  const [maximumBid, setMaximumBid] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [notice, setNotice] = useState("")

  const selectedType = searchParams.get("type")
  const filteredAssets = useMemo(
    () => assets.filter((asset) =>
      selectedType === "phone_number" || selectedType === "gift" || selectedType === "username"
        ? asset.type === selectedType
        : true
    ),
    [assets, selectedType],
  )

  async function loadAssets() {
    if (!walletAddress) {
      setAssets([])
      return
    }

    if (wallet?.account.chain !== "-239") {
      setAssets([])
      setError(t("Switch your connected wallet to TON Mainnet to read its assets.", "请将已连接的钱包切换到 TON 主网后再读取资产。"))
      return
    }

    setLoading(true)
    setError("")
    setNotice("")
    try {
      await ensureAnonymousSession()
      const { data, error: invokeError } = await anonymousSupabase.functions.invoke(
        "nft-wallet-assets",
        { body: { wallet_address: walletAddress } },
      )
      if (invokeError) throw new Error(invokeError.message || "读取钱包资产失败")
      if (data?.success !== true || !Array.isArray(data.items)) {
        throw new Error(typeof data?.error === "string" ? data.error : "钱包资产返回格式错误")
      }
      const valid = data.items.filter((item: NftAsset) =>
        typeof item.address === "string" &&
        typeof item.collection_address === "string" &&
        ["username", "phone_number", "gift"].includes(item.type)
      )
      setAssets(valid)
      setTruncated(data.truncated === true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取钱包资产失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAssets()
    // Load public on-chain NFT holdings as soon as TON Connect provides the wallet address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, wallet?.account.chain])

  function openListing(asset: NftAsset, nextMode: ListingMode) {
    setSelected(asset)
    setMode(nextMode)
    setMinimumBid("")
    setMaximumBid("")
    setSalePrice("")
    setNotice("")
  }

  const validAmount = (value: string) => /^\d+(\.\d{1,9})?$/.test(value) && Number(value) > 0

  function submitListingIntent() {
    if (!selected || !mode) return
    if (mode === "auction" && (!validAmount(minimumBid) || (maximumBid && (!validAmount(maximumBid) || Number(maximumBid) < Number(minimumBid))))) {
      setNotice(t("Enter a valid minimum bid. The maximum bid is optional and must not be below the minimum.", "请输入有效的最低出价。最高出价为选填，且不能低于最低出价。"))
      return
    }
    if (mode === "sale" && !validAmount(salePrice)) {
      setNotice(t("Enter a valid sale price.", "请输入有效的出售价格。"))
      return
    }
    setNotice(t(
      "Your price details are ready, but secure NFT escrow deposits are not enabled yet. No wallet transaction has been sent and your NFT remains in your wallet.",
      "价格信息已填写，但安全 NFT 托管功能尚未开放。系统没有发起钱包交易，您的 NFT 仍保留在自己的钱包中。"
    ))
  }

  function typeLabel(type: AssetType) {
    if (type === "username") return t("Usernames", "用户名")
    if (type === "phone_number") return t("Collectible Numbers", "收藏号码")
    return t("Gifts", "礼物")
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{t("Wallet portfolio", "钱包资产")}</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{t("My Assets", "我的资产")}</h1>
          <p className="mt-2 text-sm text-zinc-400">{t("Official Telegram collectibles held by your connected TON wallet.", "自动读取当前连接 TON 钱包持有的 Telegram 官方收藏品。")}</p>
        </div>
        {walletAddress && (
          <button type="button" onClick={() => void loadAssets()} disabled={loading} className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">
            {loading ? t("Refreshing…", "正在刷新…") : t("Refresh assets", "刷新资产")}
          </button>
        )}
      </div>

      {!walletAddress && (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-medium text-white">{t("Connect your TON wallet", "连接 TON 钱包")}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t("Connect your TON wallet to automatically load its public NFT assets.", "连接 TON 钱包后，系统将自动读取该地址的公开 NFT 资产。")}</p>
          <button type="button" onClick={() => void tonConnectUI.openModal()} className="mt-5 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {t("Connect wallet", "连接钱包")}
          </button>
        </section>
      )}

      {walletAddress && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
            {([
              ["username", t("Usernames", "用户名")],
              ["phone_number", t("Collectible Numbers", "收藏号码")],
              ["gift", t("Gifts", "礼物")],
            ] as const).map(([type, label]) => (
              <button key={type} type="button" onClick={() => setSearchParams(type === selectedType ? {} : { type })} className={`rounded-xl border px-3 py-3 text-sm transition ${selectedType === type ? "border-sky-400 bg-sky-400/10 text-white" : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25"}`}>
                {label}
                <span className="ml-2 text-xs text-zinc-500">{assets.filter((asset) => asset.type === type).length}</span>
              </button>
            ))}
          </div>

          {truncated && <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{t("The wallet asset list reached the retrieval limit and may be incomplete.", "钱包资产数量达到读取上限，当前列表可能不完整。")}</p>}
          {loading && <p className="text-sm text-zinc-400">{t("Loading wallet assets…", "正在读取钱包资产…")}</p>}
          {error && <p className="rounded-xl border border-red-500/20 p-4 text-sm text-red-300">{error}</p>}
          {!loading && !error && filteredAssets.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
              {t("No eligible assets found in this category.", "此分类中没有找到符合条件的资产。")}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAssets.map((asset) => (
              <article key={asset.address} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="aspect-square bg-black/20">
                  {asset.image_url ? <img src={asset.image_url} alt={asset.name} loading="lazy" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-zinc-500">TON NFT</div>}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-xs text-sky-300">{typeLabel(asset.type)}</p>
                    <h2 className="mt-1 break-words font-semibold text-white">{asset.name}</h2>
                    <p className="mt-1 break-all text-[11px] text-zinc-500">{asset.address}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openListing(asset, "auction")} className="rounded-xl bg-sky-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-400">
                      {t("Auction", "拍卖")}
                    </button>
                    <button type="button" onClick={() => openListing(asset, "sale")} className="rounded-xl border border-sky-400/40 px-3 py-2.5 text-sm font-semibold text-sky-300 hover:bg-sky-400/10">
                      {t("Sell", "出售")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-zinc-500">{t("Only verified official Telegram collections supported by the marketplace are shown.", "这里只显示商城已核验并支持的 Telegram 官方 NFT 集合。")} <Link to="/" className="text-sky-400 hover:underline">{t("Back to marketplace", "返回商城")}</Link></p>

      {selected && mode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="asset-listing-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-white/10 bg-[#151c26] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-sky-300">{typeLabel(selected.type)}</p>
                <h2 id="asset-listing-title" className="mt-1 text-xl font-semibold text-white">{mode === "auction" ? t("Create auction", "发起拍卖") : t("Set sale price", "设置出售价格")}</h2>
                <p className="mt-1 text-sm text-zinc-400">{selected.name}</p>
              </div>
              <button type="button" onClick={() => setMode(null)} aria-label="Close" className="rounded-full px-3 py-1 text-xl text-zinc-400 hover:bg-white/10">×</button>
            </div>

            {mode === "auction" ? (
              <div className="space-y-3">
                <label className="block space-y-2 text-sm text-zinc-300">
                  <span className="inline-flex items-center gap-1.5"><GramTokenMark className="h-4 w-4" />{t("Minimum bid", "最低出价")}</span>
                  <input inputMode="decimal" value={minimumBid} onChange={(event) => setMinimumBid(event.target.value)} placeholder="0.1" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="block space-y-2 text-sm text-zinc-300">
                  <span className="inline-flex items-center gap-1.5"><GramTokenMark className="h-4 w-4" />{t("Maximum bid (optional)", "最高出价（选填）")}</span>
                  <input inputMode="decimal" value={maximumBid} onChange={(event) => setMaximumBid(event.target.value)} placeholder={t("No maximum", "不设最高价")} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-sky-400" />
                </label>
              </div>
            ) : (
              <label className="block space-y-2 text-sm text-zinc-300">
                <span className="inline-flex items-center gap-1.5"><GramTokenMark className="h-4 w-4" />{t("Sale price", "出售价格")}</span>
                <input inputMode="decimal" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="1.0" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-sky-400" />
              </label>
            )}

            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
              <p className="font-semibold">{t("Escrow transfer is not active yet", "托管转移功能尚未开放")}</p>
              <p className="mt-1">{t("The configured destination supplied for this project is:", "项目当前提供的托管目标地址为：")}</p>
              <p className="mt-1 break-all font-mono">{ESCROW_ADDRESS}</p>
              <p className="mt-2">{t("This address has not been verified as the deployed per-NFT escrow contract. No transfer or wallet password request will be triggered from this screen.", "该地址尚未核实为已部署的逐 NFT 托管合约。本页面不会发起转移，也不会要求钱包密码。")}</p>
            </div>

            {notice && <p className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-sm leading-5 text-sky-200">{notice}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setMode(null)} className="flex-1 rounded-full border border-white/15 px-4 py-3 text-sm text-zinc-300">{t("Cancel", "取消")}</button>
              <button type="button" onClick={submitListingIntent} className="flex-1 rounded-full bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-400">{t("Review price", "确认价格信息")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
