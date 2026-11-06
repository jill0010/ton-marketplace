// Fail-closed deployment preflight for experimental V3.
// Static source check is a blocker, NOT an audit or chain proof.
// Do not inject mnemonic, RPC key, or send any transactions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const contractPath = fileURLToPath(new URL("../contracts/TestReserveVault.tolk", import.meta.url));
const marketplacePath = fileURLToPath(new URL("../contracts/Marketplace.tolk", import.meta.url));
const escrowPath = fileURLToPath(new URL("../contracts/NFTEscrow.tolk", import.meta.url));
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
  // These are explicit blockers, not evidence that a matched opcode is secure.
  // Full purchase/delivery/payout still requires end-to-end contract tests and audit.
  const hasPurchaseHandler = /\|\s*(?:BuyProduct|PurchaseProduct|PurchaseNft)\b/.test(marketplaceSource) &&
    /(?:BuyProduct|PurchaseProduct|PurchaseNft)\s*=>/.test(marketplaceSource);
  const hasNftReleaseHandler = /\|\s*(?:ReleaseNft|ReleaseNFT|DeliverNft)\b/.test(escrowSource) &&
    /(?:ReleaseNft|ReleaseNFT|DeliverNft)\s*=>/.test(escrowSource);
  const hasSettlementHandler = /\|\s*(?:SettlePurchase|SettleSale|FinalizePurchase)\b/.test(marketplaceSource) &&
    /(?:SettlePurchase|SettleSale|FinalizePurchase)\s*=>/.test(marketplaceSource);
  return {
    contractFound: true,
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
