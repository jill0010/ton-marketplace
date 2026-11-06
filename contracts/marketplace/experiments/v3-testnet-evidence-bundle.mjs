// Offline, read-only validation of a V3 testnet evidence bundle.
// No private keys, RPC calls, deployment or transaction broadcasting.
// A self-reported evidence bundle can never be upgraded to chain proof.
import { auditV3RefundReleaseGate } from "./v3-refund-release-gate.mjs";

const raw = (x) => typeof x === "string" && /^(?:-1|0):[a-fA-F0-9]{64}$/.test(x);
const hash = (x) => typeof x === "string" &&
  (/^[a-fA-F0-9]{64}$/.test(x) || /^[A-Za-z0-9+/]{43}=$/.test(x));
const decimal = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);

export function auditV3TestnetEvidenceBundle(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle) ||
      bundle.network !== "-3" || !raw(bundle.vault) || !raw(bundle.buyer) ||
      bundle.vault.toLowerCase() === bundle.buyer.toLowerCase() ||
      !decimal(bundle.orderId) || !decimal(bundle.queryId) ||
      BigInt(bundle.queryId) === 0n ||
      !Array.isArray(bundle.transactions) || bundle.transactions.length > 128) {
    throw new TypeError("Invalid V3 testnet evidence bundle");
  }
  const seen = new Set();
  const seenHashes = new Set();
  const reasons = [];
  for (const item of bundle.transactions) {
    if (!item || !hash(item.hash) || !decimal(item.lt) ||
        !["funding", "dispatch", "buyer_receipt", "bounce", "fee"].includes(item.role) ||
        !raw(item.account)) throw new TypeError("Invalid testnet transaction identity");
    const key = item.account.toLowerCase() + ":" + item.lt;
    if (seen.has(key)) reasons.push("DUPLICATE_ACCOUNT_LT");
    seen.add(key);
    const canonicalHash = item.hash.toLowerCase();
    if (seenHashes.has(canonicalHash)) reasons.push("DUPLICATE_TRANSACTION_HASH");
    seenHashes.add(canonicalHash);
    if (item.role === "funding" && item.account.toLowerCase() !== bundle.vault.toLowerCase()) {
      reasons.push("FUNDING_ACCOUNT_MISMATCH");
    }
    if (item.role === "dispatch" && item.account.toLowerCase() !== bundle.vault.toLowerCase()) {
      reasons.push("DISPATCH_ACCOUNT_MISMATCH");
    }
    if (item.role === "buyer_receipt" && item.account.toLowerCase() !== bundle.buyer.toLowerCase()) {
      reasons.push("RECEIPT_ACCOUNT_MISMATCH");
    }
    if (item.role === "bounce" && item.account.toLowerCase() !== bundle.vault.toLowerCase()) {
      reasons.push("BOUNCE_ACCOUNT_MISMATCH");
    }
  }
  if (!bundle.transactions.length) reasons.push("MISSING_TESTNET_TRANSACTIONS");
  if (!bundle.independentChainProof) reasons.push("MISSING_INDEPENDENT_CHAIN_PROOF");
  // A JSON object claiming to contain independent proof is not proof.
  if (bundle.independentChainProof) reasons.push("UNVERIFIED_SELF_REPORTED_CHAIN_PROOF");
  return {
    network: "-3", orderId: bundle.orderId, queryId: bundle.queryId,
    transactionCount: bundle.transactions.length,
    reasons: [...new Set(reasons)],
    evidenceStatus: "UNVERIFIED_TESTNET_BUNDLE",
    mayConfirmReceipt: false, mayConfirmBounce: false,
    mayRetry: false, mayReleaseFunds: false, mayDeployMainnet: false,
  };
}

export function auditV3TestnetBundleWithSettlement(bundle, settlement, ledger) {
  const evidence = auditV3TestnetEvidenceBundle(bundle);
  if (settlement?.orderId !== bundle.orderId ||
      settlement?.queryId !== bundle.queryId ||
      settlement?.vault?.toLowerCase() !== bundle.vault.toLowerCase() ||
      settlement?.buyer?.toLowerCase() !== bundle.buyer.toLowerCase()) {
    throw new TypeError("Testnet bundle does not match settlement identity");
  }
  const gate = auditV3RefundReleaseGate({ settlement, ledger });
  return {
    ...evidence,
    accountingBalanced: gate.accountingBalanced,
    reasons: [...new Set([...evidence.reasons, ...gate.reasons])],
    releaseStatus: "BLOCKED_UNVERIFIED",
    mayConfirmReceipt: false, mayConfirmBounce: false,
    mayRetry: false, mayReleaseFunds: false, mayDeployMainnet: false,
  };
}
