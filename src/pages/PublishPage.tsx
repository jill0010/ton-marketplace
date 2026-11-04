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
  publishAttemptedAt?: number;
  transferAttemptedAt?: number;
};

export function PublishPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [tonConnectUI] = useTonConnectUI();
  const publishParams = new URLSearchParams(window.location.search);
  const adminQuickPublish = publishParams.get("adminQuick") === "1";
  const requestedAssetAddress = adminQuickPublish ? publishParams.get("asset") : null;
  const requestedPrice = adminQuickPublish ? publishParams.get("price") : null;

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
  const [price, setPrice] = useState(requestedPrice ?? "");
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
    try {
      const saved = localStorage.getItem("ton-marketplace-pending-listing-v2");
      if (!saved) return;
      const parsed = JSON.parse(saved) as PendingListing;
      if (
        parsed &&
        parsed.asset &&
        typeof parsed.productId === "string" &&
        typeof parsed.queryId === "string" &&
        typeof parsed.sellerWallet === "string" &&
        typeof parsed.marketplaceAddress === "string" &&
        typeof parsed.escrowAddress === "string" &&
        ["registration", "transfer", "sync"].includes(parsed.step)
      ) {
        setPendingListing(parsed);
      } else {
        localStorage.removeItem("ton-marketplace-pending-listing-v2");
      }
    } catch {
      localStorage.removeItem("ton-marketplace-pending-listing-v2");
    }
  }, []);

  function persistPendingListing(value: PendingListing | null) {
    setPendingListing(value);
    if (value) {
      localStorage.setItem("ton-marketplace-pending-listing-v2", JSON.stringify(value));
    } else {
      localStorage.removeItem("ton-marketplace-pending-listing-v2");
    }
  }

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

          const visibleAssets = adminQuickPublish && requestedAssetAddress
            ? validAssets.filter((item) => item.address === requestedAssetAddress)
            : validAssets;
          setAssets(visibleAssets);
          setAssetsTruncated(data.truncated === true);
          if (visibleAssets.length > 0) {
            setSelectedAddress(visibleAssets[0].address);
          } else if (adminQuickPublish && requestedAssetAddress) {
            setAssetsError("快速上传指定的 NFT 已不在当前已验证钱包中，请返回管理员页面重新核验。");
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

      const visibleAssets = adminQuickPublish && requestedAssetAddress
        ? validAssets.filter((item) => item.address === requestedAssetAddress)
        : validAssets;
      setAssets(visibleAssets);
      setAssetsTruncated(data.truncated === true);

      if (visibleAssets.length > 0) {
        setSelectedAddress(visibleAssets[0].address);
      } else if (adminQuickPublish && requestedAssetAddress) {
        setAssetsError("快速上传指定的 NFT 已不在当前已验证钱包中，请返回管理员页面重新核验。");
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

  async function runPendingListing(
    pending: PendingListing,
    requestId = ++publishRequestRef.current,
  ) {
    if (!isWalletVerified || walletVerification?.address !== pending.sellerWallet ||
        tonConnectUI.wallet?.account.address !== pending.sellerWallet ||
        tonConnectUI.wallet?.account.chain !== "-239") {
      setPublishError(t("Reconnect and verify the same seller wallet to continue.", "请重新连接并验证原上架钱包后继续。"));
      return;
    }

    const assertActive = () => {
      if (
        requestId !== publishRequestRef.current ||
        !isWalletVerified ||
        walletVerification?.address !== pending.sellerWallet ||
        tonConnectUI.wallet?.account.address !== pending.sellerWallet ||
        tonConnectUI.wallet?.account.chain !== "-239"
      ) {
        throw new Error("钱包或网络已变化。待处理上架记录已保存，请切回原钱包继续。");
      }
    };

    setPublishing(true);
    setPublishError("");
    try {
      await ensureAnonymousSession();
      let current = pending;

      if (current.step === "registration") {
        setListingMessage(t("Waiting for the Marketplace Escrow registration…", "正在等待商城 Escrow 托管登记……"));
        let registration: { escrowId: string; status: number } | null = null;

        for (let attempt = 0; attempt < 40; attempt += 1) {
          assertActive();
          const { data, error } = await anonymousSupabase.functions.invoke(
            "marketplace-v2-state",
            {
              body: {
                action: "escrow-registration",
                query_id: current.queryId,
                product_id: current.productId,
                wallet_address: current.sellerWallet,
                item_address: current.asset.address,
                collection_address: current.asset.collection_address,
                item_index: current.asset.item_index,
                kind: current.asset.type,
              },
            },
          );

          if (data?.record_matches === false) {
            throw new Error("链上托管登记与当前钱包、NFT 或商品编号不匹配。为保护 NFT，已阻止转移。");
          }
          if (
            data?.success === true &&
            data.registered === true &&
            typeof data.escrow_id === "string" &&
            /^[1-9]\d*$/.test(data.escrow_id) &&
            data.record_status === 1
          ) {
            // The NFT is already deposited. Recovery/sync must continue even
            // if the operator has since paused new listings.
            registration = { escrowId: data.escrow_id, status: data.record_status };
            break;
          }
          if (data?.listing_enabled !== true) {
            throw new Error("Marketplace V2 上架功能当前已暂停。NFT 尚未转移，待处理记录已保留。");
          }
          if (
            data?.success === true &&
            data.registered === true &&
            typeof data.escrow_id === "string" &&
            /^[1-9]\d*$/.test(data.escrow_id) &&
            data.record_status === 0
          ) {
            registration = { escrowId: data.escrow_id, status: data.record_status };
            break;
          }
          if (error && attempt === 39) {
            throw new Error(data?.error || error.message || "无法读取 Escrow 登记状态");
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }

        if (!registration) {
          // Only retry the publish message if the on-chain counters prove it
          // was never accepted. If either counter advanced, never reuse IDs.
          const { data: latest, error: stateError } = await anonymousSupabase.functions.invoke(
            "marketplace-v2-state",
            { body: { action: "next-listing-ids" } },
          );
          assertActive();
          if (
            stateError ||
            latest?.success !== true ||
            latest.listing_enabled !== true ||
            latest.next_product_id !== current.productId ||
            latest.next_query_id !== current.queryId
          ) {
            throw new Error(t(
              "The listing request may already be on-chain, but its escrow record is not visible. Keep this pending record and retry verification; do not create another listing.",
              "上架请求可能已上链，但暂未查到托管记录。请保留待处理记录并重试核验，不要重新创建上架。",
            ));
          }

          const kind = current.asset.type === "username"
            ? MarketplaceV2AssetKind.Username
            : current.asset.type === "phone_number"
            ? MarketplaceV2AssetKind.PhoneNumber
            : MarketplaceV2AssetKind.Gift;
          const retryPayload = buildPublishProductV2Payload({
            expectedProductId: BigInt(current.productId),
            queryId: BigInt(current.queryId),
            nftItem: current.asset.address,
            collection: current.asset.collection_address,
            itemIndex: BigInt(current.asset.item_index),
            kind,
            priceTon: current.price,
          });
          current = { ...current, publishAttemptedAt: Date.now() };
          persistPendingListing(current);
          await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 300,
            network: "-239",
            from: current.sellerWallet,
            messages: [{
              address: current.marketplaceAddress,
              amount: MARKETPLACE_V2_LISTING_MESSAGE_VALUE.toString(),
              payload: retryPayload,
            }],
          });

          for (let attempt = 0; attempt < 40; attempt += 1) {
            assertActive();
            const { data, error } = await anonymousSupabase.functions.invoke(
              "marketplace-v2-state",
              {
                body: {
                  action: "escrow-registration",
                  query_id: current.queryId,
                  product_id: current.productId,
                  wallet_address: current.sellerWallet,
                  item_address: current.asset.address,
                  collection_address: current.asset.collection_address,
                  item_index: current.asset.item_index,
                  kind: current.asset.type,
                },
              },
            );
            if (data?.record_matches === false) {
              throw new Error("Escrow query ID 已被其他商品占用，已阻止 NFT 转移。");
            }
            if (data?.success === true && data.registered === true &&
                typeof data.escrow_id === "string" && data.record_status === 1) {
              registration = { escrowId: data.escrow_id, status: data.record_status };
              break;
            }
            if (data?.listing_enabled !== true) {
              throw new Error("Marketplace V2 上架功能已暂停，已阻止 NFT 转移。");
            }
            if (data?.success === true && data.registered === true &&
                typeof data.escrow_id === "string" && data.record_status === 0) {
              registration = { escrowId: data.escrow_id, status: data.record_status };
              break;
            }
            if (error && attempt === 39) throw new Error(error.message);
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
          }
        }

        if (!registration) {
          throw new Error(t("Escrow registration is still pending. Your listing recovery record is saved.", "Escrow 托管登记仍在确认中，已保存恢复记录。"));
        }

        current = {
          ...current,
          escrowId: registration.escrowId,
          step: registration.status === 1 ? "sync" : "transfer",
        };
        persistPendingListing(current);
      }

      if (current.step === "transfer") {
        // Recheck the exact Escrow record and listing gate immediately before
        // transferring the NFT Item. If the gate is closed, the NFT stays with
        // the seller and the pending record remains recoverable.
        const { data: preflight, error: preflightError } =
          await anonymousSupabase.functions.invoke(
            "marketplace-v2-state",
            {
              body: {
                action: "escrow-registration",
                query_id: current.queryId,
                product_id: current.productId,
                wallet_address: current.sellerWallet,
                item_address: current.asset.address,
                collection_address: current.asset.collection_address,
                item_index: current.asset.item_index,
                kind: current.asset.type,
              },
            },
          );
        assertActive();
        if (
          preflightError ||
          preflight?.success !== true ||
          preflight.record_matches !== true ||
          preflight.registered !== true ||
          typeof preflight.escrow_id !== "string"
        ) {
          throw new Error("链上 Escrow 登记不可用或与当前商品不匹配。为保护 NFT，已阻止转移。");
        }

        if (preflight.record_status === 1) {
          // Already deposited: continue verification even if new listings
          // have been paused since the transfer was sent.
          current = { ...current, escrowId: preflight.escrow_id, step: "sync" };
          persistPendingListing(current);
        } else if (preflight.record_status === 0) {
          if (preflight.listing_enabled !== true) {
            throw new Error("Marketplace V2 上架开关已关闭。NFT 仍在卖家钱包中，未执行转移。");
          }
          current = { ...current, escrowId: preflight.escrow_id };
          if (current.transferAttemptedAt) {
            const remaining = 30000 - (Date.now() - current.transferAttemptedAt);
            if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
          }
          assertActive();

          const { data: owned, error: ownedError } = await anonymousSupabase.functions.invoke(
            "nft-wallet-assets",
            { body: { wallet_address: current.sellerWallet } },
          );
          assertActive();
          if (ownedError || owned?.success !== true || !Array.isArray(owned.items)) {
            throw new Error("无法重新确认 NFT 当前持有人，已停止转移。");
          }

          const stillOwned = owned.items.some(
            (item: NftAsset) => item.address === current.asset.address,
          );
          if (stillOwned) {
            current = { ...current, transferAttemptedAt: Date.now() };
            persistPendingListing(current);
            setListingMessage(t("Escrow registration matches this NFT. Confirm the NFT transfer in your TON mainnet wallet…", "托管登记与此 NFT 完全匹配。请在 TON 主网钱包中确认 NFT 转移……"));
            await tonConnectUI.sendTransaction({
              validUntil: Math.floor(Date.now() / 1000) + 300,
              network: "-239",
              from: current.sellerWallet,
              messages: [{
                address: current.asset.address,
                amount: MARKETPLACE_V2_NFT_TRANSFER_MESSAGE_VALUE.toString(),
                payload: buildNftEscrowTransferPayload(
                  BigInt(current.queryId),
                  current.escrowAddress,
                  current.sellerWallet,
                ),
              }],
            });
          }

          current = { ...current, step: "sync" };
          persistPendingListing(current);
        } else {
          throw new Error("Escrow 记录处于不可转移状态。为保护 NFT，已停止操作。");
        }
      }

      if (current.step === "sync") {
        setListingMessage(t("Verifying NFT escrow ownership and synchronizing the product…", "正在核实 NFT 托管所有权并同步商品目录……"));
        const retryableCodes = new Set([
          "ESCROW_NOT_CONFIRMED",
          "PUBLISH_TRANSACTION_NOT_FOUND",
          "NFT_NOT_IN_ESCROW",
        ]);

        for (let attempt = 0; attempt < 12; attempt += 1) {
          assertActive();
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
          if (data?.success === true && typeof data.product?.id === "string") {
            persistPendingListing(null);
            setListingMessage(t("NFT escrow confirmed. Your listing is live.", "NFT 托管已确认，商品已成功上架。"));
            navigate(`/product/${data.product.id}`);
            return;
          }
          if (typeof data?.code === "string" && retryableCodes.has(data.code)) {
            await new Promise((resolve) => window.setTimeout(resolve, 5000));
            continue;
          }
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : error?.message || "链上 NFT 托管核验失败。",
          );
        }

        throw new Error(t(
          "The NFT transfer was submitted, but the escrow callback is still pending. Your recovery record is saved; retry verification later and do not send the NFT again.",
          "NFT 转移已提交，但托管回调仍在确认。恢复记录已保存，请稍后重试核验，不要再次发送 NFT。",
        ));
      }
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "NFT listing failed.");
    } finally {
      if (requestId === publishRequestRef.current) setPublishing(false);
    }
  }

  async function handlePublish() {
    if (!isWalletVerified || !walletVerification || !selectedAsset || !validPrice ||
        publishing || pendingListing) return;

    const sellerWallet = walletVerification.address;
    const wallet = tonConnectUI.wallet;
    if (!wallet || wallet.account.address !== sellerWallet || wallet.account.chain !== "-239") {
      setPublishError("当前连接的钱包与已验证的 TON 主网钱包不一致。");
      return;
    }

    const requestId = ++publishRequestRef.current;
    setPublishing(true);
    setPublishError("");
    setListingMessage(t("Checking Marketplace V2 deployment readiness…", "正在检查 Marketplace V2 部署状态……"));

    try {
      await ensureAnonymousSession();
      const { data: state, error: stateError } = await anonymousSupabase.functions.invoke(
        "marketplace-v2-state",
        { body: { action: "next-listing-ids" } },
      );
      if (stateError) throw new Error(state?.error || stateError.message || "Unable to read Marketplace V2 state");
      if (state?.success !== true || typeof state.marketplace_address !== "string" ||
          typeof state.escrow_address !== "string" || typeof state.next_product_id !== "string" ||
          typeof state.next_query_id !== "string") {
        throw new Error(typeof state?.error === "string" ? state.error : "Marketplace V2 mainnet contracts are not configured.");
      }
      if (state.listing_enabled !== true) {
        throw new Error(t("Marketplace V2 NFT listing is paused until deployment and testnet rehearsal are approved.", "Marketplace V2 尚未完成部署及测试网验收，NFT 上架仍处于关闭状态。"));
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
      const pending: PendingListing = {
        asset: selectedAsset,
        productId: productId.toString(),
        queryId: queryId.toString(),
        escrowId: "0",
        price: price.trim(),
        description: description.trim(),
        marketplaceAddress: state.marketplace_address,
        escrowAddress: state.escrow_address,
        sellerWallet,
        step: "registration",
        publishAttemptedAt: Date.now(),
        transferAttemptedAt: undefined,
      };

      // Persist the identifiers before opening the wallet so a reload cannot
      // orphan a listing that was already accepted by Marketplace V2.
      setPendingListing(pending);
      localStorage.setItem("ton-marketplace-pending-listing-v2", JSON.stringify(pending));

      const payload = buildPublishProductV2Payload({
        expectedProductId: productId,
        queryId,
        nftItem: selectedAsset.address,
        collection: selectedAsset.collection_address,
        itemIndex: BigInt(selectedAsset.item_index),
        kind,
        priceTon: pending.price,
      });
      setListingMessage(t("Confirm the Marketplace V2 listing request in your TON mainnet wallet…", "请在 TON 主网钱包中确认 Marketplace V2 上架请求……"));
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: "-239",
        from: sellerWallet,
        messages: [{
          address: pending.marketplaceAddress,
          amount: MARKETPLACE_V2_LISTING_MESSAGE_VALUE.toString(),
          payload,
        }],
      });
      if (requestId !== publishRequestRef.current) return;
      await runPendingListing(pending, requestId);
    } catch (error) {
      if (requestId === publishRequestRef.current) {
        setPublishError(error instanceof Error ? error.message : "NFT listing failed.");
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
                  <span className="inline-flex items-center gap-1.5"><GramTokenMark className="h-4 w-4" />{t("Price (GRAM)", "售价（GRAM）")}</span>
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

              {!adminQuickPublish && (
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
              )}

              {publishError && (
                <p className="text-sm text-red-300">{publishError}</p>
              )}

              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={publishing || Boolean(pendingListing) || !validPrice}
                className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {publishing
                  ? t("Processing…", "处理中……")
                  : t("Publish with on-chain escrow", "链上托管并上架")}
              </button>

              {pendingListing && (
                <button
                  type="button"
                  onClick={() => void runPendingListing(pendingListing)}
                  disabled={publishing}
                  className="w-full rounded-full border border-amber-400/30 px-5 py-3 text-sm font-medium text-amber-200 disabled:opacity-50"
                >
                  {pendingListing.step === "registration"
                    ? t("Retry Escrow registration check", "重试 Escrow 登记检查")
                    : pendingListing.step === "transfer"
                      ? t("Continue NFT escrow transfer", "继续 NFT 托管转账")
                      : t("Retry on-chain listing verification", "重试链上上架核验")}
                </button>
              )}

              {listingMessage && (
                <p role="status" className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-zinc-300">
                  {listingMessage}
                </p>
              )}

              <p className="text-xs leading-5 text-zinc-500">
                {t(
                  "The listing is only published after Marketplace V2 confirms escrow registration, NFT ownership transfer, and database verification.",
                  "只有 Marketplace V2 确认托管登记、NFT 所有权转移和数据库核验后，商品才会公开上架。",
                )}
              </p>

            </section>
          )}
        </>
      )}
    </div>
  );
}

