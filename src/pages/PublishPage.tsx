import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TonConnectButton, useTonConnectUI } from "@tonconnect/ui-react";
import {
  buildNftEscrowTransferPayload,
  buildPublishProductV2Payload,
  MARKETPLACE_V2_LISTING_MESSAGE_VALUE,
  MARKETPLACE_V2_NFT_TRANSFER_MESSAGE_VALUE,
  MarketplaceV2AssetKind,
} from "../lib/marketplaceV2.ts";
import { anonymousSupabase, ensureAnonymousSession } from "../lib/supabase.ts";
import { useLanguage } from "../lib/useLanguage.ts";
import { useVerifiedTonWallet } from "../hooks/useVerifiedTonWallet.ts";

type NftAsset = {
  address: string;
  collection_address: string;
  item_index: string;
  type: "username" | "phone_number" | "gift";
  name: string;
  description: string;
  image_url: string | null;
};

type PendingListing = {
  asset: NftAsset;
  productId: string;
  queryId: string;
  escrowId: string;
  price: string;
  description: string;
  marketplaceAddress: string;
  escrowAddress: string;
  sellerWallet: string;
  step: "registration" | "transfer" | "sync";
};

export function PublishPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [tonConnectUI] = useTonConnectUI();

  const {
    walletAddress,
    connecting,
    verifying,
    walletVerification,
    proofMessage,
    isWalletVerified,
    connectAndVerifyWallet,
  } = useVerifiedTonWallet();

  const [assets, setAssets] = useState<NftAsset[]>([]);
  const [assetsTruncated, setAssetsTruncated] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [listingMessage, setListingMessage] = useState("");
  const [pendingListing, setPendingListing] = useState<PendingListing | null>(null);
  const assetsRequestRef = useRef(0);
  const publishRequestRef = useRef(0);

  useEffect(() => {
    publishRequestRef.current += 1;
    setPublishing(false);

    return () => {
      publishRequestRef.current += 1;
    };
  }, [walletAddress, isWalletVerified]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++assetsRequestRef.current;

    async function loadAssets() {
      if (!isWalletVerified || !walletAddress) {
        setAssets([]);
        setSelectedAddress("");
        setAssetsError("");
        setAssetsLoading(false);
        return;
      }

      setAssetsLoading(true);
      setAssetsTruncated(false);
      setAssetsError("");
      setAssets([]);
      setSelectedAddress("");

      try {
        await ensureAnonymousSession();

        const { data, error } = await anonymousSupabase.functions.invoke(
          "nft-wallet-assets",
          { body: { wallet_address: walletAddress } },
        );

        if (error) {
          throw new Error(error.message || "读取 NFT 失败");
        }

        if (data?.success !== true || !Array.isArray(data.items)) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "服务器返回的 NFT 数据格式不正确",
          );
        }

        if (!cancelled && requestId === assetsRequestRef.current) {
          const validAssets = data.items.filter(
            (item: NftAsset) =>
              typeof item.address === "string" &&
              typeof item.collection_address === "string" &&
              typeof item.item_index === "string" &&
              /^\d+$/.test(item.item_index) &&
              ["username", "phone_number", "gift"].includes(item.type),
          ) as NftAsset[];

          setAssets(validAssets);
          setAssetsTruncated(data.truncated === true);
          if (validAssets.length > 0) {
            setSelectedAddress(validAssets[0].address);
          }
        }
      } catch (error) {
        if (!cancelled && requestId === assetsRequestRef.current) {
          setAssetsError(
            error instanceof Error
              ? error.message
              : "读取 NFT 失败，请稍后重试。",
          );
        }
      } finally {
        if (!cancelled && requestId === assetsRequestRef.current) {
          setAssetsLoading(false);
        }
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
      assetsRequestRef.current += 1;
    };
  }, [isWalletVerified, walletAddress]);

  async function refreshAssets() {
    if (!isWalletVerified || !walletAddress) return;

    const requestId = ++assetsRequestRef.current;

    setAssetsError("");
    setAssets([]);
    setSelectedAddress("");
    setAssetsLoading(true);
      setAssetsTruncated(false);

    try {
      await ensureAnonymousSession();

      if (requestId !== assetsRequestRef.current) return;

      const { data, error } = await anonymousSupabase.functions.invoke(
        "nft-wallet-assets",
        { body: { wallet_address: walletAddress } },
      );

      if (requestId !== assetsRequestRef.current) return;

      if (error || data?.success !== true || !Array.isArray(data.items)) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : error?.message || "读取 NFT 失败",
        );
      }

      const validAssets = data.items.filter(
        (item: NftAsset) =>
          typeof item.address === "string" &&
          typeof item.collection_address === "string" &&
          typeof item.item_index === "string" &&
          /^\d+$/.test(item.item_index) &&
          ["username", "phone_number", "gift"].includes(item.type),
      ) as NftAsset[];

      setAssets(validAssets);
          setAssetsTruncated(data.truncated === true);

      if (validAssets.length > 0) {
        setSelectedAddress(validAssets[0].address);
      }
    } catch (error) {
      if (requestId === assetsRequestRef.current) {
        setAssetsError(
          error instanceof Error ? error.message : "读取 NFT 失败",
        );
      }
    } finally {
      if (requestId === assetsRequestRef.current) {
        setAssetsLoading(false);
      }
    }
  }

  const selectedAsset = assets.find(
    (item) => item.address === selectedAddress,
  );

  const priceNumber = Number(price);

  const validPrice = price.trim() !== "" &&
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    priceNumber <= 1000000000;

  async function runPendingListing(pending: PendingListing) {
    if (!isWalletVerified || walletAddress !== pending.sellerWallet) {
      setPublishError(t("Reconnect and verify the same seller wallet to continue.", "请重新连接并验证原上架钱包后继续。"));
      return;
    }
    setPublishing(true);
    setPublishError("");
    try {
      await ensureAnonymousSession();
      let current = pending;

      if (current.step === "registration") {
        setListingMessage(t("Waiting for the Marketplace Escrow registration…", "正在等待商城 Escrow 托管登记……"));
        let escrowId = "";
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const { data, error } = await anonymousSupabase.functions.invoke(
            "marketplace-v2-state",
            { body: { action: "escrow-registration", query_id: current.queryId } },
          );
          if (error) throw new Error(error.message || "无法读取 Escrow 登记状态");
          if (data?.success === true && data.registered === true &&
              typeof data.escrow_id === "string" && /^[1-9]\d*$/.test(data.escrow_id)) {
            escrowId = data.escrow_id;
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
        if (!escrowId) throw new Error(t("Escrow registration is not visible yet. Retry this check; do not create another listing.", "暂未查到 Escrow 登记。请重试此检查，不要重新创建上架请求。"));
        current = { ...current, escrowId, step: "transfer" };
        setPendingListing(current);
      }

      if (current.step === "transfer") {
        setListingMessage(t("Confirm the NFT transfer to Marketplace Escrow in your wallet…", "请在钱包中确认将 NFT 转入商城托管合约……"));
        const { data: owned, error: ownedError } = await anonymousSupabase.functions.invoke(
          "nft-wallet-assets",
          { body: { wallet_address: current.sellerWallet } },
        );
        if (ownedError || owned?.success !== true || !Array.isArray(owned.items)) {
          throw new Error("Unable to re-check NFT ownership before escrow transfer.");
        }
        const stillOwned = owned.items.some((item: NftAsset) => item.address === current.asset.address);
        if (!stillOwned) {
          current = { ...current, step: "sync" };
          setPendingListing(current);
        } else {
          const transferPayload = buildNftEscrowTransferPayload(
            BigInt(current.queryId),
            current.escrowAddress,
            current.sellerWallet,
          );
          await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 300,
            messages: [{
              address: current.asset.address,
              amount: MARKETPLACE_V2_NFT_TRANSFER_MESSAGE_VALUE.toString(),
              payload: transferPayload,
            }],
          });
          current = { ...current, step: "sync" };
          setPendingListing(current);
        }
      }

      if (current.step === "sync") {
        setListingMessage(t("Verifying NFT escrow ownership and synchronizing the product…", "正在核实 NFT 托管所有权并同步商品目录……"));
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const { data, error } = await anonymousSupabase.functions.invoke(
          "publish-nft-product",
          {
            body: {
              wallet_address: current.sellerWallet,
              item_address: current.asset.address,
              collection_address: current.asset.collection_address,
              item_index: current.asset.item_index,
              kind: current.asset.type,
              price: current.price,
              name: current.asset.name,
              description: current.description,
              image_url: current.asset.image_url,
              product_id: current.productId,
              query_id: current.queryId,
              escrow_id: current.escrowId,
            },
          },
        );
        if (error || data?.success !== true || typeof data.product?.id !== "string") {
          throw new Error(typeof data?.error === "string" ? data.error : error?.message || "On-chain escrow verification is still pending. Retry verification; do not transfer the NFT again.");
        }
        setPendingListing(null);
        setListingMessage(t("NFT escrow confirmed. Your listing is live.", "NFT 托管已确认，商品已成功上架。"));
        navigate(`/product/${data.product.id}`);
      }
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "NFT listing failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function handlePublish() {
    if (!isWalletVerified || !walletAddress || !selectedAsset || !validPrice ||
        publishing || pendingListing) return;
    const sellerWallet = walletAddress;
    setPublishing(true);
    setPublishError("");
    setListingMessage(t("Checking Marketplace V2 deployment readiness…", "正在检查 Marketplace V2 部署状态……"));
    try {
      await ensureAnonymousSession();
      const { data: state, error: stateError } = await anonymousSupabase.functions.invoke(
        "marketplace-v2-state",
        { body: { action: "next-listing-ids" } },
      );
      if (stateError) throw new Error(stateError.message || "Unable to read Marketplace V2 state");
      if (state?.success !== true || typeof state.marketplace_address !== "string" ||
          typeof state.escrow_address !== "string" || typeof state.next_product_id !== "string" ||
          typeof state.next_query_id !== "string") {
        throw new Error(typeof state?.error === "string" ? state.error : "Marketplace V2 mainnet contracts are not configured.");
      }
      if (state.escrow_configured !== true || state.treasury_configured !== true) {
        throw new Error(t("Marketplace V2 Escrow and platform treasury must both be configured before listing.", "上架前必须完成 Marketplace V2 Escrow 和平台金库配置。"));
      }

      const kind = selectedAsset.type === "username"
        ? MarketplaceV2AssetKind.Username
        : selectedAsset.type === "phone_number"
          ? MarketplaceV2AssetKind.PhoneNumber
          : MarketplaceV2AssetKind.Gift;
      const productId = BigInt(state.next_product_id);
      const queryId = BigInt(state.next_query_id);
      const payload = buildPublishProductV2Payload({
        expectedProductId: productId,
        queryId,
        nftItem: selectedAsset.address,
        collection: selectedAsset.collection_address,
        itemIndex: BigInt(selectedAsset.item_index),
        kind,
        priceTon: price,
      });
      setListingMessage(t("Confirm the Marketplace V2 listing request in your wallet…", "请在钱包中确认 Marketplace V2 上架请求……"));
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: state.marketplace_address,
          amount: MARKETPLACE_V2_LISTING_MESSAGE_VALUE.toString(),
          payload,
        }],
      });
      const pending: PendingListing = {
        asset: selectedAsset,
        productId: productId.toString(),
        queryId: queryId.toString(),
        escrowId: "0",
        price,
        description: description.trim(),
        marketplaceAddress: state.marketplace_address,
        escrowAddress: state.escrow_address,
        sellerWallet,
        step: "registration",
      };
      setPendingListing(pending);
      await runPendingListing(pending);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "NFT listing failed.");
      setPublishing(false);
    }
  }

  function getAssetTypeLabel(type: NftAsset["type"]) {
    if (type === "username") {
      return t("Collectible Username", "收藏用户名");
    }

    if (type === "phone_number") {
      return t("Collectible Number", "+888 收藏号码");
    }

    return t("Collectible Gift", "收藏礼物");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          to="/"
          className="text-sm text-zinc-500 hover:text-white"
        >
          {t("Back to Home", "返回首页")}
        </Link>

        <h1 className="text-3xl font-semibold text-white">
          {t("Publish NFT", "发布 NFT 商品")}
        </h1>

        <p className="text-sm leading-6 text-zinc-400">
          {t(
            "Connect and verify your TON mainnet wallet to list eligible Telegram collectibles.",
            "连接并验证 TON 主网钱包，发布符合条件的 Telegram 官方收藏品。",
          )}
        </p>
      </div>

      <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-white">
            {t("Wallet Verification", "钱包身份验证")}
          </h2>

          {isWalletVerified
            ? (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                {t("Verified", "已验证")}
              </span>
            )
            : (
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                {t("Not Verified", "尚未验证")}
              </span>
            )}
        </div>

        {!walletAddress
          ? (
            <button
              type="button"
              onClick={() => void connectAndVerifyWallet()}
              disabled={connecting || verifying}
              className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-50"
            >
              {connecting
                ? t("Connecting...", "正在连接...")
                : t("Connect TON Wallet", "连接 TON 钱包")}
            </button>
          )
          : (
            <div className="space-y-3">
              <div className="break-all rounded-xl bg-black/20 p-3 text-xs text-zinc-400">
                {walletAddress}
              </div>

              <TonConnectButton />

              {!isWalletVerified && (
                <button
                  type="button"
                  onClick={() => void connectAndVerifyWallet()}
                  disabled={connecting || verifying}
                  className="w-full rounded-full border border-white/20 px-5 py-3 text-sm text-white disabled:opacity-50"
                >
                  {verifying ? t("Verifying...", "正在验证...") : t(
                    "Reconnect and Verify Wallet",
                    "重新连接并验证钱包",
                  )}
                </button>
              )}

              {isWalletVerified && walletVerification && (
                <p className="text-xs text-emerald-300">
                  {t("TON mainnet wallet verified.", "TON 主网钱包验证通过。")}
                  {" "}
                  {walletVerification.walletVersion}
                </p>
              )}
            </div>
          )}

        {proofMessage && (
          <p className="whitespace-pre-wrap text-sm text-zinc-400">
            {proofMessage}
          </p>
        )}

        <p className="text-xs leading-5 text-zinc-500">
          {t(
            "Only TON mainnet wallets with successful server-side proof verification can publish.",
            "只有通过服务器签名验证的 TON 主网钱包才能发布商品。",
          )}
        </p>
      </section>

      {isWalletVerified && (
        <>
          <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium text-white">
                {t("Your Telegram Collectibles", "我的 Telegram 收藏品")}
              </h2>

              <button
                type="button"
                disabled={assetsLoading}
                onClick={() => void refreshAssets()}
                className="text-sm text-zinc-400 underline disabled:opacity-50"
              >
                {t("Refresh", "刷新")}
              </button>
            </div>

            {assetsLoading && (
              <p className="text-sm text-zinc-400">
                {t("Loading wallet assets...", "正在读取钱包 NFT...")}
              </p>
            )}
            {assetsTruncated && (
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm leading-6 text-amber-200">
                {t(
                  "This wallet contains more NFTs than the current retrieval limit. The list may be incomplete.",
                  "当前钱包 NFT 数量超过本次读取上限，显示的收藏品列表可能不完整。",
                )}
              </p>
            )}


            {assetsError && (
              <p className="text-sm text-red-300">{assetsError}</p>
            )}

            {!assetsLoading && !assetsError && assets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-zinc-400">
                {t(
                  "No approved Telegram collectibles were found in this wallet. Only collections verified and enabled by the marketplace can be listed.",
                  "钱包中暂未发现符合发布条件的 Telegram 官方收藏品。只有经过商城核验并启用的官方 NFT 集合才能发布。",
                )}
              </div>
            )}

            {assets.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {assets.map((asset) => {
                  const selected = selectedAddress === asset.address;

                  return (
                    <button
                      key={asset.address}
                      type="button"
                      onClick={() => setSelectedAddress(asset.address)}
                      className={`overflow-hidden rounded-2xl border text-left transition ${
                        selected
                          ? "border-emerald-400 bg-emerald-400/5"
                          : "border-white/10 bg-black/10 hover:border-white/30"
                      }`}
                    >
                      {asset.image_url
                        ? (
                          <div className="aspect-square w-full overflow-hidden bg-black/20">
                            <img
                              src={asset.image_url}
                              alt={asset.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )
                        : (
                          <div className="flex aspect-square items-center justify-center bg-black/20 text-sm text-zinc-500">
                            {t("No image", "暂无图片")}
                          </div>
                        )}

                      <div className="space-y-2 p-3">
                        <p className="text-xs text-emerald-300">
                          {getAssetTypeLabel(asset.type)}
                        </p>
                        <p className="break-words text-sm font-medium text-white">
                          {asset.name}
                        </p>
                        <p className="break-all text-xs text-zinc-500">
                          {asset.address}
                        </p>
                        {selected && (
                          <p className="text-xs text-emerald-300">
                            {t("Selected", "已选择")}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {selectedAsset && (
            <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-lg font-medium text-white">
                {t("Listing Details", "商品发布信息")}
              </h2>

              <div className="space-y-2">
                <label className="block text-sm text-zinc-300">
                  {t("Selected NFT", "已选择的 NFT")}
                </label>
                <div className="rounded-xl bg-black/20 p-3 text-sm text-white">
                  {selectedAsset.name}
                  <p className="mt-1 break-all text-xs text-zinc-500">
                    {selectedAsset.address}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="publish-price"
                  className="block text-sm text-zinc-300"
                >
                  {t("Price (GRAM)", "售价（GRAM）")}
                </label>
                <input
                  id="publish-price"
                  type="number"
                  min="0.000000001"
                  max="1000000000"
                  step="any"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder={t("Enter price in GRAM", "请输入 GRAM 售价")}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="publish-description"
                  className="block text-sm text-zinc-300"
                >
                  {t("Description (Optional)", "商品描述（选填）")}
                </label>
                <textarea
                  id="publish-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder={t(
                    "Describe your collectible...",
                    "填写商品介绍...",
                  )}
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                />
                <p className="text-right text-xs text-zinc-500">
                  {description.length}/2000
                </p>
              </div>

              {publishError && (
                <p className="text-sm text-red-300">{publishError}</p>
              )}

              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled

                className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("Temporarily Unavailable", "暂未开放发布")}
              </button>

              <p className="text-xs leading-5 text-zinc-500">
                {t(
                  "NFT listing remains paused until Marketplace V2 is deployed and wallet-to-contract-to-database synchronization is verified.",
                  "Marketplace V2 合约部署及钱包、合约、数据库同步验证完成前，NFT 发布功能保持关闭。",
                )}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

