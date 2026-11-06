// Fail-closed deployment preflight for experimental V3.
// Static source check is a blocker, NOT an audit or chain proof.
// Do not inject mnemonic, RPC key, or send any transactions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const contractPath = fileURLToPath(new URL("../contracts/TestReserveVault.tolk", import.meta.url));
const marketplacePath = fileURLToPath(new URL("../contracts/MarketplaceV2.tolk", import.meta.url));
const escrowPath = fileURLToPath(new URL("../contracts/NFTEscrowV2.tolk", import.meta.url));
export function inspectV3TestnetReadiness(source, marketplaceSource = "", escrowSource = "") {
  if (typeof source !== "string" || !source.includes("contract TestReserveVault")) {
    throw new TypeError("Missing experimental V3 vault contract");
  }
  const retry = source.match(/RetryTestReserve\s*=>\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const ownerAttestationOnly = retry.includes("returnEvidenceHash") &&
    !retry.includes("throw 706;") && !retry.includes("independentVerifiedReturn");
  const receipt = source.match(/ConfirmTestReserveReceipt\s*=>\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const ownerAttestedReceipt = receipt.includes("receiptHash") &&
    !receipt.includes("independentVerifiedReceipt");
  // Inspect the actual V2 implementation, not legacy V1. Presence is not a security proof.
  // Full purchase/delivery/payout still requires end-to-end contract tests and audit.
  const hasPurchaseHandler = marketplaceSource.includes("| BuyProductV2") && marketplaceSource.includes("BuyProductV2 =>");
  const hasNftReleaseHandler = escrowSource.includes("| ReleaseEscrowV2") && escrowSource.includes("ReleaseEscrowV2 =>");
  const hasSettlementHandler = marketplaceSource.includes("| EscrowReleasedV2") && marketplaceSource.includes("EscrowReleasedV2 =>") && marketplaceSource.includes("SellerPayoutV2") && marketplaceSource.includes("PlatformPayoutV2");
  // V2 retry currently re-dispatches buyer funds on bounce status alone. A bounce
  // candidate is not independent evidence that the previous transfer was returned.
  const unsafeBuyerRefundRetry = marketplaceSource.includes("RetryPayoutV2 =>") &&
    marketplaceSource.includes("order.deliveryStatus == 3 && order.refundStatus == 3") &&
    marketplaceSource.includes("BuyerRefundV2 {");
  return {
    contractFound: true,
    unsafeBuyerRefundRetry,
    hasPurchaseHandler,
    hasNftReleaseHandler,
    hasSettlementHandler,
    ownerAttestationOnly,
    ownerAttestedReceipt,
    testnetDeploymentApproved: false,
    liveRefundTestApproved: false,
    liveRetryApproved: false,
    mainnetApproved: false,
    reasons: [
      ...(ownerAttestationOnly ? ["OWNER_ATTESTED_RETURN_CAN_TRIGGER_RETRY"] : []),
      ...(ownerAttestedReceipt ? ["OWNER_ATTESTED_RECEIPT_NOT_CHAIN_PROOF"] : []),
      ...(!hasPurchaseHandler ? ["NO_ONCHAIN_PURCHASE_HANDLER"] : []),
      ...(!hasNftReleaseHandler ? ["NO_NFT_DELIVERY_HANDLER"] : []),
      ...(!hasSettlementHandler ? ["NO_SELLER_FEE_SETTLEMENT_HANDLER"] : []),
      ...(unsafeBuyerRefundRetry ? ["V2_BUYER_REFUND_RETRY_LACKS_INDEPENDENT_RETURN_PROOF"] : []),
      "V3_VAULT_NOT_INTEGRATED_WITH_V2_PURCHASE_SETTLEMENT",
      "NO_INDEPENDENT_ONCHAIN_SETTLEMENT_PROOF",
      "NO_ATOMIC_ONCHAIN_REFUND_IDEMPOTENCY_PROOF",
    ],
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) ===
    process.argv[1]) {
  const result = inspectV3TestnetReadiness(
    readFileSync(contractPath, "utf8"),
    readFileSync(marketplacePath, "utf8"),
    readFileSync(escrowPath, "utf8"),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.testnetDeploymentApproved) process.exitCode = 1;
}
