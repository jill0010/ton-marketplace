import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TonConnectButton } from "@tonconnect/ui-react";
import { anonymousSupabase, ensureAnonymousSession } from "../lib/supabase.ts";
import { useLanguage } from "../lib/useLanguage.ts";
import { useVerifiedTonWallet } from "../hooks/useVerifiedTonWallet.ts";

type NftAsset = {
  address: string;
  collection_address: string;
  type: "username" | "phone_number" | "gift";
  name: string;
  description: string;
  image_url: string | null;
};

export function PublishPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

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

  async function handlePublish() {
    if (!isWalletVerified || !selectedAsset || !validPrice || publishing) {
      return;
    }

    const requestId = ++publishRequestRef.current;
    const publishWalletAddress = walletAddress;

    setPublishing(true);
    setPublishError("");

    try {
      await ensureAnonymousSession();

      if (
        requestId !== publishRequestRef.current ||
        walletAddress !== publishWalletAddress ||
        !isWalletVerified
      ) {
        return;
      }

      const { data, error } = await anonymousSupabase.functions.invoke(
        "publish-nft-product",
        {
          body: {
            item_address: selectedAsset.address,
            price: priceNumber,
            description: description.trim(),
          },
        },
      );

      if (
        requestId !== publishRequestRef.current ||
        walletAddress !== publishWalletAddress ||
        !isWalletVerified
      ) {
        return;
      }

      if (error) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : error.message || "商品发布失败",
        );
      }

      if (
        data?.success !== true ||
        typeof data.product?.id !== "string"
      ) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "服务器没有返回有效的商品编号",
        );
      }

      navigate(`/product/${data.product.id}`);
    } catch (error) {
      if (requestId === publishRequestRef.current) {
        setPublishError(
          error instanceof Error ? error.message : "商品发布失败，请稍后重试。",
        );
      }
    } finally {
      if (requestId === publishRequestRef.current) {
        setPublishing(false);
      }
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
                  {t("Price (TON)", "售价（TON）")}
                </label>
                <input
                  id="publish-price"
                  type="number"
                  min="0.000000001"
                  max="1000000000"
                  step="any"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder={t("Enter price in TON", "请输入 TON 售价")}
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
                  "NFT listing is paused until escrow deposit and on-chain confirmation are implemented.",
                  "NFT 发布功能暂时关闭，待 NFT 托管入库及链上确认流程完成后开放。",
                )}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

