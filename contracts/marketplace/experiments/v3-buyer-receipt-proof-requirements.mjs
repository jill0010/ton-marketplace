// Testnet receipt proof requirements, not a chain-proof verifier.
// A caller-provided hash, RPC response, or "verified" boolean cannot satisfy
// inclusion, validator signatures, masterchain anchoring, and finality.
const raw = (x) => typeof x === "string" && /^(?:-1|0):[a-fA-F0-9]{64}$/.test(x);
const uint = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);
const nonzero = (x) => uint(x) && BigInt(x) > 0n;

export function inspectV3BuyerReceiptProofRequirements({
  network, vault, buyer, orderId, queryId, amountNano, dispatch,
  receipt, independentVerifier,
} = {}) {
  if (network !== "testnet" || !raw(vault) || !raw(buyer) ||
      vault.toLowerCase() === buyer.toLowerCase() ||
      !uint(orderId) || !nonzero(queryId) || !nonzero(amountNano)) {
    throw new TypeError("Invalid testnet refund identity");
  }
  const reasons = [];
  if (!dispatch || dispatch.account?.toLowerCase() !== vault.toLowerCase() ||
      !nonzero(dispatch.lt) || !dispatch.transactionHash || !dispatch.messageHash) {
    reasons.push("MISSING_VAULT_DISPATCH_IDENTITY");
  }
  if (!receipt || receipt.account?.toLowerCase() !== buyer.toLowerCase() ||
      !nonzero(receipt.lt) || !receipt.transactionHash ||
      !receipt.inboundMessageHash || receipt.inboundMessageHash !== dispatch?.messageHash) {
    reasons.push("MISSING_MATCHING_BUYER_RECEIPT_IDENTITY");
  }
  if (receipt?.amountNano !== amountNano || receipt?.orderId !== orderId ||
      receipt?.queryId !== queryId || receipt?.source?.toLowerCase() !== vault.toLowerCase() ||
      receipt?.bounced !== false || receipt?.aborted !== false) {
    reasons.push("MISSING_EXACT_RECEIPT_EXECUTION_AND_AMOUNT");
  }
  if (!independentVerifier || independentVerifier.kind !== "audited-ton-lite-proof-verifier" ||
      independentVerifier.masterchainAnchorVerified !== true ||
      independentVerifier.dispatchInclusionVerified !== true ||
      independentVerifier.receiptInclusionVerified !== true ||
      independentVerifier.finalityVerified !== true) {
    reasons.push("MISSING_INDEPENDENT_CRYPTOGRAPHIC_INCLUSION_AND_FINALITY");
  }
  // This inspection accepts only descriptions. Even a perfect self-reported
  // object is NOT a proof. Only a separately audited verifier, not implemented
  // here, may set an authoritative settlement decision.
  return {
    requirementsDescribed: reasons.length === 0,
    reasons: reasons.length ? reasons : ["SELF_REPORTED_PROOF_NOT_AUTHENTICATED"],
    proofStatus: "UNVERIFIED",
    cryptographicInclusionVerified: false,
    finalized: false,
    verifiedBuyerCreditNano: "0",
    mayConfirmReceipt: false,
    mayRetry: false,
    mayReleaseFunds: false,
    mayDeployMainnet: false,
  };
}
